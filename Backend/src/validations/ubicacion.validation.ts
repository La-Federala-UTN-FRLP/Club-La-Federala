import { z } from "zod";
import { idParamsSchema } from "./params.validation";

const calleEnum = z.enum([
  'Reinamora',
  'Maca',
  'Zorzal',
  'Cauquén',
  'Alondra',
  'Jacana',
  'Tacuarito',
  'Jilguero',
  'Golondrina',
  'Calandria',
  'Aguilamora',
  'Lorca',
  'Milano',
]);

export const createUbicacionSchema = z.object({
  calle: calleEnum,
  numero: z.coerce.number().int().min(1, "El número de ubicación es requerido")
});

export const updateUbicacionSchema = z.object({
  calle: calleEnum.optional(),
  numero: z.coerce.number().int().min(1, "El número de ubicación es requerido").optional(),
});

// Params /:id de Ubicación (política común de IDs de path)
export const getUbicacionSchema = idParamsSchema;

export const deleteUbicacionSchema = getUbicacionSchema;

