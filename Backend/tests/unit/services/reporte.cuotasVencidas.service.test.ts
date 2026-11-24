// REP-A1 (CCLF-55, subtarea 38.4): reporte de cuotas vencidas.
// Los totales se comparan con un conteo manual del set de prueba (DATOS_CUOTAS, ver la tabla en
// cuotaVencida.fake.ts). El fake de Prisma evalúa el where/select/orderBy del service.
jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: require('../../support/fakes/cuotaVencida.fake').crearPrismaCuotasFake(),
}));

import prisma from '../../../src/config/prisma';
import {
    getReporteCuotasVencidas,
    tramoDeAtraso,
    diaVencimiento,
    diasDeAtraso,
    limiteVencimiento,
} from '../../../src/services/reporte.service';
import {
    AHORA_CORTE,
    CORTE,
    CuotaFixture,
    DATOS_CUOTAS,
    PrismaCuotasFake,
    fijarAhora,
    venceApi,
    venceFront,
} from '../../support/fakes/cuotaVencida.fake';
import { FRACCION_VA, FRACCION_VB } from '../../support/fakes/ventaReporte.fake';

const db = prisma as unknown as PrismaCuotasFake;

beforeEach(() => {
    db.cargar(DATOS_CUOTAS);
    fijarAhora(AHORA_CORTE);
});

afterEach(() => {
    jest.useRealTimers();
});

const idsDe = (filas: { cuotaId: number }[]) => filas.map((f) => f.cuotaId);

/** Carga el set con solo estas cuotas (planes, ventas y lotes del set completo). */
const cargarCuotas = (...cuotas: CuotaFixture[]) => db.cargar({ ...DATOS_CUOTAS, cuotas });
const cuotaDelSet = (id: number) => DATOS_CUOTAS.cuotas.find((c) => c.id === id)!;

describe('REP-A1 — cuota que vence hoy, una pagada, un plan reemplazado y una venta cancelada', () => {
    test('solo cuentan cuotas de plan vigente, con saldo, vencidas antes del corte y de ventas no canceladas', async () => {
        const r = await getReporteCuotasVencidas({ moneda: 'USD' });
        expect(r.corte).toBe(CORTE);
        expect(idsDe(r.filas).sort()).toEqual([902, 903, 904, 905, 906, 909]);
        expect(r).toMatchObject({ moneda: 'USD', saldoVencido: '4051.09', cuotas: 6, ventas: 2 });
    });

    test('la cuota que vence el día de corte no está vencida (901, 916)', async () => {
        const { filas } = await getReporteCuotasVencidas({ moneda: 'USD' });
        expect(idsDe(filas)).not.toContain(901);
        expect(idsDe(filas)).not.toContain(916);
    });

    test('la cuota pagada no entra (907)', async () => {
        cargarCuotas(cuotaDelSet(907));
        const r = await getReporteCuotasVencidas({ moneda: 'USD' });
        expect(r.filas).toEqual([]);
        expect(r.saldoVencido).toBe('0.00');
    });

    test('la cuota del plan reemplazado no entra; la del plan vigente de la misma venta sí (910 / 909)', async () => {
        cargarCuotas(cuotaDelSet(910), cuotaDelSet(909));
        const r = await getReporteCuotasVencidas({ moneda: 'USD' });
        expect(idsDe(r.filas)).toEqual([909]);
    });

    test('la cuota de una venta cancelada no entra (911)', async () => {
        cargarCuotas(cuotaDelSet(911));
        expect((await getReporteCuotasVencidas({ moneda: 'USD' })).filas).toEqual([]);
    });

    test('ARS y USD separados: cada moneda con sus propios totales, sin sumarse', async () => {
        const usd = await getReporteCuotasVencidas({ moneda: 'USD' });
        const ars = await getReporteCuotasVencidas({ moneda: 'ARS' });
        expect(usd).toMatchObject({ moneda: 'USD', saldoVencido: '4051.09', cuotas: 6, ventas: 2 });
        expect(ars).toMatchObject({ moneda: 'ARS', saldoVencido: '1750000.50', cuotas: 2, ventas: 1 });
        expect(idsDe(ars.filas)).toEqual([914, 913]);
        expect(idsDe(usd.filas)).not.toContain(913);
        expect(idsDe(usd.filas)).not.toContain(914);
    });
});

describe('getReporteCuotasVencidas — exclusiones y saldo', () => {
    test('la cuota de una venta eliminada (baja lógica) no entra (912)', async () => {
        cargarCuotas(cuotaDelSet(912));
        expect((await getReporteCuotasVencidas({ moneda: 'USD' })).filas).toEqual([]);
        // La misma cuota con la venta operativa sí entraría.
        db.cargar({
            ...DATOS_CUOTAS,
            ventas: DATOS_CUOTAS.ventas.map((v) => (v.id === 804 ? { ...v, estadoOperativo: 'OPERATIVO' as const } : v)),
            cuotas: [cuotaDelSet(912)],
        });
        expect(idsDe((await getReporteCuotasVencidas({ moneda: 'USD' })).filas)).toEqual([912]);
    });

    test('la cuota de un plan CANCELADO no entra (915)', async () => {
        cargarCuotas(cuotaDelSet(915));
        expect((await getReporteCuotasVencidas({ moneda: 'USD' })).filas).toEqual([]);
    });

    test('la cuota que vence después del corte no entra (908)', async () => {
        cargarCuotas(cuotaDelSet(908));
        expect((await getReporteCuotasVencidas({ moneda: 'USD' })).filas).toEqual([]);
    });

    test('pago parcial: entra por su saldo pendiente, no por el monto de la cuota (909)', async () => {
        cargarCuotas(cuotaDelSet(909));
        const r = await getReporteCuotasVencidas({ moneda: 'USD' });
        expect(r.saldoVencido).toBe('300.33');
        expect(r.filas[0]).toMatchObject({ cuotaId: 909, saldoPendiente: '300.33' });
    });

    test('suma en Decimal, sin pérdida de precisión con montos grandes', async () => {
        cargarCuotas(
            { ...cuotaDelSet(903), saldoPendiente: '9999999999.99' },
            { ...cuotaDelSet(904), saldoPendiente: '0.01' },
            { ...cuotaDelSet(905), saldoPendiente: '0.10' },
            { ...cuotaDelSet(906), saldoPendiente: '0.20' },
        );
        const r = await getReporteCuotasVencidas({ moneda: 'USD' });
        expect(r.saldoVencido).toBe('10000000000.30');
        expect(r.tramos.find((t) => t.tramo === '31-60')!.saldo).toBe('0.11');
    });
});

describe('getReporteCuotasVencidas — tramos', () => {
    test('bordes: 1 y 30 días → 1-30; 31 y 60 → 31-60; 61 → +60', async () => {
        const { filas } = await getReporteCuotasVencidas({ moneda: 'USD' });
        const atraso = Object.fromEntries(filas.map((f) => [f.cuotaId, [f.diasAtraso, f.tramo]]));
        expect(atraso).toEqual({
            902: [1, '1-30'],
            903: [30, '1-30'],
            904: [31, '31-60'],
            905: [60, '31-60'],
            906: [61, '+60'],
            909: [14, '1-30'],
        });
    });

    test('totales por tramo (USD), siempre los 3 y en orden', async () => {
        const { tramos } = await getReporteCuotasVencidas({ moneda: 'USD' });
        expect(tramos).toEqual([
            { tramo: '1-30', cuotas: 3, saldo: '1800.83' }, // 902, 903, 909
            { tramo: '31-60', cuotas: 2, saldo: '250.26' }, // 904, 905
            { tramo: '+60', cuotas: 1, saldo: '2000.00' }, // 906
        ]);
    });

    test('totales por tramo (ARS), con un tramo vacío', async () => {
        const { tramos } = await getReporteCuotasVencidas({ moneda: 'ARS' });
        expect(tramos).toEqual([
            { tramo: '1-30', cuotas: 1, saldo: '1500000.00' },
            { tramo: '31-60', cuotas: 0, saldo: '0.00' },
            { tramo: '+60', cuotas: 1, saldo: '250000.50' },
        ]);
    });

    test.each([
        [1, '1-30'], [30, '1-30'], [31, '31-60'], [60, '31-60'], [61, '+60'], [400, '+60'],
    ])('tramoDeAtraso(%i) → %s', (dias, tramo) => {
        expect(tramoDeAtraso(dias)).toBe(tramo);
    });
});

describe('getReporteCuotasVencidas — filas, filtros y consulta', () => {
    test('filas: más atrasadas primero', async () => {
        const { filas } = await getReporteCuotasVencidas({ moneda: 'USD' });
        expect(idsDe(filas)).toEqual([906, 905, 904, 903, 909, 902]);
    });

    test('fila con la forma tipada', async () => {
        const { filas } = await getReporteCuotasVencidas({ moneda: 'USD' });
        expect(filas.find((f) => f.cuotaId === 909)).toEqual({
            cuotaId: 909,
            ventaId: 802,
            ventaNumero: 'CCLF-2026-802',
            loteId: 503,
            loteNumero: 1,
            fraccion: FRACCION_VB.numero,
            numeroCuota: 1,
            cantidadCuotas: 4,
            fechaVencimiento: '2026-11-10',
            diasAtraso: 14,
            tramo: '1-30',
            saldoPendiente: '300.33',
            enlace: '/ventas/802/pagos',
        });
        // Lote sin número (venta 805 en ARS).
        const ars = await getReporteCuotasVencidas({ moneda: 'ARS' });
        expect(ars.filas[0]).toMatchObject({ cuotaId: 914, loteNumero: null, fraccion: FRACCION_VA.numero, saldoPendiente: '250000.50' });
    });

    test('filtro fraccion (id): totales y filas solo de esa fracción', async () => {
        const va = await getReporteCuotasVencidas({ moneda: 'USD', fraccion: FRACCION_VA.id });
        expect(va).toMatchObject({ saldoVencido: '3750.76', cuotas: 5, ventas: 1 });
        expect(idsDe(va.filas)).toEqual([906, 905, 904, 903, 902]);

        const vb = await getReporteCuotasVencidas({ moneda: 'USD', fraccion: FRACCION_VB.id });
        expect(vb).toMatchObject({ saldoVencido: '300.33', cuotas: 1, ventas: 1 });
    });

    test('base vacía → totales en cero, 3 tramos en cero y sin filas', async () => {
        cargarCuotas();
        const r = await getReporteCuotasVencidas({ moneda: 'ARS' });
        expect(r).toEqual({
            corte: CORTE,
            moneda: 'ARS',
            saldoVencido: '0.00',
            cuotas: 0,
            ventas: 0,
            tramos: [
                { tramo: '1-30', cuotas: 0, saldo: '0.00' },
                { tramo: '31-60', cuotas: 0, saldo: '0.00' },
                { tramo: '+60', cuotas: 0, saldo: '0.00' },
            ],
            filas: [],
        });
    });

    test('pide a la base una sola consulta con todos los filtros', async () => {
        await getReporteCuotasVencidas({ moneda: 'ARS', fraccion: 10 });
        expect(db.cuotaPlanPago.findMany).toHaveBeenCalledTimes(1);
        const { where } = db.cuotaPlanPago.findMany.mock.calls[0][0];
        expect(where).toEqual({
            saldoPendiente: { gt: 0 },
            fechaVencimiento: { lt: new Date('2026-11-24T00:00:00.000Z') },
            planPago: {
                estadoPlan: 'VIGENTE',
                moneda: 'ARS',
                venta: { estadoOperativo: 'OPERATIVO', estado: { not: 'CANCELADA' }, lote: { fraccionId: 10 } },
            },
        });
    });
});

describe('fecha de corte y vencimiento (Buenos Aires vs. UTC)', () => {
    test('a las 02:59 UTC del 25/11 todavía es 24/11 en Buenos Aires: la cuota del 24/11 no está vencida', async () => {
        fijarAhora('2026-11-25T02:59:59.000Z');
        cargarCuotas(cuotaDelSet(901));
        const r = await getReporteCuotasVencidas({ moneda: 'USD' });
        expect(r.corte).toBe('2026-11-24');
        expect(r.filas).toEqual([]);
    });

    test('a las 03:00 UTC del 25/11 ya es 25/11: la cuota del 24/11 está vencida con 1 día', async () => {
        fijarAhora('2026-11-25T03:00:00.000Z');
        cargarCuotas(cuotaDelSet(901), cuotaDelSet(916));
        const r = await getReporteCuotasVencidas({ moneda: 'USD' });
        expect(r.corte).toBe('2026-11-25');
        expect(r.filas.map((f) => [f.cuotaId, f.fechaVencimiento, f.diasAtraso])).toEqual([
            [901, '2026-11-24', 1],
            [916, '2026-11-24', 1],
        ]);
    });

    test('vencimiento guardado a medianoche UTC conserva su día (no se corre al anterior)', () => {
        expect(diaVencimiento(new Date(venceApi('2026-11-24')))).toBe('2026-11-24');
        expect(diaVencimiento(new Date(venceFront('2026-11-24')))).toBe('2026-11-24');
        expect(limiteVencimiento('2026-11-24').toISOString()).toBe('2026-11-24T00:00:00.000Z');
    });

    test('diasDeAtraso cruza meses y años', () => {
        expect(diasDeAtraso('2026-11-23', '2026-11-24')).toBe(1);
        expect(diasDeAtraso('2026-02-28', '2026-03-01')).toBe(1);
        expect(diasDeAtraso('2025-12-31', '2026-01-30')).toBe(30);
    });
});
