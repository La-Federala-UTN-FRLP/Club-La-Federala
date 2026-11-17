// DELETE /api/lotes/:id — hard delete solo de lotes sin historia ni asociaciones.
// App real, service real, Prisma mockeado.
//
// Con ventas, reservas (y sus ofertas), prioridades, promociones, alquileres o archivos → 409 con el
// contrato D4 y sin ningún borrado. Una asociación que aparece entre el chequeo y el DELETE la rechaza
// la FK de la base; la respuesta es el mismo 409.
jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: {
        lote: { findUnique: jest.fn(), delete: jest.fn() },
        archivos: { deleteMany: jest.fn() },
        reserva: { deleteMany: jest.fn() },
        venta: { deleteMany: jest.fn() },
        $transaction: jest.fn(),
    },
}));

import request from 'supertest';
import app from '../../../src/app';
import prismaReal from '../../../src/config/prisma';
import { Prisma } from '../../../src/generated/prisma';
import { authHeader, useTestWebEnv } from '../../support/http';

type Mock = jest.Mock;
const prisma = prismaReal as unknown as {
    lote: { findUnique: Mock; delete: Mock };
    archivos: { deleteMany: Mock };
    reserva: { deleteMany: Mock };
    venta: { deleteMany: Mock };
    $transaction: Mock;
};

useTestWebEnv();

const ADMIN = authHeader('ADMINISTRADOR');
const SIN_ASOCIACIONES = { Venta: 0, reserva: 0, prioridad: 0, promociones: 0, alquileres: 0, archivos: 0 };
const CONFLICTO = {
    success: false,
    code: 'CONFLICT',
    message: 'No se puede eliminar el lote porque tiene operaciones o asociaciones registradas (ventas, reservas, prioridades, promociones, alquileres o archivos).',
};

beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
    prisma.lote.delete.mockResolvedValue({ id: 5 });
});

function expectSinBorrados() {
    expect(prisma.lote.delete).not.toHaveBeenCalled();
    expect(prisma.archivos.deleteMany).not.toHaveBeenCalled();
    expect(prisma.reserva.deleteMany).not.toHaveBeenCalled();
    expect(prisma.venta.deleteMany).not.toHaveBeenCalled();
}

test('lote sin asociaciones → 200 y solo se borra el lote', async () => {
    prisma.lote.findUnique.mockResolvedValue({ _count: SIN_ASOCIACIONES });

    const res = await request(app).delete('/api/lotes/5').set(ADMIN);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ success: true }));
    expect(prisma.lote.delete).toHaveBeenCalledWith({ where: { id: 5 } });
    expect(prisma.archivos.deleteMany).not.toHaveBeenCalled();
    expect(prisma.reserva.deleteMany).not.toHaveBeenCalled();
    expect(prisma.venta.deleteMany).not.toHaveBeenCalled();
});

test.each([
    ['una venta', { Venta: 1 }],
    ['una reserva (con o sin ofertas)', { reserva: 1 }],
    ['una prioridad', { prioridad: 1 }],
    ['una promoción', { promociones: 1 }],
    ['un alquiler', { alquileres: 1 }],
    ['un archivo', { archivos: 1 }],
])('lote con %s → 409 CONFLICT y el lote queda intacto', async (_caso, counts) => {
    prisma.lote.findUnique.mockResolvedValue({ _count: { ...SIN_ASOCIACIONES, ...counts } });

    const res = await request(app).delete('/api/lotes/5').set(ADMIN);

    expect(res.status).toBe(409);
    expect(res.body).toEqual(CONFLICTO);
    expectSinBorrados();
});

test('asociación creada entre el chequeo y el DELETE (FK de la base) → mismo 409, sin detalles internos', async () => {
    prisma.lote.findUnique.mockResolvedValue({ _count: SIN_ASOCIACIONES });
    prisma.lote.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Foreign key constraint violated: Reserva_loteId_fkey', {
            code: 'P2003',
            clientVersion: 'test',
            meta: { field_name: 'Reserva_loteId_fkey (index)' },
        }),
    );

    const res = await request(app).delete('/api/lotes/5').set(ADMIN);

    expect(res.status).toBe(409);
    expect(res.body).toEqual(CONFLICTO);
    expect(JSON.stringify(res.body)).not.toMatch(/fkey|Reserva_|P2003/);
});

test('lote inexistente → 404', async () => {
    prisma.lote.findUnique.mockResolvedValue(null);

    const res = await request(app).delete('/api/lotes/5').set(ADMIN);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, code: 'NOT_FOUND', message: 'Lote no encontrado' });
    expectSinBorrados();
});
