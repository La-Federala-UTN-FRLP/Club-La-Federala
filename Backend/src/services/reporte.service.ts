// Reportes (CCLF-38). Inventario implementado en 38.2; ventas (38.3) y cuotas vencidas (38.4)
// todavía devuelven la forma final del contrato con datos vacíos.
import prisma from '../config/prisma';
import { EstadoLote, SubestadoLote, TipoLote, Prisma } from '../generated/prisma';
import type {
    QueryReporteInventario,
    QueryReporteVentas,
    QueryReporteCuotasVencidas,
} from '../validations/reporte.validation';
import { diasInclusivos } from '../validations/reporte.validation';

// Zona de negocio: el corte y los días de los períodos son días calendario de Buenos Aires.
export const ZONA_NEGOCIO = 'America/Argentina/Buenos_Aires';

const MS_POR_DIA = 86_400_000;

/** Fecha de corte: el día actual en Buenos Aires, YYYY-MM-DD. */
export function fechaCorte(ahora: Date = new Date()): string {
    // en-CA formatea como YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: ZONA_NEGOCIO,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(ahora);
}

export interface Periodo {
    desde: string;
    hasta: string;
}

function sumarDias(fecha: string, dias: number): string {
    return new Date(Date.parse(fecha) + dias * MS_POR_DIA).toISOString().slice(0, 10);
}

/** Tramo de igual duración (días inclusivos) que termina el día anterior a `desde`. */
export function periodoAnterior({ desde, hasta }: Periodo): Periodo {
    const dias = diasInclusivos(desde, hasta);
    return { desde: sumarDias(desde, -dias), hasta: sumarDias(desde, -1) };
}

// ------------------------------------------------------------ Inventario (38.2)

export interface InventarioPorEstado {
    estado: EstadoLote;
    cantidad: number;
}

export interface InventarioPorFraccion {
    fraccionId: number;
    /** Número visible de la fracción (Fraccion.numero). */
    fraccion: number;
    cantidad: number;
    ofrecibles: number;
}

export interface InventarioPorSubestado {
    subestado: SubestadoLote;
    cantidad: number;
}

export interface InventarioFila {
    loteId: number;
    /** Lote.numero: opcional en el schema. */
    numero: number | null;
    fraccionId: number;
    /** Número visible de la fracción (Fraccion.numero). */
    fraccion: number;
    estado: EstadoLote;
    subestado: SubestadoLote;
    /** Precio cargado, decimal con 2 cifras; null si el lote no tiene precio. Sin moneda en el schema. */
    precio: string | null;
    /** Ruta del frontend que abre el lote. */
    enlace: string;
}

export interface ReporteInventario {
    corte: string;
    totales: {
        porEstado: InventarioPorEstado[];
        porFraccion: InventarioPorFraccion[];
        porSubestado: InventarioPorSubestado[];
        ofrecibles: number;
    };
    filas: InventarioFila[];
}

/** Ofrecible: estado comercial DISPONIBLE o EN_PROMOCION, con cualquier subestado. */
export const ESTADOS_OFRECIBLES: readonly EstadoLote[] = [EstadoLote.DISPONIBLE, EstadoLote.EN_PROMOCION];

// Lote no tiene baja lógica (el DELETE es físico), pero el enum conserva ELIMINADO desde la
// estandarización de estados: un lote en ese estado no forma parte del inventario.
const ESTADOS_EXCLUIDOS_INVENTARIO: EstadoLote[] = [EstadoLote.ELIMINADO];

const ORDEN_ESTADO = Object.values(EstadoLote);
const ORDEN_SUBESTADO = Object.values(SubestadoLote);

export const enlaceLote = (loteId: number) => `/?lote=${loteId}`;

/** Universo del inventario (solo LOTE_VENTA) con los filtros opcionales. Lo comparten totales y filas. */
export function whereInventario(filtros: QueryReporteInventario): Prisma.LoteWhereInput {
    return {
        tipo: TipoLote.LOTE_VENTA,
        estado: {
            notIn: ESTADOS_EXCLUIDOS_INVENTARIO,
            ...(filtros.estado !== undefined && { equals: filtros.estado }),
        },
        ...(filtros.fraccion !== undefined && { fraccionId: filtros.fraccion }),
        ...(filtros.subestado !== undefined && { subestado: filtros.subestado }),
    };
}

export async function getReporteInventario(filtros: QueryReporteInventario): Promise<ReporteInventario> {
    const corte = fechaCorte();
    const where = whereInventario(filtros);

    // Totales en la base; filas en un solo findMany (sin N+1).
    const [porFraccionYEstado, porSubestadoRaw, lotes] = await Promise.all([
        prisma.lote.groupBy({ by: ['fraccionId', 'estado'], where, _count: { _all: true } }),
        prisma.lote.groupBy({ by: ['subestado'], where, _count: { _all: true } }),
        prisma.lote.findMany({
            where,
            select: {
                id: true,
                numero: true,
                estado: true,
                subestado: true,
                precio: true,
                fraccionId: true,
                fraccion: { select: { numero: true } },
            },
            orderBy: [{ fraccion: { numero: 'asc' } }, { numero: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
        }),
    ]);

    // Número visible de cada fracción: toda fracción de los totales aparece en las filas (mismo where).
    const numeroFraccion = new Map(lotes.map((l) => [l.fraccionId, l.fraccion.numero]));

    const cantidadPorEstado = new Map<EstadoLote, number>();
    const porFraccionMap = new Map<number, InventarioPorFraccion>();
    let ofrecibles = 0;
    for (const g of porFraccionYEstado) {
        const cantidad = g._count._all;
        const esOfrecible = ESTADOS_OFRECIBLES.includes(g.estado);
        cantidadPorEstado.set(g.estado, (cantidadPorEstado.get(g.estado) ?? 0) + cantidad);
        const fraccion = porFraccionMap.get(g.fraccionId) ?? {
            fraccionId: g.fraccionId,
            fraccion: numeroFraccion.get(g.fraccionId) ?? 0,
            cantidad: 0,
            ofrecibles: 0,
        };
        fraccion.cantidad += cantidad;
        if (esOfrecible) {
            fraccion.ofrecibles += cantidad;
            ofrecibles += cantidad;
        }
        porFraccionMap.set(g.fraccionId, fraccion);
    }

    const porEstado: InventarioPorEstado[] = ORDEN_ESTADO
        .filter((estado) => (cantidadPorEstado.get(estado) ?? 0) > 0)
        .map((estado) => ({ estado, cantidad: cantidadPorEstado.get(estado)! }));

    const porFraccion = [...porFraccionMap.values()]
        .filter((f) => f.cantidad > 0)
        .sort((a, b) => a.fraccion - b.fraccion || a.fraccionId - b.fraccionId);

    const cantidadPorSubestado = new Map(porSubestadoRaw.map((g) => [g.subestado, g._count._all]));
    const porSubestado: InventarioPorSubestado[] = ORDEN_SUBESTADO
        .filter((subestado) => (cantidadPorSubestado.get(subestado) ?? 0) > 0)
        .map((subestado) => ({ subestado, cantidad: cantidadPorSubestado.get(subestado)! }));

    const filas: InventarioFila[] = lotes.map((l) => ({
        loteId: l.id,
        numero: l.numero,
        fraccionId: l.fraccionId,
        fraccion: l.fraccion.numero,
        estado: l.estado,
        subestado: l.subestado,
        precio: l.precio === null ? null : l.precio.toFixed(2),
        enlace: enlaceLote(l.id),
    }));

    return { corte, totales: { porEstado, porFraccion, porSubestado, ofrecibles }, filas };
}

// ------------------------------------------------------------ Ventas por período (38.3)

export interface TarjetaVentas {
    cantidad: number;
    montoUSD: string;
    cantidadAnterior: number;
    montoUSDAnterior: string;
}

export interface ReporteVentas {
    corte: string;
    periodo: Periodo;
    periodoAnterior: Periodo;
    tarjetas: {
        iniciadas: TarjetaVentas;
        escrituradas: TarjetaVentas;
        canceladas: TarjetaVentas;
    };
    otrasMonedas: unknown[];
    filas: unknown[];
}

const tarjetaVacia = (): TarjetaVentas => ({ cantidad: 0, montoUSD: '0.00', cantidadAnterior: 0, montoUSDAnterior: '0.00' });

export async function getReporteVentas(filtros: QueryReporteVentas): Promise<ReporteVentas> {
    // Pendiente 38.3: iniciadas, escrituradas y canceladas por su propia fecha, contra el período anterior.
    const periodo = { desde: filtros.desde, hasta: filtros.hasta };
    return {
        corte: fechaCorte(),
        periodo,
        periodoAnterior: periodoAnterior(periodo),
        tarjetas: { iniciadas: tarjetaVacia(), escrituradas: tarjetaVacia(), canceladas: tarjetaVacia() },
        otrasMonedas: [],
        filas: [],
    };
}

// ------------------------------------------------------------ Cuotas vencidas (38.4)

export interface ReporteCuotasVencidas {
    corte: string;
    moneda: QueryReporteCuotasVencidas['moneda'];
    saldoVencido: string;
    cuotas: number;
    ventas: number;
    tramos: unknown[];
    filas: unknown[];
}

export async function getReporteCuotasVencidas(filtros: QueryReporteCuotasVencidas): Promise<ReporteCuotasVencidas> {
    // Pendiente 38.4: plan VIGENTE, saldo > 0, vencimiento < corte; tramos 1–30, 31–60, >60.
    return {
        corte: fechaCorte(),
        moneda: filtros.moneda,
        saldoVencido: '0.00',
        cuotas: 0,
        ventas: 0,
        tramos: [],
        filas: [],
    };
}
