// src/validations/reserva.validation.ts
import { z } from 'zod';
import { idParamsSchema, positiveIntString } from './params.validation';
/*
  Helpers reutilizables
  ------------------------
  - No son obligatorios, pero mas adelante queremos hacer algunos cambios o agregar cosas que utilicen las mismas
    validaciones, lo mejor seria que esten.

  - Uso z.coerce.number() para que se banque numeros que llegan como "string". Si ya me llega number en JSON, igual funciona.
*/

const idInt = z.coerce.number().int('El id debe ser entero').positive('El id debe ser positivo');

const dinero = z.coerce.number().min(0, 'El monto no puede ser negativo'); // permite 0
const dineroPositivo = z.coerce.number().positive('El monto debe ser mayor a 0'); // estricto > 0

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
  loteId: idInt,                         // FK obligatoria
  clienteId: idInt,                      // FK obligatoria
  inmobiliariaId: idInt.optional().nullable(), // FK opcional (nullable por si lo vendio el club de campo y ninguna inm en el medio")
  sena: dinero.optional().nullable(),
  numero: z.string().min(3, 'El número de reserva es obligatorio').max(30, 'El número de reserva es demasiado largo').trim(),
  ofertaInicial: dineroPositivo, // Oferta inicial obligatoria
  fechaFinReserva: isoDate, // Fecha de fin de la reserva
});


/* Body: actualizar (PUT)
  -------------------------
  - Es parcial (no obligo a mandar todo).
  - PERO no permito body vacío: si viene {}, corto con 400.
*/
export const updateReservaSchema = z.object({
  fechaReserva: isoDate.optional(),                 
  loteId: idInt.optional(),                         // FK obligatoria
  clienteId: idInt.optional(),                      // FK obligatoria
  inmobiliariaId: idInt.optional().nullable(), // FK opcional (nullable por si lo vendio el club de campo y ninguna inm en el medio")
  sena: dinero.optional().nullable(), // Permitir null para eliminar la seña
  estado: z.enum(['ACTIVA', 'CANCELADA', 'ACEPTADA', 'RECHAZADA', 'CONTRAOFERTA', 'EXPIRADA']).optional(),
  numero: z.string().min(3, 'El número de reserva es obligatorio').max(30, 'El número de reserva es demasiado largo').trim().optional(),
  fechaFinReserva: isoDate.optional(), // Fecha de fin de la reserva
}).refine((data) => {
  // Asegurar que al menos un campo está presente
  return Object.keys(data).length > 0;
}, {
  message: 'Debes enviar al menos un campo para actualizar',
});

/*  Parametros comunes (/:id)
  -------------------------------
  - GET detalle, PUT, DELETE usan el mismo parametros q es el idReserva.
  - Política común de IDs de path (no usa idInt: en el path no se aceptan "1e2", "007", etc.).
*/
export const getReservaParamsSchema = idParamsSchema;

/*  Parametros para eliminar, usa el mismo que el de arriba del obtener */
export const deleteReservaParamsSchema = getReservaParamsSchema;
export const patchReservaParamsSchema = getReservaParamsSchema;

/*  Query del listado (GET /reservas)
  -------------------------------
  - Los IDs de query siguen la política común de IDs HTTP (positiveIntString, como los de path); no
    usan idInt, que es del body. El schema acepta más filtros de los que el service usa: el controller
    arma el DTO permitido (loteId, estado, estadoOperativo) a partir del resultado validado.
*/
export const queryReservasSchema = z.object({
  desde: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha "desde" inválida').optional(),
  hasta: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha "hasta" inválida').optional(),
  estado: z.enum(['ACTIVA', 'CANCELADA', 'ACEPTADA', 'RECHAZADA', 'CONTRAOFERTA', 'EXPIRADA']).optional(),
  estadoOperativo: z.enum(['OPERATIVO', 'ELIMINADO']).optional(),
  loteId: positiveIntString.optional(),
  clienteId: positiveIntString.optional(),
  inmobiliariaId: positiveIntString.optional(),
  sena: dinero.optional(),
  fechaFinReservaDesde: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha de fin de reserva "desde" inválida').optional(),
  fechaFinReservaHasta: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha de fin de reserva "hasta" inválida').optional(),
}).refine((q) => {
  if (q.desde && q.hasta) return new Date(q.desde) <= new Date(q.hasta);
  return true;
}, {
  message: 'El rango de fechas es inválido (desde > hasta)',
  path: ['hasta'],
});

export const createOfertaSchema = z.object({
  monto: dineroPositivo,
  motivo: z.string().optional(),
  action: z.enum(['CONTRAOFERTAR', 'ACEPTAR', 'RECHAZAR']).optional()
});