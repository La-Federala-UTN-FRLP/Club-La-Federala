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
import { authHeader, useTestWebEnv } from '../../support/http';

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

const IDS_INVALIDOS = ['abc', '5abc', '1.5', '-1', '1e2', '0x10', '0'];

describe.each(RUTAS)('%s — id inválido', (_nombre, build, target) => {
    test.each(IDS_INVALIDOS)('"%s" responde 400 sin llegar al service ni a Prisma', async (id) => {
        const res = await build(id).set(ADMIN);
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

    test.each([['tipo=FOO'], ['tipo=boleto'], ['includeDeleted=yes'], ['tipo=BOLETO&tipo=OTRO']])(
        'query inválida (%s) responde 400 sin llamar al service',
        async (qs) => {
            const res = await request(app).get(`/api/files/venta/12?${qs}`).set(ADMIN);
            expect(res.status).toBe(400);
            expect(service.listByVenta).not.toHaveBeenCalled();
        },
    );
});

describe('RBAC sin cambios', () => {
    test('TECNICO no puede borrar archivos (403)', async () => {
        const res = await request(app).delete('/api/files/7').set(authHeader('TECNICO'));
        expect(res.status).toBe(403);
        expect(service.deleteFileById).not.toHaveBeenCalled();
    });
});
