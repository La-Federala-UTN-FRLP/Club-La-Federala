/**
 * Fake del delegate `cuotaPlanPago` de Prisma para el reporte de cuotas vencidas (CCLF-55).
 *
 * Evalúa sobre un set en memoria (cuotas → plan → venta → lote → fracción) el `where`, el `select` y
 * el `orderBy` que arma el service, para comparar los totales con un conteo manual del set.
 *
 * Soporta solo la forma de consulta del reporte y falla ante cualquier otra: si el service cambia o
 * quita un filtro, el test lo nota en vez de ignorarlo.
 */
import { Prisma } from '../../../src/generated/prisma';
import type { EstadoOperativo, EstadoPlanPago, EstadoVenta, Moneda } from '../../../src/generated/prisma';
import type { FraccionVentaFixture, LoteVentaFixture } from './ventaReporte.fake';
import { FRACCION_VA, FRACCION_VB, LOTES_VENTAS } from './ventaReporte.fake';

export interface VentaCuotasFixture {
    id: number;
    numero: string;
    loteId: number;
    estado: EstadoVenta;
    estadoOperativo: EstadoOperativo;
}

export interface PlanCuotasFixture {
    id: number;
    ventaId: number;
    estadoPlan: EstadoPlanPago;
    moneda: Moneda;
    cantidadCuotas: number;
}

export interface CuotaFixture {
    id: number;
    planId: number;
    numeroCuota: number;
    /** Instante ISO, como lo guarda Prisma. */
    fechaVencimiento: string;
    saldoPendiente: string;
}

export interface DatosCuotas {
    fracciones: FraccionVentaFixture[];
    lotes: LoteVentaFixture[];
    ventas: VentaCuotasFixture[];
    planes: PlanCuotasFixture[];
    cuotas: CuotaFixture[];
}

type Where = Record<string, unknown>;

const SELECT_ESPERADO = {
    id: true,
    numeroCuota: true,
    fechaVencimiento: true,
    saldoPendiente: true,
    planPago: {
        select: {
            cantidadCuotas: true,
            venta: {
                select: {
                    id: true,
                    numero: true,
                    loteId: true,
                    lote: { select: { numero: true, fraccion: { select: { numero: true } } } },
                },
            },
        },
    },
};
const ORDER_BY_ESPERADO = [{ fechaVencimiento: 'asc' }, { id: 'asc' }];

const noSoportado = (que: string): never => {
    throw new Error(`${que} no soportado por el fake`);
};

/** Verifica que `obj` tenga exactamente las claves `permitidas` (las opcionales pueden faltar). */
function soloClaves(obj: unknown, obligatorias: string[], opcionales: string[] = []): Where {
    if (typeof obj !== 'object' || obj === null) return noSoportado(`Condición ${JSON.stringify(obj)}`);
    const claves = Object.keys(obj);
    const extra = claves.filter((k) => !obligatorias.includes(k) && !opcionales.includes(k));
    const faltan = obligatorias.filter((k) => !claves.includes(k));
    if (extra.length > 0 || faltan.length > 0) {
        noSoportado(`Condición ${JSON.stringify(obj)} (extra: ${extra}, faltan: ${faltan})`);
    }
    return obj as Where;
}

const escalar = (v: unknown, que: string): string => (typeof v === 'string' ? v : noSoportado(`${que} no escalar`));

export function crearPrismaCuotasFake() {
    let datos: DatosCuotas = { fracciones: [], lotes: [], ventas: [], planes: [], cuotas: [] };

    const buscar = <T extends { id: number }>(lista: T[], id: number, que: string): T =>
        lista.find((x) => x.id === id) ?? noSoportado(`${que} ${id} no cargado: dato`);

    function cumple(c: CuotaFixture, where: Where): boolean {
        const w = soloClaves(where, ['saldoPendiente', 'fechaVencimiento', 'planPago']);

        const saldo = soloClaves(w.saldoPendiente, ['gt']);
        if (!new Prisma.Decimal(c.saldoPendiente).gt(saldo.gt as number)) return false;

        const venc = soloClaves(w.fechaVencimiento, ['lt']);
        if (!(venc.lt instanceof Date)) noSoportado('fechaVencimiento.lt no Date');
        if (Date.parse(c.fechaVencimiento) >= (venc.lt as Date).getTime()) return false;

        const plan = buscar(datos.planes, c.planId, 'Plan');
        const wPlan = soloClaves(w.planPago, ['estadoPlan', 'moneda', 'venta']);
        if (plan.estadoPlan !== escalar(wPlan.estadoPlan, 'estadoPlan')) return false;
        if (plan.moneda !== escalar(wPlan.moneda, 'moneda')) return false;

        const venta = buscar(datos.ventas, plan.ventaId, 'Venta');
        const wVenta = soloClaves(wPlan.venta, ['estadoOperativo', 'estado'], ['lote']);
        if (venta.estadoOperativo !== escalar(wVenta.estadoOperativo, 'estadoOperativo')) return false;
        const estado = soloClaves(wVenta.estado, ['not']);
        if (venta.estado === escalar(estado.not, 'estado.not')) return false;
        if (wVenta.lote !== undefined) {
            const wLote = soloClaves(wVenta.lote, ['fraccionId']);
            if (typeof wLote.fraccionId !== 'number') noSoportado('fraccionId no numérico');
            if (buscar(datos.lotes, venta.loteId, 'Lote').fraccionId !== wLote.fraccionId) return false;
        }
        return true;
    }

    const cuotaPlanPago = {
        findMany: jest.fn(async (args: { where: Where; select: unknown; orderBy: unknown }) => {
            const { where, select, orderBy, ...resto } = args;
            if (Object.keys(resto).length > 0) noSoportado(`findMany: opción ${Object.keys(resto)[0]}`);
            if (JSON.stringify(select) !== JSON.stringify(SELECT_ESPERADO)) noSoportado(`findMany: select ${JSON.stringify(select)}`);
            if (JSON.stringify(orderBy) !== JSON.stringify(ORDER_BY_ESPERADO)) noSoportado(`findMany: orderBy ${JSON.stringify(orderBy)}`);

            return datos.cuotas
                .filter((c) => cumple(c, where))
                .sort((a, b) => Date.parse(a.fechaVencimiento) - Date.parse(b.fechaVencimiento) || a.id - b.id)
                .map((c) => {
                    const plan = buscar(datos.planes, c.planId, 'Plan');
                    const venta = buscar(datos.ventas, plan.ventaId, 'Venta');
                    const lote = buscar(datos.lotes, venta.loteId, 'Lote');
                    const fraccion = buscar(datos.fracciones, lote.fraccionId, 'Fracción');
                    return {
                        id: c.id,
                        numeroCuota: c.numeroCuota,
                        fechaVencimiento: new Date(c.fechaVencimiento),
                        saldoPendiente: new Prisma.Decimal(c.saldoPendiente),
                        planPago: {
                            cantidadCuotas: plan.cantidadCuotas,
                            venta: {
                                id: venta.id,
                                numero: venta.numero,
                                loteId: venta.loteId,
                                lote: { numero: lote.numero, fraccion: { numero: fraccion.numero } },
                            },
                        },
                    };
                });
        }),
    };

    return {
        cuotaPlanPago,
        /** Reemplaza el set de datos de la "base". */
        cargar(nuevos: DatosCuotas) {
            datos = structuredClone(nuevos);
        },
    };
}

export type PrismaCuotasFake = ReturnType<typeof crearPrismaCuotasFake>;

/**
 * Fija solo el reloj de Date (no los timers), para que el corte del reporte sea determinista sin
 * frenar supertest ni las promesas. Restaurar con jest.useRealTimers().
 */
export function fijarAhora(instante: string) {
    jest.useFakeTimers({
        now: new Date(instante),
        doNotFake: [
            'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame',
            'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval',
            'clearInterval', 'setTimeout', 'clearTimeout',
        ],
    });
}

// ------------------------------------------------------------ Set de datos de prueba

/** Corte de los tests: 24/11/2026 al mediodía de Buenos Aires. */
export const AHORA_CORTE = '2026-11-24T15:00:00.000Z';
export const CORTE = '2026-11-24';

/** Vencimiento cargado desde el frontend: YYYY-MM-DDT12:00:00Z. */
export const venceFront = (fecha: string) => `${fecha}T12:00:00.000Z`;
/** Vencimiento cargado por la API con "YYYY-MM-DD": medianoche UTC (21:00 del día anterior en Buenos Aires). */
export const venceApi = (fecha: string) => `${fecha}T00:00:00.000Z`;

const venta = (id: number, loteId: number, estado: EstadoVenta, estadoOperativo: EstadoOperativo = 'OPERATIVO'): VentaCuotasFixture => ({
    id,
    numero: `CCLF-2026-${id}`,
    loteId,
    estado,
    estadoOperativo,
});

const plan = (id: number, ventaId: number, estadoPlan: EstadoPlanPago, moneda: Moneda, cantidadCuotas = 12): PlanCuotasFixture => ({
    id,
    ventaId,
    estadoPlan,
    moneda,
    cantidadCuotas,
});

const cuota = (id: number, planId: number, numeroCuota: number, fechaVencimiento: string, saldoPendiente: string): CuotaFixture => ({
    id,
    planId,
    numeroCuota,
    fechaVencimiento,
    saldoPendiente,
});

/**
 * Ventas (lotes y fracciones del set de ventas: fracción VA id 10 / número 2, VB id 20 / número 1).
 *
 * | venta | lote | fracción | estado     | operativo | planes                                  |
 * |-------|------|----------|------------|-----------|-----------------------------------------|
 * | 801   | 501  | VA       | INICIADA   | OPERATIVO | 81 VIGENTE USD                          |
 * | 802   | 503  | VB       | CON_BOLETO | OPERATIVO | 82 REEMPLAZADO USD, 83 VIGENTE USD      |
 * | 803   | 502  | VA       | CANCELADA  | OPERATIVO | 84 VIGENTE USD                          |
 * | 804   | 504  | VB       | INICIADA   | ELIMINADO | 85 VIGENTE USD                          |
 * | 805   | 505  | VA       | INICIADA   | OPERATIVO | 86 VIGENTE ARS                          |
 * | 806   | 504  | VB       | ESCRITURADO| OPERATIVO | 87 CANCELADO USD                        |
 */
export const VENTAS_CUOTAS: VentaCuotasFixture[] = [
    venta(801, 501, 'INICIADA'),
    venta(802, 503, 'CON_BOLETO'),
    venta(803, 502, 'CANCELADA'),
    venta(804, 504, 'INICIADA', 'ELIMINADO'),
    venta(805, 505, 'INICIADA'),
    venta(806, 504, 'ESCRITURADO'),
];

export const PLANES_CUOTAS: PlanCuotasFixture[] = [
    plan(81, 801, 'VIGENTE', 'USD', 12),
    plan(82, 802, 'REEMPLAZADO', 'USD', 6),
    plan(83, 802, 'VIGENTE', 'USD', 4),
    plan(84, 803, 'VIGENTE', 'USD'),
    plan(85, 804, 'VIGENTE', 'USD'),
    plan(86, 805, 'VIGENTE', 'ARS', 24),
    plan(87, 806, 'CANCELADO', 'USD'),
];

/**
 * Cuotas contra el corte 24/11/2026:
 *
 * | cuota | plan | nº | vencimiento        | saldo         | atraso | resultado                                  |
 * |-------|------|----|--------------------|---------------|--------|--------------------------------------------|
 * | 901   | 81   | 1  | 24/11 (12:00Z)     | 1000          | 0      | NO: vence hoy                              |
 * | 902   | 81   | 2  | 23/11 (00:00Z)     | 1000          | 1      | USD 1-30 (borde UTC: no se corre al 22/11) |
 * | 903   | 81   | 3  | 25/10              | 500.50        | 30     | USD 1-30 (borde)                           |
 * | 904   | 81   | 4  | 24/10              | 250.25        | 31     | USD 31-60 (borde)                          |
 * | 905   | 81   | 5  | 25/09              | 0.01          | 60     | USD 31-60 (borde)                          |
 * | 906   | 81   | 6  | 24/09              | 2000          | 61     | USD +60 (borde)                            |
 * | 907   | 81   | 7  | 01/08              | 0             | —      | NO: pagada                                 |
 * | 908   | 81   | 8  | 25/11              | 1000          | —      | NO: vence después del corte                |
 * | 909   | 83   | 1  | 10/11              | 300.33        | 14     | USD 1-30: pago parcial, entra por el saldo |
 * | 910   | 82   | 1  | 01/10              | 5000          | —      | NO: plan reemplazado                       |
 * | 911   | 84   | 1  | 01/10              | 7000          | —      | NO: venta cancelada                        |
 * | 912   | 85   | 1  | 01/10              | 8000          | —      | NO: venta eliminada                        |
 * | 913   | 86   | 1  | 01/11              | 1500000       | 23     | ARS 1-30                                   |
 * | 914   | 86   | 2  | 01/07              | 250000.50     | 146    | ARS +60                                    |
 * | 915   | 87   | 1  | 01/10              | 900           | —      | NO: plan cancelado                         |
 * | 916   | 81   | 9  | 24/11 (00:00Z)     | 1000          | 0      | NO: vence hoy (borde UTC: no se corre al 23/11) |
 *
 * USD: 6 cuotas (902–906, 909) de 2 ventas (801, 802), saldo 4051.09.
 *   1-30: 902, 903, 909 → 1800.83 · 31-60: 904, 905 → 250.26 · +60: 906 → 2000.00
 * ARS: 2 cuotas (913, 914) de 1 venta (805), saldo 1750000.50.
 */
export const CUOTAS: CuotaFixture[] = [
    cuota(901, 81, 1, venceFront('2026-11-24'), '1000'),
    cuota(902, 81, 2, venceApi('2026-11-23'), '1000'),
    cuota(903, 81, 3, venceFront('2026-10-25'), '500.5'),
    cuota(904, 81, 4, venceFront('2026-10-24'), '250.25'),
    cuota(905, 81, 5, venceFront('2026-09-25'), '0.01'),
    cuota(906, 81, 6, venceFront('2026-09-24'), '2000'),
    cuota(907, 81, 7, venceFront('2026-08-01'), '0'),
    cuota(908, 81, 8, venceFront('2026-11-25'), '1000'),
    cuota(909, 83, 1, venceFront('2026-11-10'), '300.33'),
    cuota(910, 82, 1, venceFront('2026-10-01'), '5000'),
    cuota(911, 84, 1, venceFront('2026-10-01'), '7000'),
    cuota(912, 85, 1, venceFront('2026-10-01'), '8000'),
    cuota(913, 86, 1, venceFront('2026-11-01'), '1500000'),
    cuota(914, 86, 2, venceFront('2026-07-01'), '250000.50'),
    cuota(915, 87, 1, venceFront('2026-10-01'), '900'),
    cuota(916, 81, 9, venceApi('2026-11-24'), '1000'),
];

export const DATOS_CUOTAS: DatosCuotas = {
    fracciones: [FRACCION_VA, FRACCION_VB],
    lotes: LOTES_VENTAS,
    ventas: VENTAS_CUOTAS,
    planes: PLANES_CUOTAS,
    cuotas: CUOTAS,
};
