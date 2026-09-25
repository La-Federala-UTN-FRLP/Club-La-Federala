import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getWebEnv } from '../config/env';

 // Extender tipo Request
 declare global {
   namespace Express {
       interface Request {
           user?: {
               id: number;
               email: string;
               role: 'ADMINISTRADOR' | 'INMOBILIARIA' | 'TECNICO' | 'GESTOR';
               inmobiliariaId?: number | null;
           }
       }
   }
 }

 // Autenticación: Middleware para identificar usuarios
 export function authenticate(req: Request, res: Response, next: NextFunction) {
   try {
       // 1. Obtener token del header
       const authHeader = req.headers.authorization;
       if (!authHeader || !authHeader.startsWith('Bearer ')) {
           return res.status(401).json({ success: false, error: 'Token no proporcionado' });
       }
       const token = authHeader.split(' ')[1];
       // 2. Verificar token
       const decoded = jwt.verify(token, getWebEnv().jwtSecret) as any;
       
       // 3. Agregar usuario al request
       // El inmobiliariaId ya viene en el JWT si el rol es INMOBILIARIA (se incluye en el login)
       req.user = {
           id: decoded.sub || decoded.id,
           email: decoded.email,
           role: decoded.role,
           ...(decoded.inmobiliariaId != null && { inmobiliariaId: decoded.inmobiliariaId })
       };
       next();
   } catch (error: any) {
       console.error(error);
       if (error.name === 'TokenExpiredError') {
           return res.status(401).json({ success: false, error: 'Token expirado' });
       }
       res.status(401).json({ success: false, error: 'Token inválido' });
   }
 }
 // Autorización: Middleware para verificar roles
 export function authorize(...roles: string[]) {
   return (req: Request, res: Response, next: NextFunction) => {
       if (!req.user) {
           return res.status(401).json({
               success: false,
               error: 'No autenticado'
           });
       }
       if (!roles.includes(req.user.role)) {
           return res.status(403).json({
               success: false,
               error: 'No tienes permisos para esta acción'
           });
       }
       next();
   };
 }