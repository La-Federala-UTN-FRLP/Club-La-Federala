import { z } from 'zod';
import { EstadoLote, SubestadoLote, Moneda } from '../generated/prisma';
import { positiveIntString } from './params.validation';

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

// GET /api/reportes/ventas(.xlsx): período obligatorio, desde <= hasta, máximo MAX_DIAS_PERIODO días.
export const queryReporteVentasSchema = z
    .object({
        desde: fechaQuery,
        hasta: fechaQuery,
        fraccion: fraccionQuery,
    })
    .refine((q) => q.desde <= q.hasta, { message: '`desde` no puede ser posterior a `hasta`', path: ['hasta'] })
    .refine((q) => q.desde > q.hasta || diasInclusivos(q.desde, q.hasta) <= MAX_DIAS_PERIODO, {
        message: `El período no puede superar ${MAX_DIAS_PERIODO} días`,
        path: ['hasta'],
    });

// GET /api/reportes/cuotas-vencidas(.xlsx): ARS y USD no se mezclan, la moneda es obligatoria.
export const queryReporteCuotasVencidasSchema = z.object({
    moneda: z.enum(Moneda),
    fraccion: fraccionQuery,
});

export type QueryReporteInventario = z.output<typeof queryReporteInventarioSchema>;
export type QueryReporteVentas = z.output<typeof queryReporteVentasSchema>;
export type QueryReporteCuotasVencidas = z.output<typeof queryReporteCuotasVencidasSchema>;
