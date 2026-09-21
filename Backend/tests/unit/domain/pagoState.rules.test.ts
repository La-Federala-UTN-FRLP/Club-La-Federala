import {
    calcularMontoFinanciado,
    calcularMontoTotalExigible,
    calcularSaldoPendiente,
    determinarEstadoCobro,
    determinarEstadoCuota,
    estaCuotaVencida,
    obtenerPrimeraCuotaPendiente,
} from '../../../src/domain/pagoState/pagoState.rules';
import type { CuotaParaEvaluacion } from '../../../src/domain/pagoState/pagoState.types';
import { EstadoCobro, EstadoCuota } from '../../../src/generated/prisma';

/** Fecha civil local a mediodía: evita corrimientos de día por UTC/DST. */
function diaLocal(anio: number, mes: number, dia: number, hora = 12): Date {
    return new Date(anio, mes - 1, dia, hora, 0, 0, 0);
}

function cuota(
    numeroCuota: number,
    saldoPendiente: number,
    fechaVencimiento = diaLocal(2026, 3, 10),
): CuotaParaEvaluacion {
    return { numeroCuota, saldoPendiente, fechaVencimiento };
}

describe('calcularMontoFinanciado', () => {
    test('resta el anticipo del total planificado', () => {
        expect(calcularMontoFinanciado(100_000, 20_000)).toBe(80_000);
    });

    test('anticipo 0 deja el total como monto financiado', () => {
        expect(calcularMontoFinanciado(100_000, 0)).toBe(100_000);
    });

    test('anticipo igual al total produce financiamiento 0', () => {
        expect(calcularMontoFinanciado(50_000, 50_000)).toBe(0);
    });

    test('anticipo mayor al total produce negativo: esta capa no clampa ni valida', () => {
        expect(calcularMontoFinanciado(50_000, 60_000)).toBe(-10_000);
    });
});

describe('calcularMontoTotalExigible', () => {
    test('sin recargo el exigible es el monto original', () => {
        expect(calcularMontoTotalExigible(10_000, 0)).toBe(10_000);
    });

    test('suma un recargo manual positivo', () => {
        expect(calcularMontoTotalExigible(10_000, 1_500)).toBe(11_500);
    });
});

describe('calcularSaldoPendiente', () => {
    test('pago parcial deja el resto exigible', () => {
        expect(calcularSaldoPendiente(10_000, 4_000)).toBe(6_000);
    });

    test('pago exacto deja saldo 0', () => {
        expect(calcularSaldoPendiente(10_000, 10_000)).toBe(0);
    });

    test('sobrepago nunca devuelve saldo negativo: clampa a 0', () => {
        expect(calcularSaldoPendiente(10_000, 12_000)).toBe(0);
    });

    test('sin pagos el saldo es todo el exigible', () => {
        expect(calcularSaldoPendiente(10_000, 0)).toBe(10_000);
    });
});

describe('determinarEstadoCuota', () => {
    test('montoPagado 0 (boundary) deja la cuota PENDIENTE aunque el saldo sea 0', () => {
        expect(determinarEstadoCuota(0, 0)).toBe(EstadoCuota.PENDIENTE);
        expect(determinarEstadoCuota(0, 5_000)).toBe(EstadoCuota.PENDIENTE);
    });

    test('pago mayor a 0 con saldo mayor a 0 es PAGO_PARCIAL', () => {
        expect(determinarEstadoCuota(1, 9_999)).toBe(EstadoCuota.PAGO_PARCIAL);
    });

    test('pago mayor a 0 con saldo 0 (boundary) es PAGA', () => {
        expect(determinarEstadoCuota(10_000, 0)).toBe(EstadoCuota.PAGA);
    });
});

describe('estaCuotaVencida', () => {
    const referencia = diaLocal(2026, 6, 15, 18);

    test('vencimiento de un día civil anterior con saldo pendiente está vencida', () => {
        expect(estaCuotaVencida(diaLocal(2026, 6, 14, 9), 1_000, referencia)).toBe(true);
    });

    test('mismo día civil no está vencida aunque la hora de referencia sea posterior', () => {
        expect(estaCuotaVencida(diaLocal(2026, 6, 15, 8), 1_000, referencia)).toBe(false);
    });

    test('fecha futura no está vencida', () => {
        expect(estaCuotaVencida(diaLocal(2026, 6, 16, 8), 1_000, referencia)).toBe(false);
    });

    test('saldo 0 no está vencida aunque la fecha ya haya pasado', () => {
        expect(estaCuotaVencida(diaLocal(2026, 1, 1), 0, referencia)).toBe(false);
    });
});

describe('determinarEstadoCobro', () => {
    test('saldo 0 (boundary) implica PAGO_COMPLETO aunque no haya pagos registrados', () => {
        expect(determinarEstadoCobro(0, 0)).toBe(EstadoCobro.PAGO_COMPLETO);
    });

    test('saldo pendiente sin pagos (totalPagado 0) es PENDIENTE', () => {
        expect(determinarEstadoCobro(0, 8_000)).toBe(EstadoCobro.PENDIENTE);
    });

    test('saldo pendiente con algún pago es EN_CURSO', () => {
        expect(determinarEstadoCobro(1, 8_000)).toBe(EstadoCobro.EN_CURSO);
    });
});

describe('obtenerPrimeraCuotaPendiente', () => {
    test('devuelve la de menor numeroCuota con saldo > 0 aunque el array esté desordenado', () => {
        const cuotas = [cuota(4, 0), cuota(2, 3_000), cuota(1, 0), cuota(3, 1_000)];
        expect(obtenerPrimeraCuotaPendiente(cuotas)?.numeroCuota).toBe(2);
    });

    test('ignora cuotas ya saldadas al elegir la primera pendiente', () => {
        const cuotas = [cuota(1, 0), cuota(2, 0), cuota(3, 500)];
        expect(obtenerPrimeraCuotaPendiente(cuotas)?.numeroCuota).toBe(3);
    });

    test('sin cuotas con saldo pendiente devuelve null', () => {
        expect(obtenerPrimeraCuotaPendiente([cuota(1, 0), cuota(2, 0)])).toBeNull();
        expect(obtenerPrimeraCuotaPendiente([])).toBeNull();
    });

    test('no muta el array original: copia antes de ordenar', () => {
        const cuotas = [cuota(3, 100), cuota(1, 100), cuota(2, 0)];
        const snapshot = cuotas.map((c) => c.numeroCuota);
        obtenerPrimeraCuotaPendiente(cuotas);
        expect(cuotas.map((c) => c.numeroCuota)).toEqual(snapshot);
    });
});
