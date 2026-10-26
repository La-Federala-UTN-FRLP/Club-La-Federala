import {email, z} from 'zod';
import { idParamsSchema } from './params.validation';

// Normalización antes de validar: username y email se recortan (email además en minúsculas,
// igual que se busca en el login). La password es una secuencia exacta: no se recorta.
export const createUsuarioSchema = z.object({
    username: z.string().trim().min(1, 'El nombre de usuario es obligatorio').max(30, 'El nombre de usuario no puede exceder los 30 caracteres'),
    password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
    rol: z.enum(['ADMINISTRADOR', 'INMOBILIARIA', 'GESTOR', 'TECNICO']),
    email: z.string().trim().toLowerCase().email('El correo electrónico no es válido').max(100, 'El correo electrónico no puede exceder los 100 caracteres'),
});

export const updateUsuarioSchema = createUsuarioSchema.partial();

// Params /:id de Usuario (política común de IDs de path)
export const getUsuarioSchema = idParamsSchema;

export const deleteUsuarioSchema = getUsuarioSchema;

export const queryUsuarioSchema = z.object({
    username: z.string().min(1, 'El nombre de usuario es obligatorio').max(30, 'El nombre de usuario no puede exceder los 30 caracteres').trim().optional(),
    rol: z.enum(['ADMINISTRADOR', 'INMOBILIARIA', 'GESTOR', 'TECNICO']).optional(),
    password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').trim().optional(),
    email: z.string().email('El correo electrónico no es válido').max(100, 'El correo electrónico no puede exceder los 100 caracteres').trim().optional(),
});    


