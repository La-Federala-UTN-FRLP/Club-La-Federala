import { EstadoReserva } from '../../../src/generated/prisma';
import {
    canTransitionReserva,
    getAllowedReservaTransitions,
    getReservaStateForOfertaAction,
    ReservaOfertaAction,
} from '../../../src/domain/reserva/reservaLifecycle.rules';

describe('reservaLifecycle.rules', () => {
    describe('transiciones permitidas', () => {
        test.each([
            [EstadoReserva.ACTIVA, EstadoReserva.CANCELADA],
            [EstadoReserva.ACTIVA, EstadoReserva.EXPIRADA],
            [EstadoReserva.ACEPTADA, EstadoReserva.CANCELADA],
            [EstadoReserva.ACEPTADA, EstadoReserva.RECHAZADA],
            [EstadoReserva.ACEPTADA, EstadoReserva.EXPIRADA],
            [EstadoReserva.CONTRAOFERTA, EstadoReserva.EXPIRADA],
            [EstadoReserva.CANCELADA, EstadoReserva.ACTIVA],
            [EstadoReserva.RECHAZADA, EstadoReserva.ACTIVA],
            [EstadoReserva.EXPIRADA, EstadoReserva.ACTIVA],
        ] as const)('%s → %s', (from, to) => {
            expect(canTransitionReserva(from, to)).toBe(true);
            expect(getAllowedReservaTransitions(from)).toContain(to);
        });
    });

    describe('transiciones no permitidas (representativas)', () => {
        test.each([
            [EstadoReserva.ACTIVA, EstadoReserva.RECHAZADA],
            [EstadoReserva.ACTIVA, EstadoReserva.ACEPTADA],
            [EstadoReserva.CONTRAOFERTA, EstadoReserva.ACEPTADA],
            [EstadoReserva.CANCELADA, EstadoReserva.EXPIRADA],
        ] as const)('%s → %s', (from, to) => {
            expect(canTransitionReserva(from, to)).toBe(false);
        });
    });

    describe('acciones de oferta permitidas', () => {
        test.each([
            [EstadoReserva.ACTIVA, 'ACEPTAR', EstadoReserva.ACEPTADA],
            [EstadoReserva.ACTIVA, 'RECHAZAR', EstadoReserva.RECHAZADA],
            [EstadoReserva.ACTIVA, 'CONTRAOFERTAR', EstadoReserva.CONTRAOFERTA],
            [EstadoReserva.CONTRAOFERTA, 'ACEPTAR', EstadoReserva.ACEPTADA],
            [EstadoReserva.CONTRAOFERTA, 'RECHAZAR', EstadoReserva.RECHAZADA],
            [EstadoReserva.CONTRAOFERTA, 'CONTRAOFERTAR', EstadoReserva.CONTRAOFERTA],
            [EstadoReserva.ACEPTADA, 'RECHAZAR', EstadoReserva.RECHAZADA],
        ] as const)('%s + %s → %s', (estado, action, destino) => {
            expect(getReservaStateForOfertaAction(estado, action)).toBe(destino);
        });
    });

    describe('acciones de oferta no permitidas (representativas)', () => {
        test.each([
            [EstadoReserva.ACEPTADA, 'ACEPTAR'],
            [EstadoReserva.ACEPTADA, 'CONTRAOFERTAR'],
            [EstadoReserva.CANCELADA, 'ACEPTAR'],
            [EstadoReserva.RECHAZADA, 'CONTRAOFERTAR'],
            [EstadoReserva.EXPIRADA, 'RECHAZAR'],
        ] as const)('%s + %s', (estado, action) => {
            expect(getReservaStateForOfertaAction(estado, action as ReservaOfertaAction)).toBeNull();
        });
    });
});
