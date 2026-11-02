import { z } from "zod";
import { idParamsSchema, INT4_MAX } from "./params.validation";
import { numeroDelBody, tieneAlgunCampo, ACTUALIZAR_SIN_CAMPOS } from "./body.validation";

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

// Número de ubicación (contador, no PK): política compartida de números del body, sin z.coerce
// (que convertía null, "" y false en 0 y true en 1) y con el tope de un Int de Postgres.
const numeroUbicacion = numeroDelBody("El número de ubicación debe ser un número").pipe(
  z.number().int("El número de ubicación debe ser un entero").min(1, "El número de ubicación es requerido").max(INT4_MAX, "El número de ubicación es demasiado grande"),
);

export const createUbicacionSchema = z.object({
  calle: calleEnum,
  numero: numeroUbicacion,
});

export const updateUbicacionSchema = z.object({
  calle: calleEnum.optional(),
  numero: numeroUbicacion.optional(),
}).refine(tieneAlgunCampo, ACTUALIZAR_SIN_CAMPOS);

// Params /:id de Ubicación (política común de IDs de path)
export const getUbicacionSchema = idParamsSchema;

export const deleteUbicacionSchema = getUbicacionSchema;

