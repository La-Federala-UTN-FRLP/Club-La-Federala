// cancelActivesOnNoDisponible (Prisma mockeado).
// Bug QA 24: las ventas que cancela al pasar el lote a No Disponible quedan con fecha y motivo.
// (Una venta en curso operativa ya bloquea antes el pase a No Disponible en updatedLote.)
jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: {
        venta: { updateMany: jest.fn() },
        reserva: { updateMany: jest.fn() },
        prioridad: { updateMany: jest.fn() },
    },
}));

import prismaReal from '../../../src/config/prisma';
import type { Prisma } from '../../../src/generated/prisma';
import {
    cancelActivesOnNoDisponible,
    cancelPrioridadActivaOnReserva,
    MOTIVO_CANCELACION_LOTE_NO_DISPONIBLE,
} from '../../../src/domain/loteState/loteState.effects';

const prisma = prismaReal as unknown as {
    venta: { updateMany: jest.Mock };
    reserva: { updateMany: jest.Mock };
    prioridad: { updateMany: jest.Mock };
};

beforeEach(() => jest.clearAllMocks());

describe('cancelActivesOnNoDisponible', () => {
    test('las ventas en curso que cancela quedan con fechaCancelacion y motivoCancelacion', async () => {
        await cancelActivesOnNoDisponible(4);

        expect(prisma.venta.updateMany).toHaveBeenCalledWith({
            where: { loteId: 4, estado: { in: ['INICIADA', 'CON_BOLETO'] } },
            data: {
                estado: 'CANCELADA',
                fechaCancelacion: expect.any(Date),
                motivoCancelacion: MOTIVO_CANCELACION_LOTE_NO_DISPONIBLE,
            },
        });
        expect(MOTIVO_CANCELACION_LOTE_NO_DISPONIBLE).toBe('Lote pasado a No Disponible');
    });

    test('reservas y prioridades ACTIVA se cancelan como antes', async () => {
        await cancelActivesOnNoDisponible(4);

        expect(prisma.reserva.updateMany).toHaveBeenCalledWith({
            where: { loteId: 4, estado: 'ACTIVA' },
            data: { estado: 'CANCELADA' },
        });
        expect(prisma.prioridad.updateMany).toHaveBeenCalledWith({
            where: { loteId: 4, estado: 'ACTIVA' },
            data: { estado: 'CANCELADA' },
        });
    });
});

// Revisión de la PR 368: la reserva finaliza la prioridad dentro de su propia transacción.
describe('cancelPrioridadActivaOnReserva', () => {
    test('finaliza la prioridad ACTIVA con el tx recibido, no con el prisma global', async () => {
        const tx = { prioridad: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };

        await cancelPrioridadActivaOnReserva(7, tx as unknown as Prisma.TransactionClient);

        expect(tx.prioridad.updateMany).toHaveBeenCalledWith({
            where: { loteId: 7, estado: 'ACTIVA' },
            data: { estado: 'FINALIZADA' },
        });
        expect(prisma.prioridad.updateMany).not.toHaveBeenCalled();
    });
});
