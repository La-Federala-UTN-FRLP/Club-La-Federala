import { z } from 'zod';
import { EstadoLote, SubestadoLote, Moneda } from '../generated/prisma';
import { positiveIntString } from './params.validation';
import { idDelBody } from './body.validation';

// Rango máximo de GET /reportes/ventas: días calendario contados de forma inclusiva
// (desde y hasta incluidos). 366 admite un año bisiesto completo.
export const MAX_DIAS_PERIODO = 366;

const MS_POR_DIA = 86_400_000;

/** Días calendario entre dos fechas YYYY-MM-DD, ambos extremos incluidos. */
export function diasInclusivos(desde: string, hasta: string): number {
    return Math.round((Date.parse(hasta) - Date.parse(desde)) / MS_POR_DIA) + 1;
}

// Fecha de calendario ISO (YYYY-MM-DD, fecha existente). Sin hora ni zona: el día de negocio
// lo interpreta el service en America/Argentina/Buenos_Aires.
const fechaQuery = z.iso.date({ message: 'Fecha inválida (formato YYYY-MM-DD)' });

// Fracción por id (política común de IDs de query).
const fraccionQuery = positiveIntString.optional();

// GET /api/reportes/inventario(.xlsx)
export const queryReporteInventarioSchema = z.object({
    fraccion: fraccionQuery,
    estado: z.enum(EstadoLote).optional(),
    subestado: z.enum(SubestadoLote).optional(),
});

// Reglas del período (ventas y resumen): desde <= hasta y máximo MAX_DIAS_PERIODO días. Se informan
// en `hasta`. Si la primera falla, la segunda pasa, para no duplicar el error.
function conReglasDePeriodo<T extends z.ZodType<{ desde: string; hasta: string }>>(schema: T): T {
    return schema
        .refine((p) => p.desde <= p.hasta, { message: '`desde` no puede ser posterior a `hasta`', path: ['hasta'] })
        .refine((p) => p.desde > p.hasta || diasInclusivos(p.desde, p.hasta) <= MAX_DIAS_PERIODO, {
            message: `El período no puede superar ${MAX_DIAS_PERIODO} días`,
            path: ['hasta'],
        });
}

// GET /api/reportes/ventas(.xlsx): período obligatorio, desde <= hasta, máximo MAX_DIAS_PERIODO días.
export const queryReporteVentasSchema = conReglasDePeriodo(
    z.object({
        desde: fechaQuery,
        hasta: fechaQuery,
        fraccion: fraccionQuery,
    }),
);

// GET /api/reportes/cuotas-vencidas(.xlsx): ARS y USD no se mezclan, la moneda es obligatoria.
export const queryReporteCuotasVencidasSchema = z.object({
    moneda: z.enum(Moneda),
    fraccion: fraccionQuery,
});

// POST /api/reportes/resumen (CCLF-37, 40.3): los filtros de los 3 reportes en el body. Período con
// las mismas reglas que ventas, `fraccion` por id (política de IDs del body JSON) y moneda de las
// cuotas vencidas. Estricto: una clave desconocida es 400, porque el frontend nunca envía cifras.
export const bodyResumenSchema = conReglasDePeriodo(
    z.strictObject({
        desde: fechaQuery,
        hasta: fechaQuery,
        fraccion: idDelBody('de la fracción').optional(),
        moneda: z.enum(Moneda),
    }),
);

export type QueryReporteInventario = z.output<typeof queryReporteInventarioSchema>;
export type BodyResumen = z.output<typeof bodyResumenSchema>;
export type QueryReporteVentas = z.output<typeof queryReporteVentasSchema>;
export type QueryReporteCuotasVencidas = z.output<typeof queryReporteCuotasVencidasSchema>;
