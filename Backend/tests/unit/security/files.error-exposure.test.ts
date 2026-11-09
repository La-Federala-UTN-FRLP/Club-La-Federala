// Exposición de errores inesperados en /api/files.
//
// Regresión: los catches de file.controller respondían 500 con el objeto de error serializado
// ({ message, error }) o con error.message, y POST upload devolvía 400 con el mensaje de cualquier
// error de la validación venta↔lote (aunque fuera una caída de la DB). Purge decidía 404 si el
// texto del mensaje contenía "encontrado". Eso puede filtrar metadata de Prisma/Supabase,
// mensajes internos y la estructura del provider.
//
// Contrato: error inesperado → 500 con un mensaje público genérico, sin objeto error, sin stack
// y sin metadata. Los errores de dominio con statusCode 4xx conservan su status y mensaje.
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
    uploadFileToSupabase: jest.fn(),
    saveFileMetadata: jest.fn(),
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
const db = prisma as any;

useTestWebEnv();

const MARKER = 'SECRET-MARKER-7f3a';
const META_MARKER = 'PROVIDER-META-91bc';
const DSN = 'postgres://admin:hunter2@10.0.0.5:5432/federala';

/** Error artificial con todo lo que no debe salir por HTTP. */
function errorSensible(mensajeExtra = ''): Error {
    const err = new Error(`${MARKER} ${DSN} ${mensajeExtra}`.trim());
    Object.assign(err, {
        code: 'P1001',
        clientVersion: '6.18.0',
        meta: { provider: 'supabase-storage', bucket: 'privado', detail: META_MARKER },
    });
    return err;
}

function expectRespuestaSegura(res: request.Response, err: Error) {
    expect(res.status).toBe(500);
    expect(res.body).not.toHaveProperty('error');
    expect(res.body).not.toHaveProperty('stack');
    expect(typeof res.body.message).toBe('string');
    const texto = JSON.stringify(res.body) + res.text;
    for (const sensible of [MARKER, META_MARKER, DSN, 'hunter2', 'supabase-storage', 'P1001', 'clientVersion']) {
        expect(texto).not.toContain(sensible);
    }
    const primerFrame = (err.stack ?? '').split('\n')[1]?.trim();
    if (primerFrame) expect(texto).not.toContain(primerFrame);
}

const ADMIN = authHeader('ADMINISTRADOR');
const INMO = authHeader('INMOBILIARIA', 7);
const PDF = Buffer.from('%PDF-1.4 contenido de prueba');
const adjuntarPdf = (req: request.Test) => req.attach('file', PDF, { filename: 'doc.pdf', contentType: 'application/pdf' });

let consoleError: jest.SpyInstance;
beforeEach(() => {
    // El detalle interno puede ir al log del servidor; acá solo se silencia la salida.
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    db.archivos.findUnique.mockResolvedValue({ id: 7, tipo: 'PLANO', ventaId: null, estadoOperativo: 'OPERATIVO', linkArchivo: 'lote-3/PLANO/x.pdf' });
    db.venta.findUnique.mockResolvedValue({ inmobiliariaId: 7, loteId: 3 });
    service.getOperativeFileRaw.mockResolvedValue({ id: 7, tipo: 'PLANO', ventaId: null, estadoOperativo: 'OPERATIVO', linkArchivo: 'lote-3/PLANO/x.pdf' });
});

afterEach(() => {
    consoleError.mockRestore();
});

type Caso = [string, () => void, () => request.Test];

const CASOS: Caso[] = [
    ['GET /lote/:id', () => service.listByLote.mockRejectedValue(errorSensible()), () => request(app).get('/api/files/lote/3').set(ADMIN)],
    ['GET /venta/:ventaId', () => service.listByVenta.mockRejectedValue(errorSensible()), () => request(app).get('/api/files/venta/21').set(ADMIN)],
    [
        'GET /venta/:ventaId (lookup de venta de INMOBILIARIA)',
        () => db.venta.findUnique.mockRejectedValue(errorSensible()),
        () => request(app).get('/api/files/venta/21').set(INMO),
    ],
    ['GET /:id', () => service.getFileById.mockRejectedValue(errorSensible()), () => request(app).get('/api/files/7').set(ADMIN)],
    ['POST /:id/url (lectura del registro)', () => service.getOperativeFileRaw.mockRejectedValue(errorSensible()), () => request(app).post('/api/files/7/url').set(ADMIN)],
    ['POST /:id/url (firma en storage)', () => service.generateSignedUrl.mockRejectedValue(errorSensible()), () => request(app).post('/api/files/7/url').set(ADMIN)],
    [
        'POST / (storage)',
        () => service.uploadFileToSupabase.mockRejectedValue(errorSensible()),
        () => adjuntarPdf(request(app).post('/api/files').set(ADMIN).field('idLoteAsociado', '3').field('tipo', 'PLANO')),
    ],
    [
        'POST / (validación venta↔lote con la DB caída)',
        () => db.venta.findUnique.mockRejectedValue(errorSensible()),
        () => adjuntarPdf(request(app).post('/api/files').set(ADMIN).field('idLoteAsociado', '3').field('tipo', 'BOLETO').field('ventaId', '21')),
    ],
    ['POST /:id/sustituir', () => service.sustituirArchivo.mockRejectedValue(errorSensible()), () => adjuntarPdf(request(app).post('/api/files/7/sustituir').set(ADMIN))],
    ['DELETE /:id', () => service.deleteFileById.mockRejectedValue(errorSensible()), () => request(app).delete('/api/files/7').set(ADMIN)],
    ['POST /:id/restore', () => service.restoreFileById.mockRejectedValue(errorSensible()), () => request(app).post('/api/files/7/restore').set(ADMIN)],
    [
        'PATCH /:id/aprobaciones',
        () => service.updateAprobacionPlano.mockRejectedValue(errorSensible()),
        () => request(app).patch('/api/files/7/aprobaciones').set(ADMIN).send({ target: 'COMISION', estado: 'APROBADO' }),
    ],
    ['DELETE /:id/purge', () => service.purgeFileById.mockRejectedValue(errorSensible()), () => request(app).delete('/api/files/7/purge').set(ADMIN)],
    [
        'DELETE /:id/purge (mensaje interno que contiene "encontrado")',
        () => service.purgeFileById.mockRejectedValue(errorSensible('objeto no encontrado en réplica')),
        () => request(app).delete('/api/files/7/purge').set(ADMIN),
    ],
];

describe.each(CASOS)('%s — error inesperado', (_nombre, preparar, enviar) => {
    test('500 genérico sin objeto error, stack, mensaje interno ni metadata', async () => {
        preparar();
        const res = await enviar();
        const err = errorSensible();
        expectRespuestaSegura(res, err);
    });
});

describe('errores de dominio conocidos conservan status y mensaje', () => {
    const errorHttp = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });

    test.each([
        ['POST /:id/sustituir', 'sustituirArchivo', 404, 'Archivo no encontrado', () => adjuntarPdf(request(app).post('/api/files/7/sustituir').set(ADMIN))],
        ['DELETE /:id', 'deleteFileById', 400, 'El archivo ya está eliminado', () => request(app).delete('/api/files/7').set(ADMIN)],
        ['POST /:id/restore', 'restoreFileById', 400, 'Solo se pueden restaurar archivos eliminados', () => request(app).post('/api/files/7/restore').set(ADMIN)],
        [
            'PATCH /:id/aprobaciones',
            'updateAprobacionPlano',
            403,
            'No tenés permiso para modificar la aprobación de MUNICIPIO',
            () => request(app).patch('/api/files/7/aprobaciones').set(ADMIN).send({ target: 'MUNICIPIO', estado: 'APROBADO' }),
        ],
        ['DELETE /:id/purge', 'purgeFileById', 404, 'Archivo no encontrado', () => request(app).delete('/api/files/7/purge').set(ADMIN)],
        [
            'POST / (storage: path duplicado)',
            'uploadFileToSupabase',
            409,
            'El archivo ya existe en storage (path duplicado). Reintente.',
            () => adjuntarPdf(request(app).post('/api/files').set(ADMIN).field('idLoteAsociado', '3').field('tipo', 'PLANO')),
        ],
    ] as const)('%s → %s', async (_nombre, metodo, status, message, enviar) => {
        service[metodo].mockRejectedValue(errorHttp(message, status));
        const res = await enviar();
        expect(res.status).toBe(status);
        expect(res.body).toEqual({ message });
    });

    test('POST / con venta de otro lote conserva el 400 de dominio', async () => {
        db.venta.findUnique.mockResolvedValue({ loteId: 99 });
        const res = await adjuntarPdf(request(app).post('/api/files').set(ADMIN).field('idLoteAsociado', '3').field('tipo', 'BOLETO').field('ventaId', '21'));
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ message: 'La venta no pertenece al mismo lote que idLoteAsociado' });
    });
});
