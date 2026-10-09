import { Router } from 'express';
import * as reservaController from '../controllers/reserva.controller';
import { validate, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { createReservaSchema, updateReservaSchema, getReservaParamsSchema, deleteReservaParamsSchema, queryReservasSchema, patchReservaParamsSchema, createOfertaSchema } from '../validations/reserva.validation';

const router = Router();

// GET /api/Reservas
// Permitido para ADMINISTRADOR, GESTOR e INMOBILIARIA
// INMOBILIARIA solo verá sus propias reservas (filtrado en el servicio)
// Filtros soportados: loteId, estado, estadoOperativo (ver controller)
router.get(
    '/', 
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR', 'INMOBILIARIA'),
    validateQuery(queryReservasSchema),
    reservaController.getAllReservasController);

// GET /api/Reservas/:id
// Permitido para ADMINISTRADOR, GESTOR e INMOBILIARIA
// INMOBILIARIA solo puede ver sus propias reservas (validado en el servicio)
router.get(
    '/:id',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR', 'INMOBILIARIA'),
    validateParams(getReservaParamsSchema),
    reservaController.getReservaByIdController);

// GET /api/Reservas/inmobiliaria/:idInmobiliaria 
router.get(
    '/inmob/:id',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR', 'INMOBILIARIA'),
    validateParams(getReservaParamsSchema),
    reservaController.getAllReservasByInmobiliariaController);

// GET /api/Reservas/filtrarPorEstado?estado=ACTIVA/CANCELADA/ACEPTADA --> No funciona
router.get(
    '/filtrarPorEstado',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR', 'INMOBILIARIA'),
    validateQuery(queryReservasSchema),
    reservaController.getAllReservasByEstadoController);

// POST /api/Reservas
router.post(
    '/', 
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR', 'INMOBILIARIA'),
    validate(createReservaSchema), 
    reservaController.createReservaController);

// PUT /api/Reservas/:id
router.put(
    '/:id', 
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR'),
    validateParams(getReservaParamsSchema),
    validate(updateReservaSchema), 
    reservaController.updateReservaController);

// DELETE /api/Reservas/:id
router.delete(
    '/:id',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR'),
    validateParams(deleteReservaParamsSchema),  
    reservaController.deleteReservaController);

// PATCH /api/Reservas/:id/eliminar
router.patch(
    '/:id/eliminar',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR', 'INMOBILIARIA'),
    validateParams(patchReservaParamsSchema),
    reservaController.eliminarReservaController
);

// PATCH /api/Reservas/:id/reactivar
router.patch(
    '/:id/reactivar',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR', 'INMOBILIARIA'),
    validateParams(patchReservaParamsSchema),
    reservaController.reactivarReservaController
);

// GET /api/Reservas/:id/ofertas
// Permitido para ADMINISTRADOR, GESTOR e INMOBILIARIA
router.get(
    '/:id/ofertas',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR', 'INMOBILIARIA'),
    validateParams(getReservaParamsSchema),
    reservaController.getOfertasController);

// POST /api/Reservas/:id/ofertas
// Permitido para ADMINISTRADOR, GESTOR e INMOBILIARIA
router.post(
    '/:id/ofertas',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR', 'INMOBILIARIA'),
    validateParams(getReservaParamsSchema),
    validate(createOfertaSchema), 
    reservaController.createOfertaController);

export const reservaRoutes = router;