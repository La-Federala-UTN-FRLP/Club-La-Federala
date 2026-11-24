// Exportación a Excel de los reportes (CCLF-56, subtarea 38.5).
//
// Arma el .xlsx a partir del mismo objeto que devuelve el reporte JSON: no consulta la base ni
// recalcula cifras, así las filas del archivo son las de la pantalla (REP-A5) y el archivo no puede
// exponer nada que el JSON no exponga. Cada libro tiene tres hojas:
//   - la hoja de datos (una fila por fila del reporte),
//   - "Totales" (los agregados del reporte, sin recalcular),
//   - "Parámetros" (fecha de corte, fecha y hora de generación y filtros usados).
//
// Montos: número con formato de su moneda ("USD" #,##0.00 / "ARS" #,##0.00); ARS y USD nunca se suman.
// Fechas: los días del reporte (YYYY-MM-DD) se escriben como fecha de Excel a las 00:00 de ese día,
// sin pasar por ninguna zona horaria, para que no se corran de día. Nulos: celda vacía.
import { Workbook } from 'exceljs';
import type { Worksheet } from 'exceljs';
import type { EstadoLote, EstadoVenta, Moneda, SubestadoLote } from '../generated/prisma';
import { ZONA_NEGOCIO } from './reporte.service';
import type {
    CuotaVencidaFila,
    FraccionFiltro,
    InventarioFila,
    ReporteCuotasVencidas,
    ReporteInventario,
    ReporteVentas,
    TarjetaOtraMoneda,
    TarjetaVentas,
    VentaFila,
} from './reporte.service';
import type { QueryReporteInventario } from '../validations/reporte.validation';

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const FORMATO_FECHA = 'dd/mm/yyyy';
export const FORMATO_FECHA_HORA = 'dd/mm/yyyy hh:mm';
/** Formato de monto de Excel para una moneda: "USD" #,##0.00. */
export const formatoMoneda = (moneda: Moneda) => `"${moneda}" #,##0.00`;

export const HOJA_TOTALES = 'Totales';
export const HOJA_PARAMETROS = 'Parámetros';

/** Archivo listo para enviar: nombre (solo [a-z0-9._-]) y contenido. */
export interface ArchivoXlsx {
    nombre: string;
    contenido: Buffer;
}

/** Datos de la exportación que no vienen en el reporte JSON. */
export interface ContextoExportacion {
    /** Instante de generación (se muestra en hora de Buenos Aires). */
    generado: Date;
    /** Fracción filtrada con su número visible; undefined si no se filtró. */
    fraccion?: FraccionFiltro;
}

// ------------------------------------------------------------ Etiquetas

// Las mismas etiquetas que muestra la pantalla de Reportes (frontend/src/components/Reportes/etiquetas.js).
const ETIQUETA_ESTADO_LOTE: Record<EstadoLote, string> = {
    OPERATIVO: 'Operativo',
    ELIMINADO: 'Eliminado',
    ALQUILADO: 'Alquilado',
    CON_PRIORIDAD: 'Con prioridad',
    DISPONIBLE: 'Disponible',
    EN_PROMOCION: 'En promoción',
    NO_DISPONIBLE: 'No disponible',
    RESERVADO: 'Reservado',
    VENDIDO: 'Vendido',
};

const ETIQUETA_SUBESTADO: Record<SubestadoLote, string> = {
    CONSTRUIDO: 'Construido',
    NO_CONSTRUIDO: 'No construido',
    EN_CONSTRUCCION: 'En construcción',
};

// Las del listado de ventas (StatusBadge: "Con boleto", "Escriturado").
const ETIQUETA_ESTADO_VENTA: Record<EstadoVenta, string> = {
    INICIADA: 'Iniciada',
    CON_BOLETO: 'Con boleto',
    ESCRITURADO: 'Escriturado',
    CANCELADA: 'Cancelada',
};

export const etiquetaEstadoLote = (estado: EstadoLote) => ETIQUETA_ESTADO_LOTE[estado];
export const etiquetaSubestado = (subestado: SubestadoLote) => ETIQUETA_SUBESTADO[subestado];
export const etiquetaEstadoVenta = (estado: EstadoVenta) => ETIQUETA_ESTADO_VENTA[estado];

export const SIN_FILTRO_FRACCION = 'Todas';
export const SIN_FILTRO = 'Todos';

// ------------------------------------------------------------ Valores de celda

type ValorCelda = string | number | Date | null;

/** Día YYYY-MM-DD como fecha de Excel (00:00 de ese día). ExcelJS serializa en UTC: no hay corrimiento. */
export function fechaExcel(dia: string): Date {
    return new Date(`${dia}T00:00:00.000Z`);
}

const fechaExcelONull = (dia: string | null) => (dia === null ? null : fechaExcel(dia));

/** Monto decimal string ("85000.00") como número de Excel; null queda vacío. */
const montoExcel = (monto: string | null) => (monto === null ? null : Number(monto));

/** Hora de reloj de Buenos Aires de un instante, como fecha y hora de Excel (sin zona). */
export function fechaHoraNegocioExcel(instante: Date): Date {
    const partes = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
            timeZone: ZONA_NEGOCIO,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23',
        })
            .formatToParts(instante)
            .map((p) => [p.type, p.value]),
    );
    return new Date(Date.UTC(+partes.year, +partes.month - 1, +partes.day, +partes.hour, +partes.minute, +partes.second));
}

/** Valor legible del filtro de fracción: su número visible, o "Todas". */
function valorFiltroFraccion(fraccion: FraccionFiltro | undefined): ValorCelda {
    if (fraccion === undefined) return SIN_FILTRO_FRACCION;
    return fraccion.numero ?? `Inexistente (id ${fraccion.id})`;
}

// ------------------------------------------------------------ Hojas

interface Columna<F> {
    titulo: string;
    ancho: number;
    valor: (fila: F) => ValorCelda;
    /** numFmt de la celda; solo se aplica si la celda tiene valor. */
    formato?: string | ((fila: F) => string);
}

function negrita(ws: Worksheet, fila: number) {
    ws.getRow(fila).font = { bold: true };
}

/** Hoja de datos: encabezado en negrita, fila congelada, autofiltro y una fila por fila del reporte. */
function hojaDatos<F>(wb: Workbook, nombre: string, columnas: Columna<F>[], filas: F[]) {
    const ws = wb.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = columnas.map((c) => ({ header: c.titulo, width: c.ancho }));
    negrita(ws, 1);
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };

    for (const fila of filas) {
        const row = ws.addRow(columnas.map((c) => c.valor(fila)));
        columnas.forEach((c, i) => {
            if (c.formato === undefined) return;
            const cell = row.getCell(i + 1);
            if (cell.value === null || cell.value === undefined) return;
            cell.numFmt = typeof c.formato === 'string' ? c.formato : c.formato(fila);
        });
    }
    return ws;
}

/**
 * Hoja de dos o más columnas armada por bloques (Totales, Parámetros). Cada bloque es un título en
 * negrita, un encabezado opcional en negrita y sus filas; los bloques se separan con una fila vacía.
 */
class HojaBloques {
    private readonly ws: Worksheet;
    private primero = true;

    constructor(wb: Workbook, nombre: string, anchos: number[]) {
        this.ws = wb.addWorksheet(nombre);
        this.ws.columns = anchos.map((width) => ({ width }));
    }

    bloque(titulo: string | null, encabezado: string[] | null, filas: { valores: ValorCelda[]; formatos?: (string | undefined)[] }[]) {
        if (!this.primero) this.ws.addRow([]);
        this.primero = false;
        if (titulo !== null) negrita(this.ws, this.ws.addRow([titulo]).number);
        if (encabezado !== null) negrita(this.ws, this.ws.addRow(encabezado).number);
        for (const { valores, formatos = [] } of filas) {
            const row = this.ws.addRow(valores);
            formatos.forEach((formato, i) => {
                if (formato !== undefined && valores[i] !== null) row.getCell(i + 1).numFmt = formato;
            });
        }
        return this;
    }
}

/** Hoja "Parámetros": reporte, fecha de corte, generación, filtros (en ese orden) y filas exportadas. */
function hojaParametros(
    wb: Workbook,
    reporte: string,
    corte: string,
    ctx: ContextoExportacion,
    filtros: [string, ValorCelda, string?][],
    filas: number,
) {
    new HojaBloques(wb, HOJA_PARAMETROS, [38, 30]).bloque(null, ['Parámetro', 'Valor'], [
        { valores: ['Reporte', reporte] },
        { valores: ['Fecha de corte (America/Argentina/Buenos_Aires)', fechaExcel(corte)], formatos: [undefined, FORMATO_FECHA] },
        { valores: ['Generado (hora de Buenos Aires)', fechaHoraNegocioExcel(ctx.generado)], formatos: [undefined, FORMATO_FECHA_HORA] },
        ...filtros.map(([nombre, valor, formato]) => ({ valores: [`Filtro: ${nombre}`, valor], formatos: [undefined, formato] })),
        { valores: ['Filas exportadas', filas] },
    ]);
}

function libro(generado: Date): Workbook {
    const wb = new Workbook();
    wb.creator = 'La Federala';
    wb.created = generado;
    return wb;
}

async function archivo(wb: Workbook, nombre: string): Promise<ArchivoXlsx> {
    return { nombre, contenido: Buffer.from(await wb.xlsx.writeBuffer()) };
}

// ------------------------------------------------------------ Inventario

export const HOJA_INVENTARIO = 'Inventario';

export const COLUMNAS_INVENTARIO: Columna<InventarioFila>[] = [
    { titulo: 'ID de lote', ancho: 11, valor: (f) => f.loteId },
    { titulo: 'Fracción', ancho: 10, valor: (f) => f.fraccion },
    { titulo: 'N.º de lote', ancho: 12, valor: (f) => f.numero },
    { titulo: 'Estado', ancho: 16, valor: (f) => etiquetaEstadoLote(f.estado) },
    { titulo: 'Subestado constructivo', ancho: 22, valor: (f) => etiquetaSubestado(f.subestado) },
    { titulo: 'Precio (USD)', ancho: 18, valor: (f) => montoExcel(f.precio), formato: formatoMoneda('USD') },
];

export const nombreArchivoInventario = (corte: string) => `reporte-inventario_corte-${corte}.xlsx`;

export async function inventarioXlsx(
    data: ReporteInventario,
    filtros: QueryReporteInventario,
    ctx: ContextoExportacion,
): Promise<ArchivoXlsx> {
    const wb = libro(ctx.generado);
    hojaDatos(wb, HOJA_INVENTARIO, COLUMNAS_INVENTARIO, data.filas);

    const { totales } = data;
    new HojaBloques(wb, HOJA_TOTALES, [26, 12, 12])
        .bloque('Lotes ofrecibles (Disponible o En promoción)', null, [{ valores: [totales.ofrecibles] }])
        .bloque('Por estado', ['Estado', 'Lotes'], totales.porEstado.map((e) => ({ valores: [etiquetaEstadoLote(e.estado), e.cantidad] })))
        .bloque('Por fracción', ['Fracción', 'Lotes', 'Ofrecibles'], totales.porFraccion.map((f) => ({ valores: [f.fraccion, f.cantidad, f.ofrecibles] })))
        .bloque('Por subestado constructivo', ['Subestado', 'Lotes'], totales.porSubestado.map((s) => ({ valores: [etiquetaSubestado(s.subestado), s.cantidad] })));

    hojaParametros(wb, 'Inventario de lotes', data.corte, ctx, [
        ['Fracción', valorFiltroFraccion(ctx.fraccion)],
        ['Estado', filtros.estado === undefined ? SIN_FILTRO : etiquetaEstadoLote(filtros.estado)],
        ['Subestado constructivo', filtros.subestado === undefined ? SIN_FILTRO : etiquetaSubestado(filtros.subestado)],
    ], data.filas.length);

    return archivo(wb, nombreArchivoInventario(data.corte));
}

// ------------------------------------------------------------ Ventas por período

export const HOJA_VENTAS = 'Ventas';

export const COLUMNAS_VENTAS: Columna<VentaFila>[] = [
    { titulo: 'ID de venta', ancho: 11, valor: (f) => f.ventaId },
    { titulo: 'N.º de venta', ancho: 18, valor: (f) => f.numero },
    { titulo: 'Fracción', ancho: 10, valor: (f) => f.fraccion },
    { titulo: 'N.º de lote', ancho: 12, valor: (f) => f.loteNumero },
    { titulo: 'Estado', ancho: 14, valor: (f) => etiquetaEstadoVenta(f.estado) },
    { titulo: 'Fecha de alta', ancho: 14, valor: (f) => fechaExcel(f.fechaAlta), formato: FORMATO_FECHA },
    { titulo: 'Fecha de escritura', ancho: 18, valor: (f) => fechaExcelONull(f.fechaEscritura), formato: FORMATO_FECHA },
    { titulo: 'Fecha de cancelación', ancho: 20, valor: (f) => fechaExcelONull(f.fechaCancelacion), formato: FORMATO_FECHA },
    { titulo: 'Moneda', ancho: 9, valor: (f) => f.moneda },
    // Cada monto con el formato de su propia moneda: la hoja no tiene totales que mezclen monedas.
    { titulo: 'Monto', ancho: 20, valor: (f) => montoExcel(f.monto), formato: (f) => formatoMoneda(f.moneda) },
];

export const nombreArchivoVentas = (data: ReporteVentas) =>
    `reporte-ventas_${data.periodo.desde}_a_${data.periodo.hasta}_corte-${data.corte}.xlsx`;

const TARJETAS_VENTAS = [
    ['iniciadas', 'Iniciadas'],
    ['escrituradas', 'Escrituradas'],
    ['canceladas', 'Canceladas'],
] as const;

export async function ventasXlsx(data: ReporteVentas, ctx: ContextoExportacion): Promise<ArchivoXlsx> {
    const wb = libro(ctx.generado);
    hojaDatos(wb, HOJA_VENTAS, COLUMNAS_VENTAS, data.filas);

    const encabezado = (moneda: Moneda) =>
        ['Ventas', 'Cantidad', `Monto (${moneda})`, 'Cantidad período anterior', `Monto período anterior (${moneda})`];
    const fila = (titulo: string, moneda: Moneda, cantidad: number, monto: string, cantidadAnterior: number, montoAnterior: string) => ({
        valores: [titulo, cantidad, Number(monto), cantidadAnterior, Number(montoAnterior)],
        formatos: [undefined, undefined, formatoMoneda(moneda), undefined, formatoMoneda(moneda)],
    });

    const hoja = new HojaBloques(wb, HOJA_TOTALES, [26, 12, 20, 26, 32]).bloque(
        'Ventas en USD',
        encabezado('USD'),
        TARJETAS_VENTAS.map(([clave, titulo]) => {
            const t: TarjetaVentas = data.tarjetas[clave];
            return fila(titulo, 'USD', t.cantidad, t.montoUSD, t.cantidadAnterior, t.montoUSDAnterior);
        }),
    );
    // Otras monedas: aparte, sin convertir ni sumar a USD (igual que el JSON).
    for (const otra of data.otrasMonedas) {
        hoja.bloque(
            `Ventas en ${otra.moneda} (no se suman a USD)`,
            encabezado(otra.moneda),
            TARJETAS_VENTAS.map(([clave, titulo]) => {
                const t: TarjetaOtraMoneda = otra[clave];
                return fila(titulo, otra.moneda, t.cantidad, t.monto, t.cantidadAnterior, t.montoAnterior);
            }),
        );
    }

    hojaParametros(wb, 'Ventas por período', data.corte, ctx, [
        ['Desde', fechaExcel(data.periodo.desde), FORMATO_FECHA],
        ['Hasta', fechaExcel(data.periodo.hasta), FORMATO_FECHA],
        ['Fracción', valorFiltroFraccion(ctx.fraccion)],
        ['Período anterior: desde', fechaExcel(data.periodoAnterior.desde), FORMATO_FECHA],
        ['Período anterior: hasta', fechaExcel(data.periodoAnterior.hasta), FORMATO_FECHA],
    ], data.filas.length);

    return archivo(wb, nombreArchivoVentas(data));
}

// ------------------------------------------------------------ Cuotas vencidas

export const HOJA_CUOTAS_VENCIDAS = 'Cuotas vencidas';

/** Rótulo del saldo que pide CCLF-37: el saldo incluye recargos sin desglosar. */
export const TITULO_SALDO = 'Saldo (incluye recargos)';

export function columnasCuotasVencidas(moneda: Moneda): Columna<CuotaVencidaFila>[] {
    return [
        { titulo: 'ID de cuota', ancho: 11, valor: (f) => f.cuotaId },
        { titulo: 'N.º de venta', ancho: 18, valor: (f) => f.ventaNumero },
        { titulo: 'Fracción', ancho: 10, valor: (f) => f.fraccion },
        { titulo: 'N.º de lote', ancho: 12, valor: (f) => f.loteNumero },
        { titulo: 'N.º de cuota', ancho: 12, valor: (f) => f.numeroCuota },
        { titulo: 'Cantidad de cuotas', ancho: 18, valor: (f) => f.cantidadCuotas },
        { titulo: 'Vencimiento', ancho: 13, valor: (f) => fechaExcel(f.fechaVencimiento), formato: FORMATO_FECHA },
        { titulo: 'Días de atraso', ancho: 14, valor: (f) => f.diasAtraso },
        { titulo: 'Tramo', ancho: 8, valor: (f) => f.tramo },
        { titulo: TITULO_SALDO, ancho: 24, valor: (f) => montoExcel(f.saldoPendiente), formato: formatoMoneda(moneda) },
    ];
}

export const nombreArchivoCuotasVencidas = (data: ReporteCuotasVencidas) =>
    `reporte-cuotas-vencidas_${data.moneda}_corte-${data.corte}.xlsx`;

export async function cuotasVencidasXlsx(data: ReporteCuotasVencidas, ctx: ContextoExportacion): Promise<ArchivoXlsx> {
    const wb = libro(ctx.generado);
    const formato = formatoMoneda(data.moneda);
    hojaDatos(wb, HOJA_CUOTAS_VENCIDAS, columnasCuotasVencidas(data.moneda), data.filas);

    new HojaBloques(wb, HOJA_TOTALES, [26, 12, 24])
        .bloque(`Saldo vencido en ${data.moneda}`, ['Saldo vencido', 'Cuotas', 'Ventas afectadas'], [
            { valores: [Number(data.saldoVencido), data.cuotas, data.ventas], formatos: [formato] },
        ])
        .bloque('Por tramo de atraso (días)', ['Tramo', 'Cuotas', TITULO_SALDO], data.tramos.map((t) => ({
            valores: [t.tramo, t.cuotas, Number(t.saldo)],
            formatos: [undefined, undefined, formato],
        })));

    hojaParametros(wb, 'Cuotas vencidas', data.corte, ctx, [
        ['Moneda', data.moneda],
        ['Fracción', valorFiltroFraccion(ctx.fraccion)],
    ], data.filas.length);

    return archivo(wb, nombreArchivoCuotasVencidas(data));
}
