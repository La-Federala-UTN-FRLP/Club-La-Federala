// Reportes (CCLF-38). Inventario (38.2), ventas por período (38.3) y cuotas vencidas (38.4).
import prisma from '../config/prisma';
import {
    EstadoLote,
    EstadoOperativo,
    EstadoPlanPago,
    EstadoVenta,
    Moneda,
    SubestadoLote,
    TipoLote,
    Prisma,
} from '../generated/prisma';
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

/** Igual que TarjetaVentas, para una moneda distinta de USD: el monto va en esa moneda. */
export interface TarjetaOtraMoneda {
    cantidad: number;
    monto: string;
    cantidadAnterior: number;
    montoAnterior: string;
}

export interface VentasOtraMoneda {
    moneda: Moneda;
    iniciadas: TarjetaOtraMoneda;
    escrituradas: TarjetaOtraMoneda;
    canceladas: TarjetaOtraMoneda;
}

export interface VentaFila {
    ventaId: number;
    /** Venta.numero (texto único de la venta). */
    numero: string;
    loteId: number;
    /** Lote.numero: opcional en el schema. */
    loteNumero: number | null;
    fraccionId: number;
    /** Número visible de la fracción (Fraccion.numero). */
    fraccion: number;
    estado: EstadoVenta;
    /** Día de negocio (Buenos Aires) de Venta.fechaVenta. */
    fechaAlta: string;
    /** Día de negocio de Venta.fechaEscrituraReal, o null. */
    fechaEscritura: string | null;
    /** Día de negocio de Venta.fechaCancelacion, o null. */
    fechaCancelacion: string | null;
    /** Moneda de la venta: la de su plan de pagos (USD si no tiene plan). */
    moneda: Moneda;
    /** Venta.monto, decimal con 2 cifras, en `moneda`. */
    monto: string;
    /** Ruta del frontend que abre la venta. */
    enlace: string;
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
    otrasMonedas: VentasOtraMoneda[];
    filas: VentaFila[];
}

// Argentina no tiene horario de verano desde 2009: el día de negocio va de 00:00 a 24:00 en UTC-3.
const OFFSET_NEGOCIO = '-03:00';

/** Instante en que empieza el día `fecha` (YYYY-MM-DD) en Buenos Aires. */
export function inicioDiaNegocio(fecha: string): Date {
    return new Date(`${fecha}T00:00:00${OFFSET_NEGOCIO}`);
}

/** Rango semiabierto [inicio de `desde`, inicio del día siguiente a `hasta`) en días de Buenos Aires. */
export function rangoNegocio({ desde, hasta }: Periodo): { gte: Date; lt: Date } {
    return { gte: inicioDiaNegocio(desde), lt: inicioDiaNegocio(sumarDias(hasta, 1)) };
}

/** Día de Buenos Aires (YYYY-MM-DD) en el que cae un instante. */
export const diaNegocio = (instante: Date): string => fechaCorte(instante);

export const enlaceVenta = (ventaId: number) => `/ventas?openId=${ventaId}`;

/** Moneda en la que se informa una venta sin plan de pagos: la que usa el alta de ventas. */
export const MONEDA_VENTA_SIN_PLAN = Moneda.USD;

/** Métrica de cada tarjeta: qué fecha la cuenta y en qué estado tiene que estar la venta. */
const METRICAS = [
    { tarjeta: 'iniciadas', fecha: 'fechaVenta', estado: undefined },
    { tarjeta: 'escrituradas', fecha: 'fechaEscrituraReal', estado: EstadoVenta.ESCRITURADO },
    { tarjeta: 'canceladas', fecha: 'fechaCancelacion', estado: EstadoVenta.CANCELADA },
] as const;

type Metrica = (typeof METRICAS)[number];
type NombreTarjeta = Metrica['tarjeta'];

// Select de la consulta del reporte. Trae la moneda del último plan (todas las versiones de un plan
// comparten moneda: el reemplazo no permite cambiarla).
export const SELECT_VENTAS_REPORTE = {
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
} satisfies Prisma.VentaSelect;

export const ORDER_BY_VENTAS_REPORTE = [
    { fechaVenta: 'desc' },
    { id: 'desc' },
] satisfies Prisma.VentaOrderByWithRelationInput[];

/**
 * Ventas no eliminadas con alguna de sus 3 fechas en `rango`. Escrituradas y canceladas solo cuentan
 * si la venta está en ese estado: ESCRITURADO y CANCELADA no tienen transiciones de salida, así que
 * una fecha cargada en otro estado no es un hecho ocurrido.
 */
export function whereVentasReporte(rango: { gte: Date; lt: Date }, fraccionId?: number): Prisma.VentaWhereInput {
    return {
        estadoOperativo: EstadoOperativo.OPERATIVO,
        ...(fraccionId !== undefined && { lote: { fraccionId } }),
        OR: [
            { fechaVenta: rango },
            { estado: EstadoVenta.ESCRITURADO, fechaEscrituraReal: rango },
            { estado: EstadoVenta.CANCELADA, fechaCancelacion: rango },
        ],
    };
}

type VentaReporte = Prisma.VentaGetPayload<{ select: typeof SELECT_VENTAS_REPORTE }>;

/** Día de negocio en que la venta cuenta para la métrica, o null si no cuenta. */
function diaDeMetrica(v: VentaReporte, m: Metrica): string | null {
    const fecha = v[m.fecha];
    if (fecha === null) return null;
    if (m.estado !== undefined && v.estado !== m.estado) return null;
    return diaNegocio(fecha);
}

const enPeriodo = (dia: string | null, p: Periodo) => dia !== null && dia >= p.desde && dia <= p.hasta;

interface Acumulado {
    cantidad: number;
    monto: Prisma.Decimal;
    cantidadAnterior: number;
    montoAnterior: Prisma.Decimal;
}

const acumuladoVacio = (): Acumulado => ({
    cantidad: 0,
    monto: new Prisma.Decimal(0),
    cantidadAnterior: 0,
    montoAnterior: new Prisma.Decimal(0),
});

type AcumuladoMoneda = Record<NombreTarjeta, Acumulado>;

const acumuladoMonedaVacio = (): AcumuladoMoneda => ({
    iniciadas: acumuladoVacio(),
    escrituradas: acumuladoVacio(),
    canceladas: acumuladoVacio(),
});

const ORDEN_MONEDA = Object.values(Moneda);

export async function getReporteVentas(filtros: QueryReporteVentas): Promise<ReporteVentas> {
    const corte = fechaCorte();
    const periodo: Periodo = { desde: filtros.desde, hasta: filtros.hasta };
    const anterior = periodoAnterior(periodo);

    // Una sola consulta cubre los dos períodos (contiguos); la clasificación se hace acá porque
    // cada venta cuenta en hasta 3 tarjetas por fechas distintas y la moneda sale de la relación
    // con el plan, que groupBy no admite.
    const ventas = await prisma.venta.findMany({
        where: whereVentasReporte(rangoNegocio({ desde: anterior.desde, hasta: periodo.hasta }), filtros.fraccion),
        select: SELECT_VENTAS_REPORTE,
        orderBy: ORDER_BY_VENTAS_REPORTE,
    });

    const porMoneda = new Map<Moneda, AcumuladoMoneda>();
    const filas: VentaFila[] = [];

    for (const v of ventas) {
        const moneda = v.planPagos[0]?.moneda ?? MONEDA_VENTA_SIN_PLAN;
        const acumulado = porMoneda.get(moneda) ?? acumuladoMonedaVacio();
        let entraEnPeriodo = false;

        for (const m of METRICAS) {
            const dia = diaDeMetrica(v, m);
            const a = acumulado[m.tarjeta];
            if (enPeriodo(dia, periodo)) {
                a.cantidad += 1;
                a.monto = a.monto.plus(v.monto);
                entraEnPeriodo = true;
            } else if (enPeriodo(dia, anterior)) {
                a.cantidadAnterior += 1;
                a.montoAnterior = a.montoAnterior.plus(v.monto);
            }
        }
        porMoneda.set(moneda, acumulado);

        // Filas: las ventas que suman en alguna tarjeta del período elegido.
        if (entraEnPeriodo) {
            filas.push({
                ventaId: v.id,
                numero: v.numero,
                loteId: v.loteId,
                loteNumero: v.lote.numero,
                fraccionId: v.lote.fraccionId,
                fraccion: v.lote.fraccion.numero,
                estado: v.estado,
                fechaAlta: diaNegocio(v.fechaVenta),
                fechaEscritura: v.fechaEscrituraReal && diaNegocio(v.fechaEscrituraReal),
                fechaCancelacion: v.fechaCancelacion && diaNegocio(v.fechaCancelacion),
                moneda,
                monto: v.monto.toFixed(2),
                enlace: enlaceVenta(v.id),
            });
        }
    }

    const usd = porMoneda.get(Moneda.USD) ?? acumuladoMonedaVacio();
    const tarjetaUSD = (a: Acumulado): TarjetaVentas => ({
        cantidad: a.cantidad,
        montoUSD: a.monto.toFixed(2),
        cantidadAnterior: a.cantidadAnterior,
        montoUSDAnterior: a.montoAnterior.toFixed(2),
    });
    const tarjetaOtra = (a: Acumulado): TarjetaOtraMoneda => ({
        cantidad: a.cantidad,
        monto: a.monto.toFixed(2),
        cantidadAnterior: a.cantidadAnterior,
        montoAnterior: a.montoAnterior.toFixed(2),
    });
    const tieneMovimiento = (a: AcumuladoMoneda) =>
        Object.values(a).some((t) => t.cantidad > 0 || t.cantidadAnterior > 0);

    // Otras monedas: cada una aparte, sin convertir ni sumar a USD; solo las que tienen ventas.
    const otrasMonedas: VentasOtraMoneda[] = ORDEN_MONEDA
        .filter((moneda) => moneda !== Moneda.USD)
        .flatMap((moneda) => {
            const a = porMoneda.get(moneda);
            if (!a || !tieneMovimiento(a)) return [];
            return [{
                moneda,
                iniciadas: tarjetaOtra(a.iniciadas),
                escrituradas: tarjetaOtra(a.escrituradas),
                canceladas: tarjetaOtra(a.canceladas),
            }];
        });

    return {
        corte,
        periodo,
        periodoAnterior: anterior,
        tarjetas: {
            iniciadas: tarjetaUSD(usd.iniciadas),
            escrituradas: tarjetaUSD(usd.escrituradas),
            canceladas: tarjetaUSD(usd.canceladas),
        },
        otrasMonedas,
        filas,
    };
}

// ------------------------------------------------------------ Cuotas vencidas (38.4)

/** Tramos de atraso, en días contados desde el vencimiento hasta el corte. */
export const TRAMOS_ATRASO = ['1-30', '31-60', '+60'] as const;
export type TramoAtraso = (typeof TRAMOS_ATRASO)[number];

export function tramoDeAtraso(diasAtraso: number): TramoAtraso {
    if (diasAtraso <= 30) return '1-30';
    if (diasAtraso <= 60) return '31-60';
    return '+60';
}

export interface TramoCuotasVencidas {
    tramo: TramoAtraso;
    cuotas: number;
    /** Saldo vencido del tramo, decimal con 2 cifras, en la moneda del reporte. */
    saldo: string;
}

export interface CuotaVencidaFila {
    cuotaId: number;
    ventaId: number;
    /** Venta.numero (texto único de la venta). */
    ventaNumero: string;
    loteId: number;
    /** Lote.numero: opcional en el schema. */
    loteNumero: number | null;
    /** Número visible de la fracción (Fraccion.numero). */
    fraccion: number;
    numeroCuota: number;
    /** PlanPago.cantidadCuotas del plan vigente. */
    cantidadCuotas: number;
    /** Día de vencimiento (YYYY-MM-DD). */
    fechaVencimiento: string;
    diasAtraso: number;
    tramo: TramoAtraso;
    /** CuotaPlanPago.saldoPendiente (incluye recargos), decimal con 2 cifras. */
    saldoPendiente: string;
    /** Ruta del frontend que abre los pagos de la venta. */
    enlace: string;
}

export interface ReporteCuotasVencidas {
    corte: string;
    moneda: Moneda;
    saldoVencido: string;
    cuotas: number;
    ventas: number;
    tramos: TramoCuotasVencidas[];
    filas: CuotaVencidaFila[];
}

export const enlacePagosVenta = (ventaId: number) => `/ventas/${ventaId}/pagos`;

/**
 * Día de calendario de un vencimiento. fechaVencimiento es una fecha sin hora guardada como instante:
 * el frontend la manda a las 12:00Z y la API con "YYYY-MM-DD" la guarda a las 00:00Z. Su día es el
 * de UTC; pasarla a Buenos Aires correría al día anterior las guardadas a las 00:00Z.
 */
export const diaVencimiento = (fechaVencimiento: Date): string => fechaVencimiento.toISOString().slice(0, 10);

/** Primer instante cuyo día de vencimiento es `corte`: vencida ⇔ fechaVencimiento < este límite. */
export const limiteVencimiento = (corte: string): Date => new Date(`${corte}T00:00:00.000Z`);

/** Días entre el día de vencimiento y el corte (1 si venció ayer). */
export const diasDeAtraso = (vencimiento: string, corte: string): number => diasInclusivos(vencimiento, corte) - 1;

/**
 * Cuotas vencidas al corte: plan VIGENTE en la moneda pedida, saldo > 0, vencimiento anterior al día
 * de corte, de ventas no canceladas ni dadas de baja lógica. Una cuota que vence el día de corte no
 * está vencida.
 */
export function whereCuotasVencidas(corte: string, filtros: QueryReporteCuotasVencidas): Prisma.CuotaPlanPagoWhereInput {
    return {
        saldoPendiente: { gt: 0 },
        fechaVencimiento: { lt: limiteVencimiento(corte) },
        planPago: {
            estadoPlan: EstadoPlanPago.VIGENTE,
            moneda: filtros.moneda,
            venta: {
                estadoOperativo: EstadoOperativo.OPERATIVO,
                estado: { not: EstadoVenta.CANCELADA },
                ...(filtros.fraccion !== undefined && { lote: { fraccionId: filtros.fraccion } }),
            },
        },
    };
}

export const SELECT_CUOTAS_VENCIDAS = {
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
} satisfies Prisma.CuotaPlanPagoSelect;

export const ORDER_BY_CUOTAS_VENCIDAS = [
    { fechaVencimiento: 'asc' },
    { id: 'asc' },
] satisfies Prisma.CuotaPlanPagoOrderByWithRelationInput[];

export async function getReporteCuotasVencidas(filtros: QueryReporteCuotasVencidas): Promise<ReporteCuotasVencidas> {
    const corte = fechaCorte();

    const cuotasVencidas = await prisma.cuotaPlanPago.findMany({
        where: whereCuotasVencidas(corte, filtros),
        select: SELECT_CUOTAS_VENCIDAS,
        orderBy: ORDER_BY_CUOTAS_VENCIDAS,
    });

    const filas: CuotaVencidaFila[] = cuotasVencidas
        .map((c) => {
            const venta = c.planPago.venta;
            const fechaVencimiento = diaVencimiento(c.fechaVencimiento);
            const diasAtraso = diasDeAtraso(fechaVencimiento, corte);
            return {
                cuotaId: c.id,
                ventaId: venta.id,
                ventaNumero: venta.numero,
                loteId: venta.loteId,
                loteNumero: venta.lote.numero,
                fraccion: venta.lote.fraccion.numero,
                numeroCuota: c.numeroCuota,
                cantidadCuotas: c.planPago.cantidadCuotas,
                fechaVencimiento,
                diasAtraso,
                tramo: tramoDeAtraso(diasAtraso),
                saldoPendiente: c.saldoPendiente.toFixed(2),
                enlace: enlacePagosVenta(venta.id),
            };
        })
        // Más atrasadas primero; dos cuotas del mismo día, por id.
        .sort((a, b) => b.diasAtraso - a.diasAtraso || a.cuotaId - b.cuotaId);

    // Totales en Decimal sobre el saldo de la base: nunca se pasa por float.
    const saldoPorTramo = new Map<TramoAtraso, { cuotas: number; saldo: Prisma.Decimal }>(
        TRAMOS_ATRASO.map((t) => [t, { cuotas: 0, saldo: new Prisma.Decimal(0) }]),
    );
    let saldoVencido = new Prisma.Decimal(0);
    for (const c of cuotasVencidas) {
        const tramo = tramoDeAtraso(diasDeAtraso(diaVencimiento(c.fechaVencimiento), corte));
        const t = saldoPorTramo.get(tramo)!;
        t.cuotas += 1;
        t.saldo = t.saldo.plus(c.saldoPendiente);
        saldoVencido = saldoVencido.plus(c.saldoPendiente);
    }

    return {
        corte,
        moneda: filtros.moneda,
        saldoVencido: saldoVencido.toFixed(2),
        cuotas: filas.length,
        ventas: new Set(filas.map((f) => f.ventaId)).size,
        // Siempre los 3 tramos, en orden, aunque alguno quede en cero.
        tramos: TRAMOS_ATRASO.map((tramo) => {
            const t = saldoPorTramo.get(tramo)!;
            return { tramo, cuotas: t.cuotas, saldo: t.saldo.toFixed(2) };
        }),
        filas,
    };
}
