import { z } from "zod";
import { idParamsSchema } from "./params.validation";
import { tieneAlgunCampo, ACTUALIZAR_SIN_CAMPOS, enteroPositivoDelBody, INT4_MAX } from "./body.validation";

// Fraccion.numero es `Int @unique` en Prisma: el contrato HTTP entrega siempre un number entero
// positivo int4. Acepta 5 y "5"; rechaza "05", "1e2", "+5", "5.5", true, null y todo > INT4_MAX.
const numeroFraccion = () =>
    enteroPositivoDelBody(`El número de fracción debe ser un entero positivo (máximo ${INT4_MAX})`);

export const createFraccionSchema = z.object({
    numero: numeroFraccion()
});

export const updateFraccionSchema = z.object({
    numero: numeroFraccion().optional()
}).refine(tieneAlgunCampo, ACTUALIZAR_SIN_CAMPOS);

// Params /:id de Fracción (política común de IDs de path)
export const getFraccionSchema = idParamsSchema;

export const deleteFraccionSchema = getFraccionSchema;
