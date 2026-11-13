import { Router } from 'express';
import * as loteController from '../controllers/lote.controller';
import * as promocionController from '../controllers/promocion.controller';
import { validate, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { createLoteSchema, updateLoteSchema, getLoteSchema, deleteLoteSchema, queryLoteSchema } from '../validations/lote.validation';
import { aplicarPromocionSchema, quitarPromocionSchema, getPromocionActivaSchema } from '../validations/promocion.validation';

const router = Router();

// GET /api/lotes
router.get(
    '/', 
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR', 'INMOBILIARIA', 'TECNICO'),
    validateQuery(queryLoteSchema),
    loteController.obtenerTodos);

// GET /api/lotes/:id
router.get(
    '/:id', 
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR', 'INMOBILIARIA', 'TECNICO'),
    validateParams(getLoteSchema),
    loteController.obtenerLotePorId);

// POST /api/lotes
router.post(
    '/',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR'), // Los técnicos no pueden crear lotes.
    validate(createLoteSchema),
    loteController.crearLote);

// PUT /api/lotes/:id
router.put(
    '/:id',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR', 'TECNICO'),
    validateParams(getLoteSchema),
    validate(updateLoteSchema),
    loteController.actualizarLote);

// DELETE /api/lotes/:id
router.delete(
    '/:id',
    authenticate,
    authorize('ADMINISTRADOR'),
    validateParams(deleteLoteSchema),
    loteController.eliminarLote);

// POST /api/lotes/:id/promociones/aplicar
router.post(
    '/:id/promociones/aplicar',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR'),
    validateParams(getLoteSchema),
    validate(aplicarPromocionSchema),
    promocionController.aplicarPromocion);

// POST /api/lotes/:id/promociones/quitar
router.post(
    '/:id/promociones/quitar',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR'),
    validateParams(quitarPromocionSchema),
    promocionController.quitarPromocion);

// GET /api/lotes/:id/promociones/activa
router.get(
    '/:id/promociones/activa',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR', 'INMOBILIARIA', 'TECNICO'),
    validateParams(getPromocionActivaSchema),
    promocionController.getPromocionActiva);

export const loteRoutes = router;
