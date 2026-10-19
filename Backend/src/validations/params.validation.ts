import { z } from 'zod';

// Máximo de un Int de Postgres: ids mayores no existen y Prisma los rechaza con error 500.
const INT4_MAX = 2_147_483_647;

/**
 * ID HTTP de una PK numérica: entero positivo en notación decimal canónica ("12"), dentro
 * del rango int4. Rechaza "0", "-1", "007", "+5", " 12", "1e2", "10e-1", "0x10", "1.5" y
 * "5abc". Para todo valor aceptado, parseInt, Number y el resultado de Zod coinciden.
 */
export const positiveIntString = z
    .string()
    // abort: sin él Zod 4 sigue con el refine y "abc" sumaba un segundo error "Fuera de rango"
    .regex(/^[1-9]\d*$/, { message: 'Debe ser un entero positivo', abort: true })
    .refine((value) => Number(value) <= INT4_MAX, 'Fuera de rango')
    .transform(Number);

// Params de ruta con PK numérica. Los schemas de params de cada módulo son alias de estos;
// el controller lee el resultado con validatedParams().
export const idParamsSchema = z.object({ id: positiveIntString });
export const ventaIdParamsSchema = z.object({ ventaId: positiveIntString });
