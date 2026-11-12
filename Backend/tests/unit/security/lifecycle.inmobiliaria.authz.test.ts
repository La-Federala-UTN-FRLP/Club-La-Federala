// Ciclo de vida operativo (eliminar/reactivar) de Reservas y Ventas según el rol
// (app real + services reales, Prisma mockeado).
//
// Reservas: INMOBILIARIA puede eliminar/reactivar las propias, nunca las de otro tenant.
// Ventas: eliminar/reactivar es solo de staff; INMOBILIARIA no entra ni siquiera a las propias.
jest.mock('../../../src/config/prisma', () => ({
    reserva: { findUnique: jest.fn(), update: jest.fn() },
    venta: { findUnique: jest.fn(), update: jest.fn() },
}));

import request from 'supertest';
import app from '../../../src/app';
import prismaReal from '../../../src/config/prisma';
import { authHeader, useTestWebEnv } from '../../support/http';

type Delegate = Record<'findUnique' | 'update', jest.Mock>;
const prisma = prismaReal as unknown as { reserva: Delegate; venta: Delegate };

useTestWebEnv();

const TENANT_PROPIO = 5;
const TENANT_AJENO = 9;

afterEach(() => {
    jest.clearAllMocks();
});

// Estado de partida válido para que la operación solo dependa de la autorización.
const ESTADO_PREVIO = {
    eliminar: { estadoOperativo: 'OPERATIVO' },
    reactivar: { estadoOperativo: 'ELIMINADO' },
} as const;

type Operacion = keyof typeof ESTADO_PREVIO;

describe('Reservas — INMOBILIARIA opera sobre las propias', () => {
    const INMO = authHeader('INMOBILIARIA', TENANT_PROPIO);

    function stubReserva(op: Operacion, inmobiliariaId: number) {
        prisma.reserva.findUnique.mockResolvedValue({ id: 40, estado: 'CANCELADA', inmobiliariaId, ...ESTADO_PREVIO[op] });
        prisma.reserva.update.mockResolvedValue({ id: 40, inmobiliariaId });
    }

    test.each([
        ['eliminar', TENANT_PROPIO, 200],
        ['reactivar', TENANT_PROPIO, 200],
        ['eliminar', TENANT_AJENO, 403],
        ['reactivar', TENANT_AJENO, 403],
    ] as const)('I tenant 5 → %s reserva del tenant %s → %s', async (op, tenantReserva, esperado) => {
        stubReserva(op, tenantReserva);

        const res = await request(app).patch(`/api/reservas/40/${op}`).set(INMO);

        expect(res.status).toBe(esperado);
        if (esperado === 200) {
            expect(prisma.reserva.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 40 } }));
        } else {
            expect(prisma.reserva.update).not.toHaveBeenCalled();
        }
    });
});

describe('Ventas — eliminar/reactivar es solo de staff', () => {
    function stubVenta(op: Operacion) {
        // Venta propia de la inmobiliaria del actor y en estado eliminable.
        prisma.venta.findUnique.mockResolvedValue({ id: 60, estado: 'CANCELADA', inmobiliariaId: TENANT_PROPIO, ...ESTADO_PREVIO[op] });
        prisma.venta.update.mockResolvedValue({ id: 60, inmobiliariaId: TENANT_PROPIO });
    }

    describe.each(['eliminar', 'reactivar'] as const)('PATCH /api/ventas/:id/%s', (op) => {
        test.each([
            ['ADMINISTRADOR', undefined, 200],
            ['GESTOR', undefined, 200],
            ['INMOBILIARIA', TENANT_PROPIO, 403],
            ['TECNICO', undefined, 403],
        ] as const)('%s → %s', async (role, tenant, esperado) => {
            stubVenta(op);

            const res = await request(app).patch(`/api/ventas/60/${op}`).set(authHeader(role, tenant));

            expect(res.status).toBe(esperado);
            if (esperado === 200) {
                expect(prisma.venta.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 60 } }));
            } else {
                expect(prisma.venta.findUnique).not.toHaveBeenCalled();
                expect(prisma.venta.update).not.toHaveBeenCalled();
            }
        });
    });
});
