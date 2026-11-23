/**
 * Fake del delegate `venta` de Prisma para el reporte de ventas por período (CCLF-54).
 *
 * En vez de devolver resultados armados a mano, evalúa sobre un set de ventas en memoria el `where`,
 * el `select` (incluida la moneda del último plan) y el `orderBy` que arma el service. Así las tarjetas
 * se pueden comparar con un conteo manual de los datos de prueba.
 *
 * Soporta solo lo que usa el reporte y falla ante cualquier otra forma de consulta: si el service
 * cambia la query, el test lo nota en vez de ignorar un filtro.
 */
import { Prisma } from '../../../src/generated/prisma';
import type { EstadoOperativo, EstadoVenta, Moneda } from '../../../src/generated/prisma';

export interface PlanFixture {
    version: number;
    moneda: Moneda;
}

export interface VentaFixture {
    id: number;
    numero: string;
    loteId: number;
    monto: string;
    estado: EstadoVenta;
    estadoOperativo: EstadoOperativo;
    /** Instantes ISO, como los guarda Prisma. */
    fechaVenta: string;
    fechaEscrituraReal: string | null;
    fechaCancelacion: string | null;
    planes: PlanFixture[];
}

export interface LoteVentaFixture {
    id: number;
    numero: number | null;
    fraccionId: number;
}

export interface FraccionVentaFixture {
    id: number;
    numero: number;
}

type Where = Record<string, unknown>;
type CampoFecha = 'fechaVenta' | 'fechaEscrituraReal' | 'fechaCancelacion';

// Forma de consulta que el service debe pedir a la base.
const SELECT_ESPERADO = {
    id: true,
    numero: true,
    loteId: true,
    monto: true,
    estado: true,
    fechaVenta: true,
    fechaEscrituraReal: true,
    fechaCancelacion: true,
    lote: { select: { numero: true, fraccionId: true, fraccion: { select: { numero: true } } } },
    planPagos: { select: { moneda: true }, orderBy: { version: 'desc' }, take: 1 },
};
const ORDER_BY_ESPERADO = [{ fechaVenta: 'desc' }, { id: 'desc' }];
const CAMPOS_FECHA: CampoFecha[] = ['fechaVenta', 'fechaEscrituraReal', 'fechaCancelacion'];

const noSoportado = (que: string): never => {
    throw new Error(`${que} no soportado por el fake`);
};

function cumpleRango(valor: string | null, rango: unknown): boolean {
    const { gte, lt, ...resto } = rango as { gte?: Date; lt?: Date };
    if (Object.keys(resto).length > 0 || !(gte instanceof Date) || !(lt instanceof Date)) {
        noSoportado(`Rango ${JSON.stringify(rango)}`);
    }
    if (valor === null) return false;
    const t = Date.parse(valor);
    return t >= gte!.getTime() && t < lt!.getTime();
}

/** Condición de una rama del OR: fecha en rango y, opcionalmente, estado exacto. */
function cumpleRama(v: VentaFixture, rama: Where): boolean {
    for (const [campo, condicion] of Object.entries(rama)) {
        if (campo === 'estado') {
            if (typeof condicion !== 'string') noSoportado('Filtro estado no escalar');
            if (v.estado !== condicion) return false;
        } else if ((CAMPOS_FECHA as string[]).includes(campo)) {
            if (!cumpleRango(v[campo as CampoFecha], condicion)) return false;
        } else {
            noSoportado(`Filtro OR.${campo}`);
        }
    }
    return true;
}

function cumple(v: VentaFixture, where: Where, lotes: Map<number, LoteVentaFixture>): boolean {
    for (const [campo, condicion] of Object.entries(where)) {
        switch (campo) {
            case 'estadoOperativo':
                if (typeof condicion !== 'string') noSoportado('Filtro estadoOperativo no escalar');
                if (v.estadoOperativo !== condicion) return false;
                break;
            case 'lote': {
                const { fraccionId, ...resto } = condicion as { fraccionId?: unknown };
                if (Object.keys(resto).length > 0 || typeof fraccionId !== 'number') noSoportado(`Filtro lote ${JSON.stringify(condicion)}`);
                if (lotes.get(v.loteId)?.fraccionId !== fraccionId) return false;
                break;
            }
            case 'OR':
                if (!Array.isArray(condicion)) noSoportado('OR no array');
                if (!(condicion as Where[]).some((rama) => cumpleRama(v, rama))) return false;
                break;
            default:
                noSoportado(`Filtro ${campo}`);
        }
    }
    return true;
}

export function crearPrismaVentasFake() {
    let ventas: VentaFixture[] = [];
    let lotes = new Map<number, LoteVentaFixture>();
    let fracciones = new Map<number, number>();

    const lote = (id: number) => lotes.get(id) ?? noSoportado(`Lote ${id} no cargado: dato`);
    const numeroFraccion = (id: number) => fracciones.get(id) ?? noSoportado(`Fracción ${id} no cargada: dato`);

    const venta = {
        findMany: jest.fn(async (args: { where: Where; select: unknown; orderBy: unknown }) => {
            const { where, select, orderBy, ...resto } = args;
            if (Object.keys(resto).length > 0) noSoportado(`findMany: opción ${Object.keys(resto)[0]}`);
            if (JSON.stringify(select) !== JSON.stringify(SELECT_ESPERADO)) noSoportado(`findMany: select ${JSON.stringify(select)}`);
            if (JSON.stringify(orderBy) !== JSON.stringify(ORDER_BY_ESPERADO)) noSoportado(`findMany: orderBy ${JSON.stringify(orderBy)}`);

            return ventas
                .filter((v) => cumple(v, where, lotes))
                .sort((a, b) => Date.parse(b.fechaVenta) - Date.parse(a.fechaVenta) || b.id - a.id)
                .map((v) => {
                    const l = lote(v.loteId);
                    const ultimoPlan = [...v.planes].sort((a, b) => b.version - a.version).slice(0, 1);
                    return {
                        id: v.id,
                        numero: v.numero,
                        loteId: v.loteId,
                        monto: new Prisma.Decimal(v.monto),
                        estado: v.estado,
                        fechaVenta: new Date(v.fechaVenta),
                        fechaEscrituraReal: v.fechaEscrituraReal === null ? null : new Date(v.fechaEscrituraReal),
                        fechaCancelacion: v.fechaCancelacion === null ? null : new Date(v.fechaCancelacion),
                        lote: { numero: l.numero, fraccionId: l.fraccionId, fraccion: { numero: numeroFraccion(l.fraccionId) } },
                        planPagos: ultimoPlan.map((p) => ({ moneda: p.moneda })),
                    };
                });
        }),
    };

    return {
        venta,
        /** Reemplaza el set de datos de la "base". */
        cargar(datos: { fracciones: FraccionVentaFixture[]; lotes: LoteVentaFixture[]; ventas: VentaFixture[] }) {
            fracciones = new Map(datos.fracciones.map((f) => [f.id, f.numero]));
            lotes = new Map(datos.lotes.map((l) => [l.id, { ...l }]));
            ventas = datos.ventas.map((v) => ({ ...v, planes: v.planes.map((p) => ({ ...p })) }));
        },
    };
}

export type PrismaVentasFake = ReturnType<typeof crearPrismaVentasFake>;

// ------------------------------------------------------------ Set de datos de prueba

// Período de referencia de los tests: noviembre 2026 (30 días). El anterior es 02/10 – 31/10.
export const PERIODO_NOVIEMBRE = { desde: '2026-11-01', hasta: '2026-11-30' };

// Ids y números de fracción cruzados a propósito, como en el inventario.
export const FRACCION_VA: FraccionVentaFixture = { id: 10, numero: 2 };
export const FRACCION_VB: FraccionVentaFixture = { id: 20, numero: 1 };

export const LOTES_VENTAS: LoteVentaFixture[] = [
    { id: 501, numero: 1, fraccionId: FRACCION_VA.id },
    { id: 502, numero: 2, fraccionId: FRACCION_VA.id },
    { id: 503, numero: 1, fraccionId: FRACCION_VB.id },
    { id: 504, numero: 2, fraccionId: FRACCION_VB.id },
    { id: 505, numero: null, fraccionId: FRACCION_VA.id },
];

/** Día cargado desde el frontend: el alta de ventas guarda YYYY-MM-DDT12:00:00Z (09:00 en Buenos Aires). */
export const dia = (fecha: string) => `${fecha}T12:00:00.000Z`;

const USD: PlanFixture[] = [{ version: 1, moneda: 'USD' }];
const SIN_PLAN: PlanFixture[] = [];
// Plan reemplazado: la moneda sale del último (version 2). Ambos en ARS, como exige el reemplazo.
const ARS: PlanFixture[] = [{ version: 1, moneda: 'ARS' }, { version: 2, moneda: 'ARS' }];

type Opciones = Partial<Pick<VentaFixture, 'fechaEscrituraReal' | 'fechaCancelacion' | 'estadoOperativo' | 'planes'>>;

const v = (id: number, loteId: number, estado: EstadoVenta, fechaVenta: string, monto: string, op: Opciones = {}): VentaFixture => ({
    id,
    numero: `CCLF-2026-${id}`,
    loteId,
    monto,
    estado,
    estadoOperativo: op.estadoOperativo ?? 'OPERATIVO',
    fechaVenta,
    fechaEscrituraReal: op.fechaEscrituraReal ?? null,
    fechaCancelacion: op.fechaCancelacion ?? null,
    planes: op.planes ?? USD,
});

/**
 * Ventas del set. Contra PERIODO_NOVIEMBRE (anterior: 02/10 – 31/10):
 *
 * | id  | lote | estado      | alta (BA)        | escritura | cancelación | moneda | monto      | cuenta en                                  |
 * |-----|------|-------------|------------------|-----------|-------------|--------|------------|--------------------------------------------|
 * | 601 | 501  | ESCRITURADO | 15/10            | 10/11     |             | USD    | 100000     | REP-A2: iniciada ant., escriturada actual  |
 * | 602 | 502  | ESCRITURADO | 05/11            | 03/12     |             | (sin plan → USD) | 80000 | iniciada actual; escritura fuera  |
 * | 603 | 503  | CANCELADA   | 02/11            |           | 20/11       | USD    | 50000.50   | iniciada y cancelada actual                |
 * | 604 | 504  | CANCELADA   | 20/09            |           | 10/10       | USD    | 30000      | cancelada anterior                         |
 * | 605 | 505  | CON_BOLETO  | 31/10 23:59:59   |           |             | USD    | 10000      | borde: 01/11 02:59:59Z → iniciada anterior |
 * | 606 | 502  | INICIADA    | 01/11 00:00      |           |             | USD    | 20000      | borde: 01/11 03:00Z → iniciada actual      |
 * | 607 | 503  | INICIADA    | 30/11 23:59:59   |           |             | USD    | 5000       | borde: 01/12 02:59:59Z → iniciada actual   |
 * | 608 | 501  | INICIADA    | 01/12 00:00      |           |             | USD    | 7000       | borde: 01/12 03:00Z → fuera                |
 * | 609 | 504  | INICIADA    | 12/11            |           |             | ARS    | 9000000    | otrasMonedas: iniciada actual              |
 * | 610 | 503  | CANCELADA   | 20/10            |           | 03/11       | ARS    | 4000000    | otrasMonedas: iniciada ant., cancelada act.|
 * | 611 | 502  | CANCELADA   | 10/11            |           | 11/11       | USD    | 999999     | ELIMINADA: no cuenta                       |
 * | 612 | 501  | CON_BOLETO  | 01/08            | 15/11 (*) |             | USD    | 123456     | (*) fecha sin estado ESCRITURADO: no cuenta|
 * | 613 | 505  | ESCRITURADO | 01/06            | 25/11     |             | USD    | 60000      | escriturada actual, iniciada fuera         |
 */
export const VENTAS_REPORTE: VentaFixture[] = [
    v(601, 501, 'ESCRITURADO', dia('2026-10-15'), '100000', { fechaEscrituraReal: dia('2026-11-10') }),
    v(602, 502, 'ESCRITURADO', dia('2026-11-05'), '80000.00', { fechaEscrituraReal: dia('2026-12-03'), planes: SIN_PLAN }),
    v(603, 503, 'CANCELADA', dia('2026-11-02'), '50000.5', { fechaCancelacion: dia('2026-11-20') }),
    v(604, 504, 'CANCELADA', dia('2026-09-20'), '30000', { fechaCancelacion: dia('2026-10-10') }),
    v(605, 505, 'CON_BOLETO', '2026-11-01T02:59:59.000Z', '10000'),
    v(606, 502, 'INICIADA', '2026-11-01T03:00:00.000Z', '20000'),
    v(607, 503, 'INICIADA', '2026-12-01T02:59:59.000Z', '5000'),
    v(608, 501, 'INICIADA', '2026-12-01T03:00:00.000Z', '7000'),
    v(609, 504, 'INICIADA', dia('2026-11-12'), '9000000', { planes: ARS }),
    v(610, 503, 'CANCELADA', dia('2026-10-20'), '4000000', { fechaCancelacion: dia('2026-11-03'), planes: ARS }),
    v(611, 502, 'CANCELADA', dia('2026-11-10'), '999999', { fechaCancelacion: dia('2026-11-11'), estadoOperativo: 'ELIMINADO' }),
    v(612, 501, 'CON_BOLETO', dia('2026-08-01'), '123456', { fechaEscrituraReal: dia('2026-11-15') }),
    v(613, 505, 'ESCRITURADO', dia('2026-06-01'), '60000', { fechaEscrituraReal: dia('2026-11-25') }),
];

export const DATOS_VENTAS = { fracciones: [FRACCION_VA, FRACCION_VB], lotes: LOTES_VENTAS, ventas: VENTAS_REPORTE };
