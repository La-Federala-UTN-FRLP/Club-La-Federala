/**
 * Fake del delegate `lote` de Prisma para el reporte de inventario (CCLF-53).
 *
 * En vez de devolver resultados armados a mano, evalúa sobre un set de lotes en memoria el `where`,
 * el `groupBy` y el `orderBy` que arma el service. Así los totales del reporte se pueden comparar
 * con un conteo manual de los datos de prueba.
 *
 * Soporta solo lo que usa el reporte y falla ante cualquier otra forma de consulta: si el service
 * cambia la query, el test lo nota en vez de ignorar un filtro.
 */
import { Prisma } from '../../../src/generated/prisma';
import type { EstadoLote, SubestadoLote, TipoLote } from '../../../src/generated/prisma';

export interface LoteFixture {
    id: number;
    tipo: TipoLote;
    fraccionId: number;
    numero: number | null;
    estado: EstadoLote;
    subestado: SubestadoLote;
    precio: string | null;
}

export interface FraccionFixture {
    id: number;
    numero: number;
}

type Where = Record<string, unknown>;

// Orden que el service debe pedir a la base para las filas.
const ORDER_BY_FILAS = [{ fraccion: { numero: 'asc' } }, { numero: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }];

const SELECT_FILAS = {
    id: true,
    numero: true,
    estado: true,
    subestado: true,
    precio: true,
    fraccionId: true,
    fraccion: { select: { numero: true } },
};

function cumple(lote: LoteFixture, where: Where): boolean {
    for (const [campo, condicion] of Object.entries(where)) {
        switch (campo) {
            case 'tipo':
            case 'fraccionId':
            case 'subestado':
                if (typeof condicion === 'object' && condicion !== null) throw new Error(`Filtro ${campo} no soportado por el fake`);
                if (lote[campo] !== condicion) return false;
                break;
            case 'estado': {
                const { notIn, equals, ...resto } = condicion as { notIn?: EstadoLote[]; equals?: EstadoLote };
                if (Object.keys(resto).length > 0) throw new Error(`Filtro estado.${Object.keys(resto)[0]} no soportado por el fake`);
                if (notIn?.includes(lote.estado)) return false;
                if (equals !== undefined && lote.estado !== equals) return false;
                break;
            }
            default:
                throw new Error(`Filtro ${campo} no soportado por el fake`);
        }
    }
    return true;
}

export function crearPrismaInventarioFake() {
    let lotes: LoteFixture[] = [];
    let fracciones = new Map<number, number>();

    const filtrar = (where: Where = {}) => lotes.filter((l) => cumple(l, where));

    const lote = {
        groupBy: jest.fn(async (args: { by: (keyof LoteFixture)[]; where: Where; _count: unknown }) => {
            const { by, where, _count, ...resto } = args;
            if (Object.keys(resto).length > 0) throw new Error(`groupBy: opción ${Object.keys(resto)[0]} no soportada por el fake`);
            if (JSON.stringify(_count) !== JSON.stringify({ _all: true })) throw new Error('groupBy: solo _count: { _all: true }');
            const grupos = new Map<string, Record<string, unknown> & { _count: { _all: number } }>();
            for (const l of filtrar(where)) {
                const clave = JSON.stringify(by.map((k) => l[k]));
                const grupo = grupos.get(clave) ?? { ...Object.fromEntries(by.map((k) => [k, l[k]])), _count: { _all: 0 } };
                grupo._count._all += 1;
                grupos.set(clave, grupo);
            }
            // Sin orderBy la base no garantiza orden: se devuelven invertidos para que el service ordene.
            return [...grupos.values()].reverse();
        }),
        findMany: jest.fn(async (args: { where: Where; select: unknown; orderBy: unknown }) => {
            const { where, select, orderBy, ...resto } = args;
            if (Object.keys(resto).length > 0) throw new Error(`findMany: opción ${Object.keys(resto)[0]} no soportada por el fake`);
            if (JSON.stringify(select) !== JSON.stringify(SELECT_FILAS)) throw new Error(`findMany: select inesperado ${JSON.stringify(select)}`);
            if (JSON.stringify(orderBy) !== JSON.stringify(ORDER_BY_FILAS)) throw new Error(`findMany: orderBy inesperado ${JSON.stringify(orderBy)}`);
            const numeroFraccion = (id: number) => {
                const numero = fracciones.get(id);
                if (numero === undefined) throw new Error(`Fracción ${id} no cargada en el fake`);
                return numero;
            };
            return filtrar(where)
                .sort((a, b) =>
                    numeroFraccion(a.fraccionId) - numeroFraccion(b.fraccionId)
                    || (a.numero ?? Infinity) - (b.numero ?? Infinity)
                    || a.id - b.id)
                .map((l) => ({
                    id: l.id,
                    numero: l.numero,
                    estado: l.estado,
                    subestado: l.subestado,
                    precio: l.precio === null ? null : new Prisma.Decimal(l.precio),
                    fraccionId: l.fraccionId,
                    fraccion: { numero: numeroFraccion(l.fraccionId) },
                }));
        }),
    };

    return {
        lote,
        /** Reemplaza el set de datos de la "base". */
        cargar(datos: { fracciones: FraccionFixture[]; lotes: LoteFixture[] }) {
            fracciones = new Map(datos.fracciones.map((f) => [f.id, f.numero]));
            lotes = datos.lotes.map((l) => ({ ...l }));
        },
    };
}

export type PrismaInventarioFake = ReturnType<typeof crearPrismaInventarioFake>;

// ------------------------------------------------------------ Set de datos de prueba

// Ids y números de fracción cruzados a propósito: el orden es por número, no por id.
export const FRACCION_A: FraccionFixture = { id: 10, numero: 2 };
export const FRACCION_B: FraccionFixture = { id: 20, numero: 1 };

const venta = (id: number, f: FraccionFixture, numero: number | null, estado: EstadoLote, subestado: SubestadoLote, precio: string | null): LoteFixture =>
    ({ id, tipo: 'LOTE_VENTA', fraccionId: f.id, numero, estado, subestado, precio });

/**
 * Lotes en todos los estados del enum, 2 fracciones y los 3 subestados.
 * Fuera del universo: 2 ESPACIO_COMUN (201, 202) y un lote en estado ELIMINADO (110).
 */
export const LOTES_INVENTARIO: LoteFixture[] = [
    venta(101, FRACCION_A, 5, 'DISPONIBLE', 'CONSTRUIDO', '85000'),
    venta(102, FRACCION_A, 3, 'EN_PROMOCION', 'NO_CONSTRUIDO', '72000.5'),
    venta(103, FRACCION_A, 7, 'RESERVADO', 'CONSTRUIDO', '90000.00'),
    venta(104, FRACCION_A, 1, 'VENDIDO', 'EN_CONSTRUCCION', null),
    venta(105, FRACCION_A, null, 'NO_DISPONIBLE', 'NO_CONSTRUIDO', '1000'),
    venta(112, FRACCION_A, 9, 'DISPONIBLE', 'CONSTRUIDO', '88000'),
    venta(106, FRACCION_B, 2, 'DISPONIBLE', 'NO_CONSTRUIDO', '50000'),
    venta(107, FRACCION_B, 1, 'CON_PRIORIDAD', 'CONSTRUIDO', '60000.75'),
    venta(108, FRACCION_B, 4, 'ALQUILADO', 'CONSTRUIDO', '45000'),
    venta(109, FRACCION_B, 3, 'OPERATIVO', 'EN_CONSTRUCCION', null),
    venta(110, FRACCION_B, 6, 'ELIMINADO', 'CONSTRUIDO', '1'),
    venta(111, FRACCION_B, 5, 'EN_PROMOCION', 'CONSTRUIDO', '55000'),
    { id: 201, tipo: 'ESPACIO_COMUN', fraccionId: FRACCION_A.id, numero: null, estado: 'DISPONIBLE', subestado: 'CONSTRUIDO', precio: null },
    { id: 202, tipo: 'ESPACIO_COMUN', fraccionId: FRACCION_B.id, numero: null, estado: 'NO_DISPONIBLE', subestado: 'NO_CONSTRUIDO', precio: null },
];

export const DATOS_INVENTARIO = { fracciones: [FRACCION_A, FRACCION_B], lotes: LOTES_INVENTARIO };
