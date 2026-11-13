// Errores conocidos de Prisma en /api/prioridades (app real, service real, Prisma mockeado).
//
// El mapper local de prioridad.service importaba PrismaClientKnownRequestError de
// '@prisma/client/runtime/library', una clase distinta de la del cliente generado: el `instanceof`
// nunca matcheaba y el error caía en el mapeo genérico del handler global. Ahora reconoce el error
// real y conserva su mensaje de dominio.
jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: {
        lote: { findUnique: jest.fn() },
        prioridad: { findUnique: jest.fn(), findFirst: jest.fn() },
        $transaction: jest.fn(),
    },
}));

import request from 'supertest';
import app from '../../../src/app';
import prismaReal from '../../../src/config/prisma';
import { Prisma } from '../../../src/generated/prisma';
import { authHeader, useTestWebEnv } from '../../support/http';

const prisma = prismaReal as unknown as {
    lote: Record<'findUnique', jest.Mock>;
    prioridad: Record<'findUnique' | 'findFirst', jest.Mock>;
    $transaction: jest.Mock;
};

useTestWebEnv();

const ADMIN = authHeader('ADMINISTRADOR');

const body = {
    numero: 'P-0001',
    loteId: 10,
    fechaInicio: '2026-01-01T00:00:00.000Z',
    fechaFin: '2099-01-01T00:00:00.000Z',
};

function knownError(code: string, target?: string[]) {
    return new Prisma.PrismaClientKnownRequestError(`Prisma ${code}`, {
        code,
        clientVersion: '6.18.0',
        ...(target && { meta: { target } }),
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    // Pre-chequeos del service superados: lote libre, número libre, sin prioridad activa.
    prisma.lote.findUnique.mockResolvedValue({ id: 10, estado: 'DISPONIBLE' });
    prisma.prioridad.findUnique.mockResolvedValue(null);
    prisma.prioridad.findFirst.mockResolvedValue(null);
});

describe('POST /api/prioridades — error de Prisma en la transacción', () => {
    test('P2002 sobre numero (carrera) → 409 con el mensaje de dominio', async () => {
        prisma.$transaction.mockRejectedValue(knownError('P2002', ['numero']));

        const res = await request(app).post('/api/prioridades').set(ADMIN).send(body);

        expect(res.status).toBe(409);
        expect(res.body).toEqual({ success: false, code: 'CONFLICT', message: 'Ya existe una prioridad con este número' });
    });

    test('P2003 (referencia inexistente) → 409 con el mensaje de dominio', async () => {
        prisma.$transaction.mockRejectedValue(knownError('P2003'));

        const res = await request(app).post('/api/prioridades').set(ADMIN).send(body);

        expect(res.status).toBe(409);
        expect(res.body).toEqual({ success: false, code: 'CONFLICT', message: 'Alguna referencia (lote/inmobiliaria) no existe' });
    });
});
