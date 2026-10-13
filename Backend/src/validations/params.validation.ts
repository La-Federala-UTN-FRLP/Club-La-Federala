import { z } from 'zod';

// Máximo de un Int de Postgres: ids mayores no existen y Prisma los rechaza con error 500.
const INT4_MAX = 2_147_483_647;

/**
 * Entero positivo en notación decimal canónica ("12"), tal como llega en params/query.
 * Rechaza lo que z.coerce.number() aceptaría o parseInt truncaría: "1.5", "-1", "1e2",
 * "0x10", "5abc", "007".
 * validateParams/validateQuery no conservan el resultado transformado: los controllers
 * convierten con Number() o vuelven a parsear con el schema.
 */
export const positiveIntString = z
    .string()
    .regex(/^[1-9]\d*$/, 'Debe ser un entero positivo')
    .refine((value) => Number(value) <= INT4_MAX, 'Fuera de rango')
    .transform(Number);
