// Contrato de params/query de las rutas activas de /api/files.
// Regresión: ningún id pasaba por Zod; los controllers hacían parseInt (5abc → 5, 1e2 → 1,
// -1 → -1) y en algunos casos sin chequear NaN. tipo de GET /venta/:ventaId llegaba
// crudo hasta Prisma.
jest.mock('../../../src/services/file.service', () => ({
    listByLote: jest.fn(),
    listByVenta: jest.fn(),
    sustituirArchivo: jest.fn(),
    getOperativeFileRaw: jest.fn(),
    generateSignedUrl: jest.fn(),
    getFileById: jest.fn(),
    deleteFileById: jest.fn(),
    restoreFileById: jest.fn(),
    updateAprobacionPlano: jest.fn(),
    purgeFileById: jest.fn(),
}));

jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: {
        archivos: { findUnique: jest.fn() },
        venta: { findUnique: jest.fn() },
    },
}));

import request from 'supertest';
import app from '../../../src/app';
import * as FileService from '../../../src/services/file.service';
import prisma from '../../../src/config/prisma';
import { authHeader, INVALID_PATH_IDS, useTestWebEnv } from '../../support/http';

const service = FileService as unknown as Record<string, jest.Mock>;
const archivosFindUnique = prisma.archivos.findUnique as jest.Mock;

useTestWebEnv();

beforeEach(() => {
    Object.values(service).filter((fn) => jest.isMockFunction(fn)).forEach((fn) => fn.mockReset());
    archivosFindUnique.mockReset();
    service.getFileById.mockResolvedValue({ id: 7, tipo: 'PLANO', ventaId: null, estadoOperativo: 'OPERATIVO' });
    service.listByVenta.mockResolvedValue([]);
    service.listByLote.mockResolvedValue([]);
    service.deleteFileById.mockResolvedValue(undefined);
});

const ADMIN = authHeader('ADMINISTRADOR');

// PDF mínimo aceptado por validateUploadFile: sin él, sustituir respondería 400 por falta de
// archivo y el test no distinguiría la validación del id.
const PDF = { buffer: Buffer.from('%PDF-1.4'), filename: 'doc.pdf', contentType: 'application/pdf' };

type Ruta = [string, (id: string) => request.Test, () => jest.Mock];

const RUTAS: Ruta[] = [
    ['GET /:id', (id) => request(app).get(`/api/files/${id}`), () => service.getFileById],
    ['POST /:id/url', (id) => request(app).post(`/api/files/${id}/url`), () => service.getOperativeFileRaw],
    ['POST /:id/restore', (id) => request(app).post(`/api/files/${id}/restore`), () => service.restoreFileById],
    ['DELETE /:id/purge', (id) => request(app).delete(`/api/files/${id}/purge`), () => archivosFindUnique],
    [
        'PATCH /:id/aprobaciones',
        (id) => request(app).patch(`/api/files/${id}/aprobaciones`).send({ target: 'COMISION', estado: 'APROBADO' }),
        () => service.updateAprobacionPlano,
    ],
    [
        'POST /:id/sustituir',
        (id) => request(app).post(`/api/files/${id}/sustituir`).attach('file', PDF.buffer, { filename: PDF.filename, contentType: PDF.contentType }),
        () => service.sustituirArchivo,
    ],
    ['DELETE /:id', (id) => request(app).delete(`/api/files/${id}`), () => service.deleteFileById],
    ['GET /venta/:ventaId', (id) => request(app).get(`/api/files/venta/${id}`), () => service.listByVenta],
    ['GET /lote/:idLoteAsociado', (id) => request(app).get(`/api/files/lote/${id}`), () => service.listByLote],
];

describe.each(RUTAS)('%s — id inválido', (_nombre, build, target) => {
    test.each(INVALID_PATH_IDS)('%j responde 400 sin llegar al service ni a Prisma', async (id) => {
        const res = await build(encodeURIComponent(id)).set(ADMIN);
        expect(res.status).toBe(400);
        expect(target()).not.toHaveBeenCalled();
    });
});

describe('ids válidos llegan como números', () => {
    test('GET /:id', async () => {
        const res = await request(app).get('/api/files/7').set(ADMIN);
        expect(res.status).toBe(200);
        expect(service.getFileById).toHaveBeenCalledWith(7);
    });

    test('GET /lote/:idLoteAsociado', async () => {
        await request(app).get('/api/files/lote/3').set(ADMIN);
        expect(service.listByLote).toHaveBeenCalledWith(3, false, expect.objectContaining({ role: 'ADMINISTRADOR' }));
    });

    test('DELETE /:id', async () => {
        await request(app).delete('/api/files/7').set(ADMIN);
        expect(service.deleteFileById).toHaveBeenCalledWith(7, 'test@example.com');
    });

    test('POST /:id/sustituir (con archivo válido)', async () => {
        service.sustituirArchivo.mockResolvedValue({ id: 8 });
        const res = await RUTAS[5][1]('7').set(ADMIN);
        expect(res.status).toBe(200);
        expect(service.sustituirArchivo).toHaveBeenCalledWith(7, expect.any(Buffer), 'doc.pdf', 'test@example.com', 'test@example.com');
    });

    test('POST /:id/url', async () => {
        service.getOperativeFileRaw.mockResolvedValue({ id: 7, linkArchivo: 'lotes/7/plano.pdf', tipo: 'PLANO', ventaId: null });
        const res = await request(app).post('/api/files/7/url').set(ADMIN);
        expect(res.status).toBe(200);
        expect(service.getOperativeFileRaw).toHaveBeenCalledWith(7);
    });

    test('POST /:id/restore', async () => {
        await request(app).post('/api/files/7/restore').set(ADMIN);
        expect(service.restoreFileById).toHaveBeenCalledWith(7);
    });

    test('DELETE /:id/purge', async () => {
        await request(app).delete('/api/files/7/purge').set(ADMIN);
        expect(archivosFindUnique).toHaveBeenCalledWith({ where: { id: 7 } });
    });

    test('PATCH /:id/aprobaciones', async () => {
        await RUTAS[4][1]('7').set(ADMIN);
        expect(service.updateAprobacionPlano).toHaveBeenCalledWith(7, 'COMISION', 'APROBADO', 'test@example.com', 'ADMINISTRADOR', undefined);
    });
});

describe('GET /api/files/venta/:ventaId — query', () => {
    test('tipo e includeDeleted válidos llegan al service', async () => {
        const res = await request(app).get('/api/files/venta/12?tipo=BOLETO&includeDeleted=true').set(ADMIN);
        expect(res.status).toBe(200);
        expect(service.listByVenta).toHaveBeenCalledWith(12, 'BOLETO', true);
    });

    test('sin query lista todos los tipos y sin eliminados', async () => {
        await request(app).get('/api/files/venta/12').set(ADMIN);
        expect(service.listByVenta).toHaveBeenCalledWith(12, undefined, false);
    });

    test('includeDeleted=false llega como boolean false', async () => {
        await request(app).get('/api/files/venta/12?includeDeleted=false').set(ADMIN);
        expect(service.listByVenta).toHaveBeenCalledWith(12, undefined, false);
    });

    test.each([
        ['tipo=FOO'],
        ['tipo=boleto'],
        ['includeDeleted=yes'],
        ['includeDeleted=1'],
        ['includeDeleted=0'],
        ['includeDeleted=TRUE'],
        ['includeDeleted='],
        ['includeDeleted=true&includeDeleted=false'],
        ['tipo=BOLETO&tipo=OTRO'],
    ])('query inválida (%s) responde 400 sin llamar al service', async (qs) => {
        const res = await request(app).get(`/api/files/venta/12?${qs}`).set(ADMIN);
        expect(res.status).toBe(400);
        expect(service.listByVenta).not.toHaveBeenCalled();
    });

    test('claves desconocidas no afectan la consulta', async () => {
        const res = await request(app).get('/api/files/venta/12?tipo=PLANO&foo=bar&page=2').set(ADMIN);
        expect(res.status).toBe(200);
        expect(service.listByVenta).toHaveBeenCalledWith(12, 'PLANO', false);
    });

    test('includeDeleted=true solo aplica a ADMINISTRADOR y GESTOR', async () => {
        await request(app).get('/api/files/venta/12?includeDeleted=true').set(authHeader('TECNICO'));
        expect(service.listByVenta).toHaveBeenCalledWith(12, undefined, false);
    });
});

// GET /lote/:idLoteAsociado no tenía validateQuery: el controller leía req.query.includeDeleted
// crudo, y "yes", "1" o "TRUE" respondían 200 con includeDeleted=false en silencio.
describe('GET /api/files/lote/:idLoteAsociado — query', () => {
    const lote = (qs = '', auth: Record<string, string> = ADMIN) => request(app).get(`/api/files/lote/3${qs}`).set(auth);
    const ADMIN_USER = expect.objectContaining({ role: 'ADMINISTRADOR' });

    test('sin query lista sin eliminados', async () => {
        const res = await lote();
        expect(res.status).toBe(200);
        expect(service.listByLote).toHaveBeenCalledWith(3, false, ADMIN_USER);
    });

    test('includeDeleted=true llega como boolean true (ADMINISTRADOR)', async () => {
        const res = await lote('?includeDeleted=true');
        expect(res.status).toBe(200);
        expect(service.listByLote).toHaveBeenCalledWith(3, true, ADMIN_USER);
    });

    test('includeDeleted=false llega como boolean false', async () => {
        await lote('?includeDeleted=false');
        expect(service.listByLote).toHaveBeenCalledWith(3, false, ADMIN_USER);
    });

    test.each([['GESTOR', true], ['TECNICO', false], ['INMOBILIARIA', false]])(
        'includeDeleted=true con rol %s se resuelve a %s (permiso sin cambios)',
        async (role, esperado) => {
            await lote('?includeDeleted=true', authHeader(role, 5));
            expect(service.listByLote).toHaveBeenCalledWith(3, esperado, expect.objectContaining({ role }));
        },
    );

    test.each([
        ['includeDeleted=yes'],
        ['includeDeleted=1'],
        ['includeDeleted=0'],
        ['includeDeleted=TRUE'],
        ['includeDeleted='],
        ['includeDeleted=true&includeDeleted=false'],
    ])('query inválida (%s) responde 400 sin llamar al service', async (qs) => {
        const res = await lote(`?${qs}`);
        expect(res.status).toBe(400);
        expect(res.body.errors).toEqual([expect.objectContaining({ field: 'includeDeleted' })]);
        expect(service.listByLote).not.toHaveBeenCalled();
    });

    test('includeDeleted[] es una clave desconocida bajo el parser simple: se descarta', async () => {
        const res = await lote('?includeDeleted[]=true');
        expect(res.status).toBe(200);
        expect(service.listByLote).toHaveBeenCalledWith(3, false, ADMIN_USER);
    });

    test('claves desconocidas no afectan la consulta', async () => {
        const res = await lote('?tipo=PLANO&foo=bar');
        expect(res.status).toBe(200);
        expect(service.listByLote).toHaveBeenCalledWith(3, false, ADMIN_USER);
    });

    test('el id de path se valida antes que la query', async () => {
        const res = await request(app).get('/api/files/lote/abc?includeDeleted=yes').set(ADMIN);
        expect(res.status).toBe(400);
        expect(res.body.errors).toEqual([expect.objectContaining({ field: 'idLoteAsociado' })]);
    });
});

describe('RBAC sin cambios', () => {
    test('TECNICO no puede borrar archivos (403)', async () => {
        const res = await request(app).delete('/api/files/7').set(authHeader('TECNICO'));
        expect(res.status).toBe(403);
        expect(service.deleteFileById).not.toHaveBeenCalled();
    });
});
