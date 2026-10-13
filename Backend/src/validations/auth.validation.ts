import { z } from 'zod';
export const loginSchema = z.object({
    // Misma normalización que al crear/actualizar usuarios (trim + minúsculas) antes de validar.
    email: z.string().trim().toLowerCase().email(),
    // La password se compara exacta: sin trim.
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres")
});