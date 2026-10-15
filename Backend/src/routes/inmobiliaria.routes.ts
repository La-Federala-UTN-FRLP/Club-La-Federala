import { Router } from 'express';
import * as inmobiliariaController from '../controllers/inmobiliaria.controller';
import { validate, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { createInmobiliariaSchema, updateInmobiliariaSchema, getInmobiliariaSchema, deleteInmobiliariaSchema, idParamSchema, listInmobiliariasQuerySchema } from '../validations/inmobiliaria.validation';

const router = Router();

//GET /api/inmobiliarias
router.get(
    '/',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR'),
    validateQuery(listInmobiliariasQuerySchema),
    inmobiliariaController.getAllInmobiliariasController);

//GET /api/inmobiliarias/:id
router.get(
    '/:id',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR'),
    validateParams(getInmobiliariaSchema),
    inmobiliariaController.getInmobiliariaByIdController);

//POST /api/inmobiliarias
router.post(
    '/',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR'),
    validate(createInmobiliariaSchema), 
    inmobiliariaController.createInmobiliariaController);

//PUT /api/inmobiliarias/:id
router.put(
    '/:id',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR'),
    validateParams(idParamSchema),
    validate(updateInmobiliariaSchema),
    inmobiliariaController.updateInmobiliariaController);

//PATCH /api/inmobiliarias/:id/eliminar
router.patch(
    '/:id/eliminar',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR'),
    validateParams(idParamSchema),
    inmobiliariaController.eliminarInmobiliariaController);

//PATCH /api/inmobiliarias/:id/reactivar
router.patch(
    '/:id/reactivar',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR'),
    validateParams(idParamSchema),
    inmobiliariaController.reactivarInmobiliariaController);

//DELETE /api/inmobiliarias/:id
router.delete(
    '/:id',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR'),
    validateParams(deleteInmobiliariaSchema),
    inmobiliariaController.deleteInmobiliariaController);

export const inmobRoutes = router;
