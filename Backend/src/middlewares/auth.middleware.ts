import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getWebEnv } from '../config/env';
import { findAuthIdentity } from '../services/authIdentity.service';
import { errorCodeForStatus } from './error.middleware';

 // Rechazo de auth con el contrato de error (D4): { success, code, message }.
 // `error` repite el mensaje por compatibilidad: el frontend todavía lo lee (deprecated).
 function sendAuthError(res: Response, status: 401 | 403, message: string) {
   return res.status(status).json({ success: false, code: errorCodeForStatus(status), message, error: message });
 }

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

 // id de usuario del token: sub (o id, legacy) como entero positivo; si no, el token no identifica a nadie.
 function userIdFromToken(decoded: any): number | null {
   const raw = decoded?.sub ?? decoded?.id;
   const id = typeof raw === 'string' && /^[1-9]\d*$/.test(raw) ? Number(raw) : raw;
   return Number.isSafeInteger(id) && id > 0 ? id : null;
 }

 // Autenticación: Middleware para identificar usuarios
 // El JWT solo prueba identidad. Rol y tenant vigentes salen de la DB en cada request:
 // un usuario eliminado deja de entrar y un cambio de rol/inmobiliaria rige de inmediato.
 export async function authenticate(req: Request, res: Response, next: NextFunction) {
   // 1. Obtener token del header
   const authHeader = req.headers.authorization;
   if (!authHeader || !authHeader.startsWith('Bearer ')) {
       return sendAuthError(res, 401, 'Token no proporcionado');
   }
   const token = authHeader.split(' ')[1];

   // 2. Verificar firma y expiración
   let decoded: any;
   try {
       decoded = jwt.verify(token, getWebEnv().jwtSecret);
   } catch (error: any) {
       // Solo el tipo de error: sin mensaje (puede citar el header de un token malformado), stack, token ni headers.
       console.warn(`[AUTH] ${error?.name}`);
       if (error.name === 'TokenExpiredError') {
           return sendAuthError(res, 401, 'Token expirado');
       }
       return sendAuthError(res, 401, 'Token inválido');
   }

   const userId = userIdFromToken(decoded);
   if (userId == null) {
       return sendAuthError(res, 401, 'Token inválido');
   }

   // 3. Identidad vigente desde la DB. Un error de DB no es un problema de credenciales: va al handler (500).
   let identity;
   try {
       identity = await findAuthIdentity(userId);
   } catch (error) {
       return next(error);
   }
   if (!identity) {
       // Usuario eliminado: misma respuesta que un token inválido, sin revelar el motivo.
       return sendAuthError(res, 401, 'Token inválido');
   }

   // 4. Agregar usuario al request (rol e inmobiliariaId de la DB, no de los claims)
   req.user = {
       id: identity.id,
       email: identity.email,
       role: identity.role,
       ...(identity.inmobiliariaId != null && { inmobiliariaId: identity.inmobiliariaId })
   };
   next();
 }
 // Autorización: Middleware para verificar roles
 // allowedRoles: los roles admitidos quedan legibles en el middleware (solo lectura) para que el test
 // de la OpenAPI compare x-roles con la autorización real de cada ruta.
 export function authorize(...roles: string[]) {
   const middleware = (req: Request, res: Response, next: NextFunction) => {
       if (!req.user) {
           return sendAuthError(res, 401, 'No autenticado');
       }
       if (!roles.includes(req.user.role)) {
           return sendAuthError(res, 403, 'No tienes permisos para esta acción');
       }
       next();
   };
   return Object.assign(middleware, { allowedRoles: Object.freeze([...roles]) as readonly string[] });
 }