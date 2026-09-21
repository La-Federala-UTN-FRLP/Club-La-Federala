jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: {},
}));

import {
    assertLoteOperableFor,
    computeRestoreStateFromPrioridad,
    computeRestoreStateFromReserva,
} from '../../../src/domain/loteState/loteState.rules';
import { ESTADO_LOTE_OP } from '../../../src/domain/loteState/loteState.types';
import { EstadoLote } from '../../../src/generated/prisma';

function expectStatus(fn: () => void, status: number) {
    let thrown: unknown;
    try {
        fn();
    } catch (error) {
        thrown = error;
    }
    expect(thrown).toBeDefined();
    expect(thrown).toEqual(expect.objectContaining({ status }));
}

describe('computeRestoreStateFromPrioridad', () => {
    test('si el lote nació EN_PROMOCION restaura EN_PROMOCION', () => {
        expect(computeRestoreStateFromPrioridad(EstadoLote.EN_PROMOCION)).toBe(
            ESTADO_LOTE_OP.EN_PROMOCION,
        );
    });

    test('cualquier otro estado de origen restaura DISPONIBLE (p. ej. CON_PRIORIDAD)', () => {
        expect(computeRestoreStateFromPrioridad(EstadoLote.CON_PRIORIDAD)).toBe(
            ESTADO_LOTE_OP.DISPONIBLE,
        );
        expect(computeRestoreStateFromPrioridad(EstadoLote.DISPONIBLE)).toBe(
            ESTADO_LOTE_OP.DISPONIBLE,
        );
    });
});

describe('computeRestoreStateFromReserva', () => {
    test('si el lote nació EN_PROMOCION restaura EN_PROMOCION', async () => {
        await expect(
            computeRestoreStateFromReserva(EstadoLote.EN_PROMOCION, 11),
        ).resolves.toBe(ESTADO_LOTE_OP.EN_PROMOCION);
    });

    test('estado de origen no promoción restaura DISPONIBLE; loteId no interviene', async () => {
        await expect(
            computeRestoreStateFromReserva(EstadoLote.RESERVADO, 99),
        ).resolves.toBe(ESTADO_LOTE_OP.DISPONIBLE);
    });
});

describe('assertLoteOperableFor', () => {
    test('NO_DISPONIBLE (enum Prisma) bloquea la operación con 400', () => {
        expectStatus(
            () => assertLoteOperableFor('crear reserva', EstadoLote.NO_DISPONIBLE),
            400,
        );
    });

    test('etiqueta operativa "No Disponible" también bloquea con 400', () => {
        expectStatus(
            () => assertLoteOperableFor('crear venta', ESTADO_LOTE_OP.NO_DISPONIBLE),
            400,
        );
    });

    test('DISPONIBLE permite la operación', () => {
        expect(() => assertLoteOperableFor('crear reserva', EstadoLote.DISPONIBLE)).not.toThrow();
    });

    test('ALQUILADO está permitido hoy: el bloqueo futuro no está implementado', () => {
        expect(() => assertLoteOperableFor('crear reserva', EstadoLote.ALQUILADO)).not.toThrow();
    });
});
