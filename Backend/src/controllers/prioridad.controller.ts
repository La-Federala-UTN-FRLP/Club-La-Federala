// src/controllers/prioridad.controller.ts
import { Request, Response, NextFunction } from 'express';
import {
  getAllPrioridades,
  getPrioridadById,
  createPrioridad,
  updatePrioridad,
  cancelPrioridad,
  finalizePrioridad,
  expirePrioridadesManual,
  eliminarPrioridad,
  reactivarPrioridad,
  PrioridadesListQuery,
} from '../services/prioridad.service';
import { validatedParams, validatedQuery } from '../middlewares/validation.middleware';
import { getPrioridadParamsSchema, patchPrioridadParamsSchema, queryPrioridadesSchema } from '../validations/prioridad.validation';

// Filtros que viajan como texto (enums y fechas ISO ya validados por queryPrioridadesSchema)
const PRIORIDADES_TEXT_FILTERS = [
  'estado', 'estadoOperativo', 'ownerType',
  'fechaInicioDesde', 'fechaInicioHasta', 'fechaFinDesde', 'fechaFinHasta',
] as const;

// ==============================
// Obtener todas las prioridades
// ==============================
// La query ya viene validada y convertida en la ruta (loteId e inmobiliariaId son number).
// Se arma el DTO permitido (mismo patrón que reservas/ventas) con los filtros que usa el service.
export async function getAllPrioridadesController(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user; // Usuario autenticado desde el middleware
    const filters = validatedQuery(req, queryPrioridadesSchema);
    const query: PrioridadesListQuery = {};
    for (const key of PRIORIDADES_TEXT_FILTERS) {
      const value = filters[key];
      if (value !== undefined) query[key] = value;
    }
    if (filters.loteId !== undefined) query.loteId = filters.loteId;
    if (filters.inmobiliariaId !== undefined) query.inmobiliariaId = filters.inmobiliariaId;
    const data = await getAllPrioridades(query, user);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

// ==============================
// Obtener prioridad por ID
// ==============================
export async function getPrioridadByIdController(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validatedParams(req, getPrioridadParamsSchema);
    const user = req.user; // Usuario autenticado desde el middleware
    const data = await getPrioridadById(id, user);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

// ==============================
// Crear nueva prioridad
// ==============================
export async function createPrioridadController(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    const data = await createPrioridad(req.body, user);
    res.status(201).json({ success: true, message: 'Prioridad creada exitosamente', data });
  } catch (error) {
    next(error);
  }
}

// ==============================
// Actualizar prioridad
// ==============================
export async function updatePrioridadController(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validatedParams(req, getPrioridadParamsSchema);
    const user = req.user;
    const data = await updatePrioridad(id, req.body, user);
    res.json({ success: true, message: 'Prioridad actualizada exitosamente', data });
  } catch (error) {
    next(error);
  }
}

// ==============================
// Cancelar prioridad
// ==============================
export async function cancelPrioridadController(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validatedParams(req, getPrioridadParamsSchema);
    const user = req.user; // Usuario autenticado desde el middleware
    const data = await cancelPrioridad(id, user);
    res.json({ success: true, message: 'Prioridad cancelada exitosamente', data });
  } catch (error) {
    next(error);
  }
}

// ==============================
// Finalizar prioridad
// ==============================
export async function finalizePrioridadController(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validatedParams(req, getPrioridadParamsSchema);
    const user = req.user; // Usuario autenticado desde el middleware
    const data = await finalizePrioridad(id, user);
    res.json({ success: true, message: 'Prioridad finalizada exitosamente', data });
  } catch (error) {
    next(error);
  }
}

// ==============================
// Expirar prioridades (job interno)
// ==============================
export async function expirePrioridadesController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await expirePrioridadesManual();
    res.json({ success: true, message: `Se expiraron ${result.expired} prioridades`, data: result });
  } catch (error) {
    next(error);
  }
}

// ==============================
// Eliminar prioridad (soft delete)
// ==============================
export async function eliminarPrioridadController(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validatedParams(req, patchPrioridadParamsSchema);
    const user = req.user;
    const data = await eliminarPrioridad(id, user);
    res.json({ success: true, message: 'Prioridad eliminada exitosamente', data });
  } catch (error) {
    next(error);
  }
}

// ==============================
// Reactivar prioridad
// ==============================
export async function reactivarPrioridadController(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validatedParams(req, patchPrioridadParamsSchema);
    const user = req.user;
    const data = await reactivarPrioridad(id, user);
    res.json({ success: true, message: 'Prioridad reactivada exitosamente', data });
  } catch (error) {
    next(error);
  }
}
