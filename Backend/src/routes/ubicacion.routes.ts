import Router from 'express';
import * as ubicacionController from '../controllers/ubicacion.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { validateParams } from '../middlewares/validation.middleware';
import { getUbicacionSchema } from '../validations/ubicacion.validation';

const router = Router();

// Solo lectura. Las ubicaciones se crean y modifican dentro del lifecycle de Lote (alta/edición de
// lote con calle + numeroCalle, o ubicacionId); no hay ABM público independiente.

// GET /api/ubicaciones
router.get(
  '/',
  authenticate,
  authorize('ADMINISTRADOR', 'GESTOR', 'TECNICO'),
  ubicacionController.obtenerTodas
);

// GET /api/ubicaciones/:id
router.get(
  '/:id',
  authenticate,
  authorize('ADMINISTRADOR', 'GESTOR', 'TECNICO'),
  validateParams(getUbicacionSchema),
  ubicacionController.obtenerUbicacionPorId
);

export const ubicacionRoutes = router;

