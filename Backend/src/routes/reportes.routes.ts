import { Router } from 'express';
import * as reporteController from '../controllers/reporte.controller';
import { validateQuery } from '../middlewares/validation.middleware';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import {
    queryReporteInventarioSchema,
    queryReporteVentasSchema,
    queryReporteCuotasVencidasSchema,
} from '../validations/reporte.validation';

const router = Router();

// Todo el módulo Reportes es solo para staff. Se aplica en cada ruta para que
// la autorización quede en la cadena de la ruta: es lo que inspeccionan el test de la OpenAPI
// (x-roles) y el guard de rutas.
const soloStaff = [authenticate, authorize('ADMINISTRADOR', 'GESTOR')];

// GET /api/reportes/inventario
router.get(
    '/inventario',
    ...soloStaff,
    validateQuery(queryReporteInventarioSchema),
    reporteController.obtenerInventario);

// GET /api/reportes/inventario.xlsx
router.get(
    '/inventario.xlsx',
    ...soloStaff,
    validateQuery(queryReporteInventarioSchema),
    reporteController.exportarInventario);

// GET /api/reportes/ventas
router.get(
    '/ventas',
    ...soloStaff,
    validateQuery(queryReporteVentasSchema),
    reporteController.obtenerVentas);

// GET /api/reportes/ventas.xlsx
router.get(
    '/ventas.xlsx',
    ...soloStaff,
    validateQuery(queryReporteVentasSchema),
    reporteController.exportarVentas);

// GET /api/reportes/cuotas-vencidas
router.get(
    '/cuotas-vencidas',
    ...soloStaff,
    validateQuery(queryReporteCuotasVencidasSchema),
    reporteController.obtenerCuotasVencidas);

// GET /api/reportes/cuotas-vencidas.xlsx
router.get(
    '/cuotas-vencidas.xlsx',
    ...soloStaff,
    validateQuery(queryReporteCuotasVencidasSchema),
    reporteController.exportarCuotasVencidas);

export const reporteRoutes = router;
