import { Router } from 'express';
import { PersonaController } from '../controllers/persona.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { createPersonaSchema, getPersonaSchema, deletePersonaSchema, createMiembroFamiliarSchema, miembroFamiliarParamsSchema, queryPersonasSchema } from '../validations/persona.validation';
import { validate, validateParams, validateQuery } from '../middlewares/validation.middleware';

const router = Router();
const personaController = new PersonaController(); 

// GET /api/personas?view=ALL|PROPIETARIOS|INQUILINOS|CLIENTES|MIS_CLIENTES&q=...&includeInactive=true
// Permitido para ADMINISTRADOR, GESTOR, TECNICO e INMOBILIARIA
// INMOBILIARIA solo puede usar view=MIS_CLIENTES o view=ALL (que se aplica como MIS_CLIENTES)
router.get(
    '/', 
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR', 'TECNICO', 'INMOBILIARIA'),
    validateQuery(queryPersonasSchema),
    personaController.obtenerTodas
);

// GET /api/personas/cuil/:cuil
router.get(
    '/cuil/:cuil',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR', 'TECNICO'),
    personaController.obtenerPersonaPorCuil
);

// GET /api/personas/:id
router.get(
    '/:id',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR', 'TECNICO'),
    validateParams(getPersonaSchema),
    personaController.obtenerPersonaPorId
);

// POST /api/personas
// Permitido para ADMINISTRADOR, GESTOR e INMOBILIARIA
// INMOBILIARIA necesita crear clientes para completar reservas
router.post(
    '/', 
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR', 'INMOBILIARIA'),
    validate(createPersonaSchema), 
    personaController.create
);

// PUT /api/personas/:id
// El body lo valida el controller con updatePersonaSchema (manejo de errores propio de Persona).
router.put(
    '/:id', 
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR'),
    validateParams(getPersonaSchema),
    personaController.actualizarPersona
);

// PATCH /api/personas/:id/desactivar
router.patch(
    '/:id/desactivar',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR'),
    validateParams(deletePersonaSchema),
    personaController.desactivarPersona
);

// PATCH /api/personas/:id/reactivar
router.patch(
    '/:id/reactivar',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR'),
    validateParams(deletePersonaSchema),
    personaController.reactivarPersona
);

// DELETE /api/personas/:id (hard delete, solo Admin, solo si no tiene asociaciones)
router.delete(
    '/:id',
    authenticate,
    authorize('ADMINISTRADOR'),
    validateParams(deletePersonaSchema),  
    personaController.eliminarPersona
);

// GET /api/personas/:id/grupo-familiar
router.get(
    '/:id/grupo-familiar',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR', 'TECNICO'),
    validateParams(getPersonaSchema),
    personaController.obtenerGrupoFamiliar
);

// POST /api/personas/:id/grupo-familiar/miembros
router.post(
    '/:id/grupo-familiar/miembros',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR'),
    validateParams(getPersonaSchema),
    validate(createMiembroFamiliarSchema),
    personaController.crearMiembroFamiliar
);

// DELETE /api/personas/:id/grupo-familiar/miembros/:miembroId
router.delete(
    '/:id/grupo-familiar/miembros/:miembroId',
    authenticate,
    authorize('ADMINISTRADOR', 'GESTOR'),
    validateParams(miembroFamiliarParamsSchema),
    personaController.eliminarMiembroFamiliar
);

export const personaRoutes = router;