// src/controllers/pago.controller.ts
import { Request, Response, NextFunction } from 'express';
import * as pagoService from '../services/pago.service';
import { validatedParams } from '../middlewares/validation.middleware';
import { ventaIdParamSchema } from '../validations/pago.validation';

export async function obtenerContextoPagos(req: Request, res: Response, next: NextFunction) {
  try {
    const { ventaId } = validatedParams(req, ventaIdParamSchema);
    const result = await pagoService.getPagosContextByVentaId(ventaId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function crearPlanPagoInicial(req: Request, res: Response, next: NextFunction) {
  try {
    const { ventaId } = validatedParams(req, ventaIdParamSchema);
    const user = req.user;
    const result = await pagoService.createPlanPagoInicial(ventaId, req.body, user);
    res.status(201).json({ success: true, message: 'Plan de pago creado exitosamente', data: result });
  } catch (error) {
    next(error);
  }
}

export async function registrarPago(req: Request, res: Response, next: NextFunction) {
  try {
    const { ventaId } = validatedParams(req, ventaIdParamSchema);
    const user = req.user;
    const result = await pagoService.registrarPagoEnVenta(ventaId, req.body, user);
    res.status(201).json({ success: true, message: 'Pago registrado correctamente', data: result });
  } catch (error) {
    next(error);
  }
}

export async function aplicarRecargoManual(req: Request, res: Response, next: NextFunction) {
  try {
    const { ventaId } = validatedParams(req, ventaIdParamSchema);
    const user = req.user;
    await pagoService.aplicarRecargoManualEnVenta(ventaId, req.body, user);
    res.status(201).json({ success: true, message: 'Recargo aplicado correctamente' });
  } catch (error) {
    next(error);
  }
}

export async function reemplazarPlanPago(req: Request, res: Response, next: NextFunction) {
  try {
    const { ventaId } = validatedParams(req, ventaIdParamSchema);
    const user = req.user;
    const result = await pagoService.reemplazarPlanPagoVigente(ventaId, req.body, user);
    res.status(201).json({
      success: true,
      message: 'Plan de pago reemplazado correctamente',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
