import { Request, Response, NextFunction } from 'express';
import * as reporteService from '../services/reporte.service';
import type { ReporteInventario } from '../services/reporte.service';
import { validatedQuery } from '../middlewares/validation.middleware';
import { errorCodeForStatus } from '../middlewares/error.middleware';
import {
    queryReporteInventarioSchema,
    queryReporteVentasSchema,
    queryReporteCuotasVencidasSchema,
} from '../validations/reporte.validation';

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
        const data = await reporteService.getReporteVentas(filtros);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

// GET /api/reportes/cuotas-vencidas
export async function obtenerCuotasVencidas(req: Request, res: Response, next: NextFunction) {
    try {
        const filtros = validatedQuery(req, queryReporteCuotasVencidasSchema);
        const data = await reporteService.getReporteCuotasVencidas(filtros);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
}

// --- Exportación .xlsx (pendiente: 38.5, CCLF-56) ---
// Responden 501 con el contrato de error. Se contesta acá y no con next(error): handleError
// reemplaza el mensaje de cualquier status >= 500 por "Error interno.".
const EXPORTACION_PENDIENTE = 'Exportación pendiente (CCLF-56)';

function exportacionPendiente(res: Response) {
    res.status(501).json({ success: false, code: errorCodeForStatus(501), message: EXPORTACION_PENDIENTE });
}

// GET /api/reportes/inventario.xlsx
export async function exportarInventario(_req: Request, res: Response) {
    exportacionPendiente(res);
}

// GET /api/reportes/ventas.xlsx
export async function exportarVentas(_req: Request, res: Response) {
    exportacionPendiente(res);
}

// GET /api/reportes/cuotas-vencidas.xlsx
export async function exportarCuotasVencidas(_req: Request, res: Response) {
    exportacionPendiente(res);
}
