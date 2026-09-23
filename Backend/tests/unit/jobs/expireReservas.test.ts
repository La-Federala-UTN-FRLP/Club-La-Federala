jest.mock('../../../src/config/prisma', () =>
    require('../../support/mocks/prisma').expireReservasPrismaMock,
);

jest.mock('../../../src/services/reserva.service', () => ({
    updateReserva: jest.fn(),
}));

import { EstadoReserva } from '../../../src/generated/prisma';
import { expireReservas } from '../../../src/jobs/expireReservas';
import { updateReserva } from '../../../src/services/reserva.service';
import {
    expireReservasPrismaMock as prismaMock,
    resetPrismaMock,
} from '../../support/mocks/prisma';

const updateReservaMock = updateReserva as jest.Mock;

function findManyWhere() {
    return prismaMock.reserva.findMany.mock.calls[0]?.[0]?.where;
}

beforeEach(() => {
    resetPrismaMock(prismaMock);
    updateReservaMock.mockReset();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('expireReservas', () => {
    test('selección: estados vencidos, sin venta y solo OPERATIVO', async () => {
        prismaMock.reserva.findMany.mockResolvedValue([]);

        await expireReservas();

        expect(findManyWhere()).toMatchObject({
            estado: {
                in: [EstadoReserva.ACTIVA, EstadoReserva.ACEPTADA, EstadoReserva.CONTRAOFERTA],
            },
            ventaId: null,
            estadoOperativo: 'OPERATIVO',
        });
        expect(findManyWhere().fechaFinReserva).toEqual({ lte: expect.any(Date) });
    });

    test('procesa cada candidata con updateReserva(EXPIRADA)', async () => {
        prismaMock.reserva.findMany.mockResolvedValue([
            { id: 10, loteId: 3, estado: EstadoReserva.ACTIVA },
            { id: 11, loteId: 4, estado: EstadoReserva.ACEPTADA },
        ]);
        updateReservaMock.mockResolvedValue({});

        const count = await expireReservas();

        expect(count).toBe(2);
        expect(updateReservaMock).toHaveBeenCalledTimes(2);
        expect(updateReservaMock).toHaveBeenNthCalledWith(1, 10, { estado: EstadoReserva.EXPIRADA });
        expect(updateReservaMock).toHaveBeenNthCalledWith(2, 11, { estado: EstadoReserva.EXPIRADA });
    });

    test('continúa si una expiración falla y cuenta solo las exitosas', async () => {
        prismaMock.reserva.findMany.mockResolvedValue([
            { id: 20, loteId: 3, estado: EstadoReserva.ACTIVA },
            { id: 21, loteId: 4, estado: EstadoReserva.CONTRAOFERTA },
        ]);
        updateReservaMock.mockRejectedValueOnce(new Error('fallo matriz'));
        updateReservaMock.mockResolvedValueOnce({});

        const count = await expireReservas();

        expect(count).toBe(1);
        expect(updateReservaMock).toHaveBeenCalledTimes(2);
    });

    test('sin candidatas retorna 0 y no llama updateReserva', async () => {
        prismaMock.reserva.findMany.mockResolvedValue([]);

        const count = await expireReservas();

        expect(count).toBe(0);
        expect(updateReservaMock).not.toHaveBeenCalled();
    });
});
