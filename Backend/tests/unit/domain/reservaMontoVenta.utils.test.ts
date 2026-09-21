import { EstadoReserva, Prisma } from '../../../src/generated/prisma';
import { montoVentaEsperadoDesdeReserva } from '../../../src/domain/reserva/reservaMontoVenta.utils';

describe('montoVentaEsperadoDesdeReserva', () => {
    test('reserva ACTIVA usa ofertaInicial (number), no la oferta actual', () => {
        const monto = montoVentaEsperadoDesdeReserva({
            estado: EstadoReserva.ACTIVA,
            ofertaInicial: 150_000,
            ofertaActual: 180_000,
        });
        expect(monto).toBe(150_000);
    });

    test('reserva ACEPTADA usa ofertaActual Decimal real', () => {
        const monto = montoVentaEsperadoDesdeReserva({
            estado: EstadoReserva.ACEPTADA,
            ofertaInicial: new Prisma.Decimal('150000.5'),
            ofertaActual: new Prisma.Decimal('185000.5'),
        });
        expect(monto).toBe(185000.5);
    });

    test('estado no convertible a venta (CANCELADA) lanza error', () => {
        expect(() =>
            montoVentaEsperadoDesdeReserva({
                estado: EstadoReserva.CANCELADA,
                ofertaInicial: 150_000,
                ofertaActual: 180_000,
            }),
        ).toThrow(/no válido para venta con reserva/i);
    });

    test('RECHAZADA comparte la misma rama de estado no permitido', () => {
        expect(() =>
            montoVentaEsperadoDesdeReserva({
                estado: EstadoReserva.RECHAZADA,
                ofertaInicial: 150_000,
                ofertaActual: 180_000,
            }),
        ).toThrow();
    });
});
