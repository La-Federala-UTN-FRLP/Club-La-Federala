import { Request, Response, NextFunction } from 'express';
import * as reporteService from '../services/reporte.service';
import type { ReporteCuotasVencidas, ReporteInventario, ReporteVentas } from '../services/reporte.service';
import * as reporteExcel from '../services/reporte.excel';
import { XLSX_CONTENT_TYPE } from '../services/reporte.excel';
import type { ArchivoXlsx } from '../services/reporte.excel';
import * as reporteResumenService from '../services/reporteResumen.service';
import type { ResumenReunion } from '../services/reporteResumen.service';
import { validatedQuery } from '../middlewares/validation.middleware';
import { liberarCupoResumen } from '../middlewares/resumenDailyLimit.middleware';
import {
    queryReporteInventarioSchema,
    queryReporteVentasSchema,
    queryReporteCuotasVencidasSchema,
} from '../validations/reporte.validation';
import type { BodyResumen } from '../validations/reporte.validation';

// GET /api/reportes/inventario
export async function obtenerInventario(req: Request, res: Response, next: NextFunction) {
    try {
        const filtros = validatedQuery(req, queryReporteInventarioSchema);
        const data: ReporteInventario = await reporteService.getReporteInventario(filtros);
        const body: { success: true; data: ReporteInventario } = { success: true, data };
        res.status(200).json(body);
    } catch (error) {
        next(error);
    }
}

// GET /api/reportes/ventas
export async function obtenerVentas(req: Request, res: Response, next: NextFunction) {
    try {
        const filtros = validatedQuery(req, queryReporteVentasSchema);
        const data: ReporteVentas = await reporteService.getReporteVentas(filtros);
        const body: { success: true; data: ReporteVentas } = { success: true, data };
        res.status(200).json(body);
    } catch (error) {
        next(error);
    }
}

// GET /api/reportes/cuotas-vencidas
export async function obtenerCuotasVencidas(req: Request, res: Response, next: NextFunction) {
    try {
        const filtros = validatedQuery(req, queryReporteCuotasVencidasSchema);
        const data: ReporteCuotasVencidas = await reporteService.getReporteCuotasVencidas(filtros);
        const body: { success: true; data: ReporteCuotasVencidas } = { success: true, data };
        res.status(200).json(body);
    } catch (error) {
        next(error);
    }
}

// POST /api/reportes/resumen (CCLF-37, 40.3). El body ya pasó bodyResumenSchema (validate) y el
// límite diario ya reservó el cupo; si los reportes fallan antes de llamar a la IA, se devuelve.
export async function generarResumen(req: Request, res: Response, next: NextFunction) {
    try {
        const filtros = req.body as BodyResumen;
        const data: ResumenReunion = await reporteResumenService.resumirParaReunion(filtros, {
            rol: req.user!.role,
            liberarCupo: () => liberarCupoResumen(res),
        });
        const body: { success: true; data: ResumenReunion } = { success: true, data };
        res.status(200).json(body);
    } catch (error) {
        next(error);
    }
}

// --- Exportación .xlsx (38.5, CCLF-56) ---
// Misma ruta de validación y mismo service que el JSON: el archivo se arma con el objeto `data` del
// reporte (reporte.excel.ts). El libro se genera completo antes de escribir headers, así un error
// sigue el camino normal (next → JSON de error) y nunca sale un archivo a medias.

// El nombre sale de fechas validadas y de la moneda (enum): solo [A-Za-z0-9._-], así que va entre
// comillas sin escapar nada. Si algún día no cumple, es un error de programación (→ 500), no un header roto.
const NOMBRE_ARCHIVO_SEGURO = /^[A-Za-z0-9._-]+\.xlsx$/;

function enviarXlsx(res: Response, archivo: ArchivoXlsx) {
    if (!NOMBRE_ARCHIVO_SEGURO.test(archivo.nombre)) throw new Error('Nombre de archivo de exportación inválido');
    res.status(200);
    res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
    res.setHeader('Content-Disposition', `attachment; filename="${archivo.nombre}"`);
    res.send(archivo.contenido);
}

// GET /api/reportes/inventario.xlsx
export async function exportarInventario(req: Request, res: Response, next: NextFunction) {
    try {
        const filtros = validatedQuery(req, queryReporteInventarioSchema);
        const [data, fraccion] = await Promise.all([
            reporteService.getReporteInventario(filtros),
            reporteService.fraccionDelFiltro(filtros.fraccion),
        ]);
        enviarXlsx(res, await reporteExcel.inventarioXlsx(data, filtros, { generado: new Date(), fraccion }));
    } catch (error) {
        next(error);
    }
}

// GET /api/reportes/ventas.xlsx
export async function exportarVentas(req: Request, res: Response, next: NextFunction) {
    try {
        const filtros = validatedQuery(req, queryReporteVentasSchema);
        const [data, fraccion] = await Promise.all([
            reporteService.getReporteVentas(filtros),
            reporteService.fraccionDelFiltro(filtros.fraccion),
        ]);
        enviarXlsx(res, await reporteExcel.ventasXlsx(data, { generado: new Date(), fraccion }));
    } catch (error) {
        next(error);
    }
}

// GET /api/reportes/cuotas-vencidas.xlsx
export async function exportarCuotasVencidas(req: Request, res: Response, next: NextFunction) {
    try {
        const filtros = validatedQuery(req, queryReporteCuotasVencidasSchema);
        const [data, fraccion] = await Promise.all([
            reporteService.getReporteCuotasVencidas(filtros),
            reporteService.fraccionDelFiltro(filtros.fraccion),
        ]);
        enviarXlsx(res, await reporteExcel.cuotasVencidasXlsx(data, { generado: new Date(), fraccion }));
    } catch (error) {
        next(error);
    }
}
