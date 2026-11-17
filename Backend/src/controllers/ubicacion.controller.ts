import { Request, Response, NextFunction } from 'express';
import * as ubicacionService from '../services/ubicacion.service';
import { GetUbicacionesResponse, GetUbicacionResponse } from '../types/interfacesCCLF';
import { validatedParams } from '../middlewares/validation.middleware';
import { getUbicacionSchema } from '../validations/ubicacion.validation';

export async function obtenerTodas(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await ubicacionService.getAllUbicaciones();
    const response: GetUbicacionesResponse = {
      ubicaciones: result.ubicaciones,
      total: result.total,
    };
    res.status(200).json({ success: true, message: 'Ubicaciones obtenidas exitosamente', ...response });
  } catch (error) {
    next(error);
  }
}

export async function obtenerUbicacionPorId(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = validatedParams(req, getUbicacionSchema);
    const data = await ubicacionService.getUbicacionById(id);
    const response: GetUbicacionResponse = { ubicacion: data, message: 'Ubicación obtenida exitosamente' };
    res.status(200).json({ success: true, ...response });
  } catch (error) {
    next(error);
  }
}
