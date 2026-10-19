import { Request, Response, NextFunction } from 'express';
import * as fraccionService from '../services/fraccion.service';
import { GetFraccionResponse, GetFraccionesResponse, DeleteFraccionResponse} from '../types/interfacesCCLF';
import { validatedParams } from '../middlewares/validation.middleware';
import { getFraccionSchema, deleteFraccionSchema } from '../validations/fraccion.validation';

//Obtener todas las fracciones

export async function obtenerTodas(req: Request, res: Response, next: NextFunction) {
    try {
        const result = await fraccionService.getAllFracciones();

        const response: GetFraccionesResponse = {
            fracciones: result.fracciones,
            total: result.total
        };
        res.status(200).json({
            success: true,
            message: 'Fracciones obtenidas exitosamente',
            ...response
        });
    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: error.message || 'Error al obtener las fracciones'
        });
    }

}

// Obtener fraccion por ID

export async function obtenerFraccionPorId(req: Request, res: Response, next: NextFunction) {
    try {
        const { id } = validatedParams(req, getFraccionSchema);
        const data = await fraccionService.getFraccionById(id);
        const response: GetFraccionResponse = {
            fraccion: data,
            message: 'Fracción obtenida exitosamente'
        };
        res.status(200).json({success: true,...response});
    } catch (error: any) {
        if (error.errors) {
            res.status(400).json({
                success: false,
                message: 'Error de validación',
                errors: error.errors
            });
        } else {
            res.status(500).json({
                success: false,
                message: error.message || 'Error al obtener la fracción'
            });
        }
    }
}

// Crear nueva fraccion

export async function crearFraccion(req: Request, res: Response, next: NextFunction) {
    try {
        const fraccion = await fraccionService.createFraccion(req.body);
        res.status(201).json({success: true,message: "Fracción creada exitosamente",data:fraccion});
    } catch (error) {
        next(error);
    }
}

// Actualizar fraccion

export async function actualizarFraccion(req: Request, res: Response, next: NextFunction) {
    try {
        const { id } = validatedParams(req, getFraccionSchema);
        const fraccion = await fraccionService.updateFraccion(id, req.body);
        res.status(200).json({success: true,message: "Fracción actualizada exitosamente",data:fraccion});
    } catch (error) {
        next(error);
    }
}

// Eliminar fraccion
export async function eliminarFraccion(req: Request, res: Response, next: NextFunction) {
    try {
        const { id } = validatedParams(req, deleteFraccionSchema);
        await fraccionService.deleteFraccion(id);
        const response: DeleteFraccionResponse = {
            message: 'Fracción eliminada exitosamente'
        };
        res.status(200).json({success: true,...response});
    } catch (error) {
        next(error);
    }
}