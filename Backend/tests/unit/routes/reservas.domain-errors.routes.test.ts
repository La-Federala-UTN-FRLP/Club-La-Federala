// Errores de dominio de Reservas lanzados sin status (app real, service real, Prisma mockeado).
//
// Defecto caracterizado (Block 0, final hardening): reserva.service lanza `new Error(...)` sin
// status en cuatro ramas de dominio. El handler global los trata como inesperados: 500
// "Error interno." y el usuario pierde el motivo.
//
// Contrato objetivo (las reglas de negocio no cambian, solo el status):
// - lote inexistente al crear reserva         → 404 (como el resto de los not-found)
// - lote no disponible para reservar          → 400 (como assertLoteOperableFor)
// - INMOBILIARIA sin tenant al crear reserva  → 403 (como Prioridades y Personas)
// - reserva inexistente al crear una oferta   → 404
// En todos los casos la operación no escribe nada.
jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: {
        lote: { findUnique: jest.fn() },
        reserva: { findFirst: jest.fn(), findUnique: jest.fn() },
        persona: { findUnique: jest.fn() },
        prioridad: { findFirst: jest.fn() },
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
    reserva: Record<'findFirst' | 'findUnique', jest.Mock>;
    persona: Record<'findUnique', jest.Mock>;
    prioridad: Record<'findFirst', jest.Mock>;
    $transaction: jest.Mock;
};

useTestWebEnv();

const ADMIN = authHeader('ADMINISTRADOR');
// Usuario INMOBILIARIA vigente pero sin inmobiliaria vinculada (sin tenant).
const INMO_SIN_TENANT = authHeader('INMOBILIARIA');

const LOTE_ID = 10;
const CLIENTE_ID = 20;
const bodyReserva = {
    fechaReserva: '2026-12-01T00:00:00.000Z',
    fechaFinReserva: '2026-12-31T00:00:00.000Z',
    loteId: LOTE_ID,
    clienteId: CLIENTE_ID,
    numero: 'R-0001',
    ofertaInicial: 1000,
};

let consoleError: jest.SpyInstance;
beforeEach(() => {
    jest.clearAllMocks();
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
    consoleError.mockRestore();
});

describe('POST /api/reservas — errores de dominio', () => {
    test('lote inexistente → 404 con el motivo', async () => {
        prisma.lote.findUnique.mockResolvedValue(null);

        const res = await request(app).post('/api/reservas').set(ADMIN).send(bodyReserva);

        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/Lote no encontrado/);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test('lote operable pero no reservable (RESERVADO) → 400 con el motivo', async () => {
        prisma.lote.findUnique.mockResolvedValue({ id: LOTE_ID, estado: 'RESERVADO' });

        const res = await request(app).post('/api/reservas').set(ADMIN).send(bodyReserva);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/no está disponible para reservar/);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test('INMOBILIARIA sin tenant → 403 con el motivo', async () => {
        prisma.lote.findUnique.mockResolvedValue({ id: LOTE_ID, estado: 'DISPONIBLE' });
        prisma.reserva.findFirst.mockResolvedValue(null);
        prisma.persona.findUnique.mockResolvedValue({ id: CLIENTE_ID, estadoOperativo: 'OPERATIVO' });

        const res = await request(app).post('/api/reservas').set(INMO_SIN_TENANT).send(bodyReserva);

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/no tiene una inmobiliaria asociada/);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    // Misma condición de autorización en la rama de lote CON_PRIORIDAD de una inmobiliaria:
    // respondía 400; se alinea a 403 como la rama general.
    test('INMOBILIARIA sin tenant sobre lote CON_PRIORIDAD de una inmobiliaria → 403', async () => {
        prisma.lote.findUnique.mockResolvedValue({ id: LOTE_ID, estado: 'CON_PRIORIDAD' });
        prisma.reserva.findFirst.mockResolvedValue(null);
        prisma.prioridad.findFirst.mockResolvedValue({
            id: 3,
            ownerType: 'INMOBILIARIA',
            inmobiliariaId: 7,
            inmobiliaria: { id: 7, nombre: 'Inmobiliaria Dueña' },
        });

        const res = await request(app).post('/api/reservas').set(INMO_SIN_TENANT).send(bodyReserva);

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/no tiene una inmobiliaria asociada/);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
});

describe('POST /api/reservas — P2002 real del cliente generado', () => {
    // El mapper local de reserva.service reconoce el error del cliente generado y conserva su
    // mensaje de dominio (antes importaba la clase de otro runtime y nunca matcheaba).
    test('número de reserva duplicado → 409 con el mensaje de dominio', async () => {
        prisma.lote.findUnique.mockResolvedValue({ id: LOTE_ID, estado: 'DISPONIBLE' });
        prisma.reserva.findFirst.mockResolvedValue(null);
        prisma.persona.findUnique.mockResolvedValue({ id: CLIENTE_ID, estadoOperativo: 'OPERATIVO' });
        prisma.$transaction.mockRejectedValue(
            new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`numero`)', {
                code: 'P2002',
                clientVersion: '6.18.0',
                meta: { target: ['numero'] },
            }),
        );

        const res = await request(app).post('/api/reservas').set(ADMIN).send(bodyReserva);

        expect(res.status).toBe(409);
        expect(res.body).toEqual({ success: false, code: 'CONFLICT', message: 'Ya existe una reserva con este número' });
    });
});

describe('POST /api/reservas/:id/ofertas — reserva inexistente', () => {
    test('→ 404 con el motivo', async () => {
        prisma.reserva.findUnique.mockResolvedValue(null);

        const res = await request(app).post('/api/reservas/99/ofertas').set(ADMIN).send({ monto: 1500 });

        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/Reserva no encontrada/);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
});
