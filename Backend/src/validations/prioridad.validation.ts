// src/validations/prioridad.validation.ts
import { z } from 'zod';
import { idParamsSchema, positiveIntString } from './params.validation';

// Helpers reutilizables
const idInt = z.coerce.number().int('El id debe ser entero').positive('El id debe ser positivo');

// Acepto que venga tipo Date o string y lo normalizo a ISO
const isoDate = z
  .union([
    z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha inválida'),
    z.date()
  ])
  .transform((v) => (v instanceof Date ? v.toISOString() : new Date(v).toISOString()));

// ==============================
// Body: crear prioridad
// ==============================
export const createPrioridadSchema = z.object({
  numero: z.string().min(1, 'El número de prioridad es obligatorio').trim(),
  loteId: idInt,
  fechaInicio: isoDate,
  fechaFin: isoDate,
  // Permitir ownerType e inmobiliariaId opcionales para ADMIN/GESTOR
  ownerType: z.enum(['INMOBILIARIA', 'CCLF']).optional(),
  inmobiliariaId: idInt.optional().nullable(),
}).refine(
  (data) => {
    const fechaInicioDate = new Date(data.fechaInicio);
    const fechaFinDate = new Date(data.fechaFin);
    return fechaFinDate > fechaInicioDate;
  },
  {
    message: 'La fecha de fin debe ser posterior a la fecha de inicio',
    path: ['fechaFin'],
  }
).refine(
  (data) => {
    const fechaFinDate = new Date(data.fechaFin);
    const now = new Date();
    return fechaFinDate > now;
  },
  {
    message: 'La fecha de fin debe ser posterior a la fecha actual',
    path: ['fechaFin'],
  }
);

// ==============================
// Body: actualizar prioridad
// ==============================
export const updatePrioridadSchema = z.object({
  numero: z.string().min(1, 'El número de prioridad es obligatorio').trim().optional(),
  inmobiliariaId: idInt.optional().nullable(),
  fechaFin: isoDate.optional(),
}).refine((data) => {
  // Asegurar que al menos un campo está presente
  return Object.keys(data).length > 0;
}, {
  message: 'Debes enviar al menos un campo para actualizar',
}).refine(
  (data) => {
    if (!data.fechaFin) return true;
    const fechaFinDate = new Date(data.fechaFin);
    const now = new Date();
    return fechaFinDate > now;
  },
  {
    message: 'La fecha de fin debe ser posterior a la fecha actual',
    path: ['fechaFin'],
  }
);

// ==============================
// Parámetros comunes (/:id) — política común de IDs de path
// ==============================
export const getPrioridadParamsSchema = idParamsSchema;

// ==============================
// Query del listado (GET /prioridades). IDs con la política común de IDs HTTP (positiveIntString);
// idInt es solo del body.
// ==============================
export const queryPrioridadesSchema = z.object({
  estado: z.enum(['ACTIVA', 'CANCELADA', 'FINALIZADA', 'EXPIRADA']).optional(),
  estadoOperativo: z.enum(['OPERATIVO', 'ELIMINADO']).optional(),
  ownerType: z.enum(['INMOBILIARIA', 'CCLF']).optional(),
  inmobiliariaId: positiveIntString.optional(),
  loteId: positiveIntString.optional(),
  fechaInicioDesde: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha "desde" inválida').optional(),
  fechaInicioHasta: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha "hasta" inválida').optional(),
  fechaFinDesde: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha de fin "desde" inválida').optional(),
  fechaFinHasta: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha de fin "hasta" inválida').optional(),
}).refine((q) => {
  if (q.fechaInicioDesde && q.fechaInicioHasta) {
    return new Date(q.fechaInicioDesde) <= new Date(q.fechaInicioHasta);
  }
  return true;
}, {
  message: 'El rango de fechas de inicio es inválido (desde > hasta)',
  path: ['fechaInicioHasta'],
}).refine((q) => {
  if (q.fechaFinDesde && q.fechaFinHasta) {
    return new Date(q.fechaFinDesde) <= new Date(q.fechaFinHasta);
  }
  return true;
}, {
  message: 'El rango de fechas de fin es inválido (desde > hasta)',
  path: ['fechaFinHasta'],
});

// ==============================
// Parámetros para eliminar/reactivar (PATCH /prioridades/:id/eliminar o /reactivar)
// ==============================
export const patchPrioridadParamsSchema = getPrioridadParamsSchema;
