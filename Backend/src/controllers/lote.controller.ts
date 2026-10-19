// src/controllers/lote.controller.ts
import { Request, Response, NextFunction } from 'express';
import * as loteService from '../services/lote.service';
import { validatedParams } from '../middlewares/validation.middleware';
import { getLoteSchema, deleteLoteSchema } from '../validations/lote.validation';
import { Lote } from '../types/interfacesCCLF';

//Obtener todos los lotes

export async function obtenerTodos(req: Request, res: Response, next: NextFunction) {
    try {
        // @ts-ignore
        const user = req.user;
        const data = await loteService.getAllLotes(req.query, user?.role);
        res.json({success: true,data});
    } catch (error) {
        next(error); // Paso el error al middleware de manejo
    }
}

// Obtener lote por ID

export async function obtenerLotePorId(req: Request, res: Response, next: NextFunction) {
    try {
        const user = req.user;
        const { id } = validatedParams(req, getLoteSchema);
        const data = await loteService.getLoteById(id, user?.role);
        res.json({success: true,data});
    } catch (error) {
        next(error);
    }
}

//Crear nuevo lote

export async function crearLote(req: Request, res: Response, next: NextFunction) {
    try {
        // La ruta para crear lotes no incluye al rol TECNICO.
        // Si en el futuro se quisiera permitir, se podría agregar una validación aquí
        // para asegurar que solo creen lotes con subestado 'EN_CONSTRUCCION'.
        // Creo el objeto tipado a partir del body
        const lote = await loteService.createLote(req.body);
        res.status(201).json({success: true,message: "Lote creado exitosamente",data:lote});
    }
    catch (error) {
        next(error);
    }
}

//Actualizar lote

export async function actualizarLote(req: Request, res: Response, next: NextFunction) {
    try {
        const user = req.user;

        const { id } = validatedParams(req, getLoteSchema);
        // La validación de si el técnico puede acceder a este lote
        // ya se hizo en el middleware `checkLoteStatusForTecnico`.
        // El controlador solo actualiza.
        const result = await loteService.updatedLote(id, req.body, user?.role);
        res.json({success: true,message: "Lote actualizado exitosamente",data:result});
    } catch (error) {
        next(error);
    }
}

//Eliminar lote 

export async function eliminarLote(req: Request, res: Response, next: NextFunction) {
    try {
        const user = req.user;
        const { id } = validatedParams(req, deleteLoteSchema);
        // La validación de si el técnico puede acceder a este lote
        // ya se hizo en el middleware `checkLoteStatusForTecnico`.
        // El controlador solo elimina.
        const result = await loteService.deleteLote(id, user?.role);
        res.json({success: true,message: "Lote eliminado exitosamente",data:result});
    } catch (error) {
        next(error);
    }
}
