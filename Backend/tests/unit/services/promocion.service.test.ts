// aplicarPromocion (service real, Prisma mockeado).
// - Bug QA 20: el precio promocional debe ser estrictamente menor al precio actual del lote (400).
// - Concurrencia: el lote pasa a EN_PROMOCION con un UPDATE condicionado a DISPONIBLE dentro de la
//   transacción; si otra operación lo cambió en el medio (otra promoción, una reserva), 409 sin crear.
const mockTx = {
    promocion: { create: jest.fn() },
    lote: { updateMany: jest.fn() },
};

jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: {
        lote: { findUnique: jest.fn() },
        promocion: { findFirst: jest.fn() },
        $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(mockTx)),
    },
}));

import prismaReal from '../../../src/config/prisma';
import { Prisma } from '../../../src/generated/prisma';
import { aplicarPromocion } from '../../../src/services/promocion.service';

type Mock = jest.Mock;
const prisma = prismaReal as unknown as {
    lote: { findUnique: Mock };
    promocion: { findFirst: Mock };
    $transaction: Mock;
};

const PRECIO_ACTUAL = new Prisma.Decimal('1000.00');
const MENSAJE_PRECIO = 'El precio promocional debe ser menor al precio actual del lote';

beforeEach(() => {
    jest.clearAllMocks();
    prisma.lote.findUnique.mockResolvedValue({ id: 5, estado: 'DISPONIBLE', precio: PRECIO_ACTUAL });
    prisma.promocion.findFirst.mockResolvedValue(null);
    mockTx.lote.updateMany.mockResolvedValue({ count: 1 });
    mockTx.promocion.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 1, ...data }));
});

describe('aplicarPromocion — precio promocional (bug QA 20)', () => {
    test('menor al precio actual → se aplica: crea la promoción y el lote queda EN_PROMOCION con ese precio', async () => {
        const promocion = await aplicarPromocion(5, { precioPromocional: 999.99 });

        expect(promocion).toEqual(expect.objectContaining({ id: 1, precioAnterior: PRECIO_ACTUAL, precioPromocional: 999.99 }));
        expect(mockTx.lote.updateMany).toHaveBeenCalledWith({
            where: { id: 5, estado: 'DISPONIBLE', precio: PRECIO_ACTUAL },
            data: { estado: 'EN_PROMOCION', precio: 999.99 },
        });
    });

    test.each([
        ['igual', 1000],
        ['mayor', 1000.01],
    ])('%s al precio actual → 400 sin abrir la transacción', async (_caso, precioPromocional) => {
        await expect(aplicarPromocion(5, { precioPromocional })).rejects.toMatchObject({
            statusCode: 400,
            message: MENSAJE_PRECIO,
        });
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(mockTx.promocion.create).not.toHaveBeenCalled();
    });
});

describe('aplicarPromocion — concurrencia', () => {
    test('el lote se marca EN_PROMOCION antes de crear la promoción', async () => {
        await aplicarPromocion(5, { precioPromocional: 800 });

        expect(mockTx.lote.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
            mockTx.promocion.create.mock.invocationCallOrder[0],
        );
    });

    test('si el lote ya no está DISPONIBLE al aplicar (otra promoción o reserva ganó) → 409 sin crear la promoción', async () => {
        mockTx.lote.updateMany.mockResolvedValue({ count: 0 });

        await expect(aplicarPromocion(5, { precioPromocional: 800 })).rejects.toMatchObject({
            statusCode: 409,
            message: expect.stringMatching(/ya no está disponible para aplicar la promoción/),
        });
        expect(mockTx.promocion.create).not.toHaveBeenCalled();
    });

    // Revisión de la PR 368: la comparación con el precio promocional se hizo sobre el precio leído
    // fuera de la transacción; el updateMany lo exige en el where para no aplicar sobre otro precio.
    test('el update condicionado exige el precio leído además del estado', async () => {
        await aplicarPromocion(5, { precioPromocional: 800 });

        expect(mockTx.lote.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 5, estado: 'DISPONIBLE', precio: PRECIO_ACTUAL } }),
        );
    });

    test('si el precio del lote se editó en paralelo (count 0) → 409 con el mensaje de concurrencia, sin crear la promoción', async () => {
        mockTx.lote.updateMany.mockResolvedValue({ count: 0 });

        await expect(aplicarPromocion(5, { precioPromocional: 800 })).rejects.toMatchObject({
            statusCode: 409,
            message: 'El lote ya no está disponible para aplicar la promoción: otra operación lo modificó. Volvé a intentarlo.',
        });
        expect(mockTx.promocion.create).not.toHaveBeenCalled();
    });
});
