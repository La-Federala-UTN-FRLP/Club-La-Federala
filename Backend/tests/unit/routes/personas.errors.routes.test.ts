// Errores de /api/personas (app real + controller y service reales, Prisma mockeado).
//
// Defectos caracterizados (Block 0, final hardening):
// - persona.controller atrapa todo y responde él mismo con `statusCode || 400/404/500` y
//   `error.message`: una falla inesperada de la DB sale con status inventado (404 en GET /:id) y
//   con el mensaje interno.
// - Los mappers de persona.service y persona.controller importan PrismaClientKnownRequestError de
//   '@prisma/client/runtime/library', que NO es la clase del cliente generado: el `instanceof`
//   nunca matchea y un P2002 real sale como 400 con el mensaje crudo de Prisma.
//
// Contrato objetivo:
// - error inesperado → 500, mensaje público genérico, sin detalle interno;
// - P2002 al crear → 409 con el mensaje de dominio, sin el texto de Prisma.
jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: {
        persona: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
        inmobiliaria: { findUnique: jest.fn() },
    },
}));

import request from 'supertest';
import { PrismaClientKnownRequestError as RuntimeLibraryKnownRequestError } from '@prisma/client/runtime/library';
import app from '../../../src/app';
import prismaReal from '../../../src/config/prisma';
import { Prisma } from '../../../src/generated/prisma';
import { authHeader, useTestWebEnv } from '../../support/http';
import { errorSensible, expectRespuestaSegura500, expectSinTextos } from '../../support/sensitiveErrors';

const prisma = prismaReal as unknown as {
    persona: Record<'findUnique' | 'create' | 'update', jest.Mock>;
    inmobiliaria: Record<'findUnique', jest.Mock>;
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

describe('causa raíz: dos clases PrismaClientKnownRequestError distintas', () => {
    // Hecho de librería (verde hoy y después): explica por qué los mappers deben usar la clase del
    // cliente generado. Un error real del cliente generado no es instancia de la del runtime público.
    test('la clase del cliente generado no es la de @prisma/client/runtime/library', () => {
        expect(Prisma.PrismaClientKnownRequestError).not.toBe(RuntimeLibraryKnownRequestError);
        const err = new Prisma.PrismaClientKnownRequestError('x', { code: 'P2002', clientVersion: '6.18.0' });
        expect(err).not.toBeInstanceOf(RuntimeLibraryKnownRequestError);
    });
});

describe('GET /api/personas/:id — falla inesperada de la DB', () => {
    test('responde 500 genérico, sin mensaje interno ni metadata', async () => {
        const err = errorSensible('Invalid `prisma.persona.findUnique()` invocation');
        prisma.persona.findUnique.mockRejectedValue(err);

        const res = await request(app).get('/api/personas/5').set(ADMIN);

        expectRespuestaSegura500(res, err);
    });
});

describe('POST /api/personas — P2002 real del cliente generado', () => {
    const body = { identificadorTipo: 'DNI', identificadorValor: '12345678', nombre: 'Ana', apellido: 'Paz' };
    const MENSAJE_PRISMA =
        '\nInvalid `prisma.persona.create()` invocation:\n\n\nUnique constraint failed on the fields: (`identificadorTipo`,`identificadorValor`)';

    test('responde 409 con el mensaje de dominio, sin el texto crudo de Prisma', async () => {
        // Carrera: el chequeo previo no encuentra la persona, pero el INSERT choca con el unique.
        prisma.persona.findUnique.mockResolvedValue(null);
        prisma.persona.create.mockRejectedValue(
            new Prisma.PrismaClientKnownRequestError(MENSAJE_PRISMA, {
                code: 'P2002',
                clientVersion: '6.18.0',
                meta: { target: ['identificadorTipo', 'identificadorValor'] },
            }),
        );

        const res = await request(app).post('/api/personas').set(ADMIN).send(body);

        expect(res.status).toBe(409);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe('Ya existe una persona con ese identificador');
        expectSinTextos(res, ['Invalid `prisma', 'Unique constraint', 'P2002', 'identificadorTipo`']);
    });
});
