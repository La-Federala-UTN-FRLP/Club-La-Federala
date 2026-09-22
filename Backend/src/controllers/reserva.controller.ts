// src/controllers/reserva.controller.ts
import { Request, Response, NextFunction } from 'express';
import {
  getAllReservas,
  getReservaById,
  createReserva,
  updateReserva,
  eliminarReserva,
  reactivarReserva,
  getReservaByImmobiliariaId,
  getReservaByEstado,
  getOfertasByReservaId,
  createOfertaReserva
} from '../services/reserva.service';
import { EstadoReserva } from '../types/interfacesCCLF';

// ==============================
// Obtener todas las reservas
// ==============================
// La query ya viene validada por el middleware de Zod.
// Si el usuario es INMOBILIARIA, solo devuelve sus reservas.
export async function getAllReservasController(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user; // Usuario autenticado desde el middleware
    const query = req.query as { estadoOperativo?: string };
    const data = await getAllReservas(query, user);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

// ==============================
// Obtener reserva por ID
// ==============================
// Los parametros ya vienen validados en la ruta (id entero positivo).
// Valida permisos: INMOBILIARIA solo puede ver sus propias reservas.
export async function getReservaByIdController(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    const user = req.user; // Usuario autenticado desde el middleware
    const data = await getReservaById(id, user);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getAllReservasByInmobiliariaController(req: Request, res: Response, next: NextFunction) {
  try {
    const id = parseInt(req.params.id, 10);
    const user = req.user;
    const data = await getReservaByImmobiliariaId(id, user);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getAllReservasByEstadoController(req: Request, res: Response, next: NextFunction) {
  try {
    const estadoR = req.query.estado as EstadoReserva;
    const user = req.user;
    const data = await getReservaByEstado(estadoR, user);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

// ==============================
// Crear nueva reserva
// ==============================
// Body validado por Zod (createReservaSchema.strict()).
export async function createReservaController(req: Request, res: Response, next: NextFunction) {
  try {
    console.log("DEBUG: Controller createReserva body:", JSON.stringify(req.body));
    const user = req.user; // Usuario autenticado desde el middleware
    const data = await createReserva(req.body, user);
    res.status(201).json({ success: true, message: 'Reserva creada exitosamente', data });
  } catch (error) {
    console.error("Error creating reserva:", error);
    next(error);
  }
}

// ==============================
// Actualizar reserva
// ==============================
// Body parcial validado.
export async function updateReservaController(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    const user = req.user;
    const data = await updateReserva(id, req.body, user);
    res.json({ success: true, message: 'Reserva actualizada exitosamente', data });
  } catch (error) {
    next(error);
  }
}

// ==============================
// Eliminar reserva (soft delete - estadoOperativo)
// ==============================
export async function deleteReservaController(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    const user = req.user;
    const data = await eliminarReserva(id, user);
    res.json({ success: true, message: 'Reserva eliminada exitosamente', data });
  } catch (error) {
    next(error);
  }
}

export async function eliminarReservaController(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    const user = req.user;
    const data = await eliminarReserva(id, user);
    res.json({ success: true, message: 'Reserva eliminada exitosamente', data });
  } catch (error) {
    next(error);
  }
}

export async function reactivarReservaController(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    const user = req.user;
    const data = await reactivarReserva(id, user);
    res.json({ success: true, message: 'Reserva reactivada exitosamente', data });
  } catch (error) {
    next(error);
  }
}
// ==============================
// Obtener historial ofertas
// ==============================
export async function getOfertasController(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    const user = req.user;
    const data = await getOfertasByReservaId(id, user);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

// ==============================
// Crear oferta
// ==============================
export async function createOfertaController(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    const user = req.user;
    const data = await createOfertaReserva(id, req.body, user);
    res.status(201).json({ success: true, message: 'Oferta registrada', data });
  } catch (error) {
    next(error);
  }
}
