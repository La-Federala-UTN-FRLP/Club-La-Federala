import { Router } from 'express';
import * as reporteController from '../controllers/reporte.controller';
import { validate, validateQuery } from '../middlewares/validation.middleware';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { resumenDailyLimit } from '../middlewares/resumenDailyLimit.middleware';
import {
    queryReporteInventarioSchema,
    queryReporteVentasSchema,
    queryReporteCuotasVencidasSchema,
    bodyResumenSchema,
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

// POST /api/reportes/resumen (CCLF-37, 40.3). El límite diario va después de validar el body:
// un 400 no consume cupo.
router.post(
    '/resumen',
    ...soloStaff,
    validate(bodyResumenSchema),
    resumenDailyLimit,
    reporteController.generarResumen);

export const reporteRoutes = router;
