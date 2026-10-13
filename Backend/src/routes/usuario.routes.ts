import { Router } from 'express';
import * as usuarioController from '../controllers/usuario.controller';
import { validate, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { createUsuarioSchema, updateUsuarioSchema, getUsuarioSchema, deleteUsuarioSchema, queryUsuarioSchema } from '../validations/usuario.validation';

const router = Router();

// GET /api/Usuarios
router.get(
    '/', 
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR'),
    usuarioController.obtenerTodosUsuarios);

// GET /api/Usuarios/:id
router.get(
    '/:id',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR'),
    validateParams(getUsuarioSchema),
    usuarioController.obtenerUsuarioPorId);

// POST /api/Usuarios
router.post(
    '/', 
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR'),
    validate(createUsuarioSchema), 
    usuarioController.crearUsuario);

// PUT /api/Usuarios/:id
router.put(
    '/:id', 
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR'),
    validateParams(getUsuarioSchema),
    validate(updateUsuarioSchema),
    usuarioController.actualizarUsuario);

// DELETE /api/Usuarios/:id
router.delete(
    '/:id',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR'),
    validateParams(deleteUsuarioSchema),  
    usuarioController.eliminarUsuario);

export const usuarioRoutes = router;