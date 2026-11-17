// Errores inesperados en /api/fracciones y /api/ubicaciones (app real, services reales, Prisma mockeado).
//
// Defecto caracterizado (Block 0, final hardening): fraccion.controller (obtenerTodas) y
// ubicacion.controller (obtenerTodas, obtenerUbicacionPorId) atrapan el error y responden ellos
// mismos 500 con `error.message`, sin pasar por el handler global: el mensaje interno sale por HTTP.
//
// Contrato objetivo: error inesperado → 500 genérico sin detalle interno. Los errores de dominio
// (p. ej. 404 'Ubicación no encontrada') conservan su status y mensaje.
jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: {
        fraccion: { findMany: jest.fn(), count: jest.fn() },
        ubicacion: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
    },
}));

import request from 'supertest';
import app from '../../../src/app';
import prismaReal from '../../../src/config/prisma';
import { authHeader, useTestWebEnv } from '../../support/http';
import { errorSensible, expectRespuestaSegura500 } from '../../support/sensitiveErrors';

const prisma = prismaReal as unknown as {
    fraccion: Record<'findMany' | 'count', jest.Mock>;
    ubicacion: Record<'findMany' | 'count' | 'findUnique', jest.Mock>;
};

useTestWebEnv();

const ADMIN = authHeader('ADMINISTRADOR');

let consoleError: jest.SpyInstance;
beforeEach(() => {
    jest.clearAllMocks();
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
    consoleError.mockRestore();
});

describe('GET /api/fracciones — falla inesperada de la DB', () => {
    test('responde 500 genérico, sin mensaje interno', async () => {
        const err = errorSensible();
        prisma.fraccion.findMany.mockRejectedValue(err);
        prisma.fraccion.count.mockResolvedValue(0);

        const res = await request(app).get('/api/fracciones').set(ADMIN);

        expectRespuestaSegura500(res, err);
    });
});

describe('GET /api/ubicaciones — falla inesperada de la DB', () => {
    test('listado: responde 500 genérico, sin mensaje interno', async () => {
        const err = errorSensible();
        prisma.ubicacion.findMany.mockRejectedValue(err);
        prisma.ubicacion.count.mockResolvedValue(0);

        const res = await request(app).get('/api/ubicaciones').set(ADMIN);

        expectRespuestaSegura500(res, err);
    });

    test('por id: responde 500 genérico, sin mensaje interno', async () => {
        const err = errorSensible();
        prisma.ubicacion.findUnique.mockRejectedValue(err);

        const res = await request(app).get('/api/ubicaciones/3').set(ADMIN);

        expectRespuestaSegura500(res, err);
    });

    test('por id inexistente: el 404 de dominio conserva status y mensaje', async () => {
        prisma.ubicacion.findUnique.mockResolvedValue(null);

        const res = await request(app).get('/api/ubicaciones/3').set(ADMIN);

        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe('Ubicación no encontrada');
    });
});
