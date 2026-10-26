import { Request, Response, NextFunction } from 'express';
import * as loteService from '../services/lote.service';

class AppError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, AppError.prototype);
}
}

export const checkLoteStatusForTecnico = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // @ts-ignore - Asumimos que req.user es poblado por el middleware de autenticación
        const user = req.user;

        if (user && user.role === 'TECNICO') {
            if (req.method === 'GET' || req.method === 'PUT' || req.method === 'PATCH') {
                return next();
            }

            if (req.method === 'DELETE') {
                return next(new AppError('Los técnicos no pueden eliminar lotes', 403));
            }
            // El id ya lo validó validateParams(getLoteSchema) antes de este middleware.
        }
        return next();
    } catch (error) {
        next(error);
    }
};
