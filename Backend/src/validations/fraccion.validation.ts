import { z } from "zod";
import { idParamsSchema } from "./params.validation";

export const createFraccionSchema = z.object({
    numero: z.string().min(1, "El número de fracción es requerido").max(50, "El número de fracción no puede tener más de 50 caracteres")
});

export const updateFraccionSchema = z.object({
    numero: z.string().min(1, "El número de fracción es requerido").max(50, "El número de fracción no puede tener más de 50 caracteres").optional()
});

// Params /:id de Fracción (política común de IDs de path)
export const getFraccionSchema = idParamsSchema;

export const deleteFraccionSchema = getFraccionSchema;