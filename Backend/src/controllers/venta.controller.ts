//src/controllers/venta.controller.ts
import { Request, Response, NextFunction } from 'express';
import * as ventaService from '../services/venta.service';

// ========================
// Obtener todas las ventas
// ========================

export async function obtenerTodos(req: Request, res: Response, next: NextFunction) {
       try {
           // Llamo al servicio para obtener todas las Ventas
           const user = req.user;
           const query = req.query as { estadoOperativo?: string };
           const result = await ventaService.getAllVentas(query, user);
           res.json({success: true,data:result});
       } catch (error) {
           next(error); // Paso el error al middleware de manejo
       }
}

// ========================
// Obtener ventas por inmobiliaria
// ========================

export async function obtenerVentasPorInmobiliaria(req: Request, res: Response, next: NextFunction) {
    try {
        const inmobiliariaId = parseInt(req.params.id);
        const query = req.query as { estadoOperativo?: string };
        const result = await ventaService.getVentasByInmobiliaria(inmobiliariaId, query, req.user);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
}

// ========================
// Obtener venta por ID
// ========================

export async function obtenerVentaPorId(req: Request, res: Response, next: NextFunction) {
    try {
        const id = parseInt(req.params.id);
        const result = await ventaService.getVentaById(id);
        res.json({success: true,data:result});
    } catch (error) {
        next(error);
    }
}

// ========================
// Crear nueva venta
// ========================

export async function crearVenta(req: Request, res: Response, next: NextFunction) {
    try {
        // Creo el objeto tipado a partir del body
        const venta = await ventaService.createVenta(req.body);
        res.status(201).json({success: true,message: "Venta creada exitosamente",data:venta});
    }
    catch (error) {
        next(error);
    }
}

// ========================
// Actualizar venta
// ========================

export async function actualizarVenta(req: Request, res: Response, next: NextFunction) {
    try {
        const id = parseInt(req.params.id);
        const result = await ventaService.updateVenta(id, req.body);
        res.json({success: true,message: "Venta actualizada exitosamente",data:result});
    } catch (error) {
        next(error);
    }
}

// ========================
// Eliminar venta (soft delete)
// ========================

export async function eliminarVenta(req: Request, res: Response, next: NextFunction) {
    try {
        const id = parseInt(req.params.id);
        const user = req.user;
        const result = await ventaService.eliminarVenta(id, user);
        res.json({success: true, message: "Venta eliminada exitosamente", data: result});
    } catch (error) {
        next(error);
    }
}

export async function reactivarVenta(req: Request, res: Response, next: NextFunction) {
    try {
        const id = parseInt(req.params.id);
        const user = req.user;
        const result = await ventaService.reactivarVenta(id, user);
        res.json({success: true, message: "Venta reactivada exitosamente", data: result});
    } catch (error) {
        next(error);
    }
}


