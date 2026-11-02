// src/validations/reserva.validation.ts
import { z } from 'zod';
import { idParamsSchema, positiveIntString } from './params.validation';
import { idDelBody, numeroDelBody, tieneAlgunCampo, ACTUALIZAR_SIN_CAMPOS } from './body.validation';
/*
  Helpers reutilizables
  ------------------------
  - IDs y montos del body usan la política compartida de body.validation.ts: aceptan number o string
    decimal ("12", "1500.50") y entregan number, pero ya no convierten null, "", false, true, [7] o
    "1e2" en un valor (z.coerce.number() los volvía 0, 1, 7 y 100).

*/

const dineroDelBody = numeroDelBody('El monto debe ser un número').pipe(z.number().min(0, 'El monto no puede ser negativo')); // permite 0
const dineroPositivoDelBody = numeroDelBody('El monto debe ser un número').pipe(z.number().positive('El monto debe ser mayor a 0')); // estricto > 0

// Acepto que venga tipo Date o string y lo normalizo a ISO que es la forma estandarizada .
const isoDate = z
  .union([
    z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha inválida'),
    z.date()
  ])
  .transform((v) => (v instanceof Date ? v.toISOString() : new Date(v).toISOString()));


/* Body: crear reserva
  ----------------------
  - Campos obligatorios: fechaReserva, loteId, clienteId.
  - inmobiliariaId y seña: opcionales.
*/
export const createReservaSchema = z.object({
  fechaReserva: isoDate,                 
  loteId: idDelBody('del lote'),                         // FK obligatoria
  clienteId: idDelBody('del cliente'),                   // FK obligatoria
  inmobiliariaId: idDelBody('de la inmobiliaria').optional().nullable(), // FK opcional (nullable por si lo vendio el club de campo y ninguna inm en el medio")
  sena: dineroDelBody.optional().nullable(),
  numero: z.string().min(3, 'El número de reserva es obligatorio').max(30, 'El número de reserva es demasiado largo').trim(),
  ofertaInicial: dineroPositivoDelBody, // Oferta inicial obligatoria
  fechaFinReserva: isoDate, // Fecha de fin de la reserva
});


/* Body: actualizar (PUT)
  -------------------------
  - Es parcial (no obligo a mandar todo).
  - PERO no permito body vacío: si viene {}, corto con 400.
*/
export const updateReservaSchema = z.object({
  fechaReserva: isoDate.optional(),                 
  loteId: idDelBody('del lote').optional(),                         // FK obligatoria
  clienteId: idDelBody('del cliente').optional(),                   // FK obligatoria
  inmobiliariaId: idDelBody('de la inmobiliaria').optional().nullable(), // FK opcional (nullable por si lo vendio el club de campo y ninguna inm en el medio")
  sena: dineroDelBody.optional().nullable(), // Permitir null para eliminar la seña
  estado: z.enum(['ACTIVA', 'CANCELADA', 'ACEPTADA', 'RECHAZADA', 'CONTRAOFERTA', 'EXPIRADA']).optional(),
  numero: z.string().min(3, 'El número de reserva es obligatorio').max(30, 'El número de reserva es demasiado largo').trim().optional(),
  fechaFinReserva: isoDate.optional(), // Fecha de fin de la reserva
}).refine(tieneAlgunCampo, ACTUALIZAR_SIN_CAMPOS);

/*  Parametros comunes (/:id)
  -------------------------------
  - GET detalle, PUT, DELETE usan el mismo parametros q es el idReserva.
  - Política común de IDs de path (no usa idDelBody: en el path no se aceptan "1e2", "007", etc.).
*/
export const getReservaParamsSchema = idParamsSchema;

/*  Parametros para eliminar, usa el mismo que el de arriba del obtener */
export const deleteReservaParamsSchema = getReservaParamsSchema;
export const patchReservaParamsSchema = getReservaParamsSchema;

/*  Query del listado (GET /reservas)
  -------------------------------
  - Solo los filtros que el service implementa: loteId, estado y estadoOperativo. Cualquier otro
    parámetro es una clave desconocida: Zod la descarta y no llega al service.
  - loteId sigue la política común de IDs HTTP (positiveIntString, como los de path); no usa
    idDelBody, que es del body.
*/
export const queryReservasSchema = z.object({
  estado: z.enum(['ACTIVA', 'CANCELADA', 'ACEPTADA', 'RECHAZADA', 'CONTRAOFERTA', 'EXPIRADA']).optional(),
  estadoOperativo: z.enum(['OPERATIVO', 'ELIMINADO']).optional(),
  loteId: positiveIntString.optional(),
});

export const createOfertaSchema = z.object({
  monto: dineroPositivoDelBody,
  motivo: z.string().optional(),
  action: z.enum(['CONTRAOFERTAR', 'ACEPTAR', 'RECHAZAR']).optional()
});