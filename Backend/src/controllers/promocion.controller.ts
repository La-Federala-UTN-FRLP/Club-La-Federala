// src/controllers/promocion.controller.ts
import { Request, Response, NextFunction } from 'express';
import * as promocionService from '../services/promocion.service';
import { validatedParams } from '../middlewares/validation.middleware';
import { getLoteSchema } from '../validations/lote.validation';
import { quitarPromocionSchema, getPromocionActivaSchema } from '../validations/promocion.validation';

// Aplicar promoción
export async function aplicarPromocion(req: Request, res: Response, next: NextFunction) {
  try {
    const { id: loteId } = validatedParams(req, getLoteSchema);
    const promocion = await promocionService.aplicarPromocion(loteId, req.body);
    res.status(201).json({
      success: true,
      message: 'Promoción aplicada exitosamente',
      data: promocion,
    });
  } catch (error: any) {
    // Mapear errores de Prisma para que el middleware los maneje correctamente
    const statusCode = error?.statusCode || error?.status || 500;
    const message = error?.message || 'Error al aplicar promoción';
    return res.status(statusCode).json({
      success: false,
      message,
    });
  }
}

// Quitar promoción
export async function quitarPromocion(req: Request, res: Response, next: NextFunction) {
  try {
    const { id: loteId } = validatedParams(req, quitarPromocionSchema);
    const promocion = await promocionService.quitarPromocion(loteId);
    res.json({
      success: true,
      message: 'Promoción quitada exitosamente',
      data: promocion,
    });
  } catch (error: any) {
    // Mapear errores de Prisma para que el middleware los maneje correctamente
    const statusCode = error?.statusCode || error?.status || 500;
    const message = error?.message || 'Error al quitar promoción';
    return res.status(statusCode).json({
      success: false,
      message,
    });
  }
}

// Obtener promoción activa
export async function getPromocionActiva(req: Request, res: Response, next: NextFunction) {
  try {
    const { id: loteId } = validatedParams(req, getPromocionActivaSchema);
    const promocion = await promocionService.getPromocionActiva(loteId);
    
    // Si no hay promoción activa, devolver null (no error 404)
    if (!promocion) {
      return res.json({
        success: true,
        data: null,
      });
    }
    
    res.json({
      success: true,
      data: promocion,
    });
  } catch (error) {
    next(error);
  }
}








