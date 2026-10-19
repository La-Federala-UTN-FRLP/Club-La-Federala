import { Request, Response, NextFunction } from 'express';
import * as ubicacionService from '../services/ubicacion.service';
import { GetUbicacionesResponse, GetUbicacionResponse, PostUbicacionResponse, PutUbicacionResponse, DeleteUbicacionResponse } from '../types/interfacesCCLF';
import { validatedParams } from '../middlewares/validation.middleware';
import { getUbicacionSchema, deleteUbicacionSchema } from '../validations/ubicacion.validation';

export async function obtenerTodas(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await ubicacionService.getAllUbicaciones();
    const response: GetUbicacionesResponse = {
      ubicaciones: result.ubicaciones,
      total: result.total,
    };
    res.status(200).json({ success: true, message: 'Ubicaciones obtenidas exitosamente', ...response });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Error al obtener las ubicaciones' });
  }
}

export async function obtenerUbicacionPorId(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validatedParams(req, getUbicacionSchema);
    const data = await ubicacionService.getUbicacionById(id);
    const response: GetUbicacionResponse = { ubicacion: data, message: 'Ubicación obtenida exitosamente' };
    res.status(200).json({ success: true, ...response });
  } catch (error: any) {
    if (error.errors) {
      res.status(400).json({ success: false, message: 'Error de validación', errors: error.errors });
    } else {
      res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Error al obtener la ubicación' });
    }
  }
}

export async function crearUbicacion(req: Request, res: Response, next: NextFunction) {
  try {
    const ubicacion = await ubicacionService.createUbicacion(req.body);
    const response: PostUbicacionResponse = { ubicacion, message: 'Ubicación creada exitosamente' };
    res.status(201).json({ success: true, ...response });
  } catch (error) {
    next(error);
  }
}

export async function actualizarUbicacion(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validatedParams(req, getUbicacionSchema);
    const ubicacion = await ubicacionService.updateUbicacion(id, req.body);
    const response: PutUbicacionResponse = { message: 'Ubicación actualizada exitosamente' };
    res.status(200).json({ success: true, ...response });
  } catch (error) {
    next(error);
  }
}

export async function eliminarUbicacion(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validatedParams(req, deleteUbicacionSchema);
    const response: DeleteUbicacionResponse = await ubicacionService.deleteUbicacion(id);
    res.status(200).json({ success: true, ...response });
  } catch (error) {
    next(error);
  }
}

