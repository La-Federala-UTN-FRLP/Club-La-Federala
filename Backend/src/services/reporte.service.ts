// Reportes (CCLF-38). Esqueleto de 38.1: cada función devuelve la forma final del contrato con
// datos vacíos. La lógica la completan 38.2 (inventario), 38.3 (ventas) y 38.4 (cuotas vencidas).
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

export interface ReporteInventario {
    corte: string;
    totales: {
        porEstado: unknown[];
        porFraccion: unknown[];
        porSubestado: unknown[];
        ofrecibles: number;
    };
    filas: unknown[];
}

export async function getReporteInventario(_filtros: QueryReporteInventario): Promise<ReporteInventario> {
    // Pendiente 38.2: conteos por estado, fracción y subestado, ofrecibles y filas (solo LOTE_VENTA).
    return {
        corte: fechaCorte(),
        totales: { porEstado: [], porFraccion: [], porSubestado: [], ofrecibles: 0 },
        filas: [],
    };
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
