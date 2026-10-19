import { z } from 'zod';
import { idParamsSchema } from './params.validation';

// Definimos el enum una vez para reusarlo
const EstadoInmobiliariaEnum = z.enum(['OPERATIVO', 'ELIMINADO']);

export const createInmobiliariaSchema = z.object({
    nombre: z.string().min(1, 'Se requiere un nombre').max(100, 'El nombre es demasiado largo').trim(),
    razonSocial: z.string().min(1, 'Se requiere una razón social').max(150, 'La razón social es demasiado larga').trim(),
    contacto: z.string().max(100, 'El contacto es demasiado largo').optional(),
    // IMPORTANTE: z.coerce convierte el string del JSON a número automáticamente
    comxventa: z.coerce.number().min(0, 'La comisión por venta no puede ser negativa').max(100, 'La comisión por venta no puede ser mayor a 100').optional(),
    userId: z.coerce.number().int().positive().optional(),
    maxPrioridadesActivas: z.coerce.number().int().min(0).nullable().optional(),
    
    // Recomendación: Al crear, no deberíamos permitir enviar fechaBaja ni estado ELIMINADO.
    // Lo forzamos por defecto y ocultamos la fechaBaja en la creación.
    estado: EstadoInmobiliariaEnum.default('OPERATIVO'),
});

// body del PUT
export const updateInmobiliariaSchema = z.object({
    nombre: z.string().min(1).max(100).trim().optional(),
    razonSocial: z.string().min(1).max(150).trim().optional(),
    contacto: z.string().max(100).optional(),
    comxventa: z.coerce.number().min(0).max(100).optional(),
    userId: z.coerce.number().int().positive().optional(),
    maxPrioridadesActivas: z.coerce.number().int().min(0).nullable().optional(),
    
    // Acá si permito cambiar el estado
    estado: EstadoInmobiliariaEnum.optional(),
   
    // z.coerce.date() transforma el string ISO a objeto Date válido para Prisma.
    fechaBaja: z.coerce.date().nullable().optional(), 
})
.refine((d) => Object.keys(d).length > 0, { message: 'Debe enviar al menos un campo para actualizar' });

// params: /:id (política común de IDs de path)
export const idParamSchema = idParamsSchema;

// GET query params
export const queryInmobiliariaSchema = z.object({
    nombre: z.string().trim().optional(),
    razonSocial: z.string().trim().optional(),
    contacto: z.string().optional(),
    userId: z.coerce.number().int().positive().optional(),
    estado: EstadoInmobiliariaEnum.optional(),
}); 


// Query de GET /inmobiliarias: el listado solo filtra por estadoOperativo
// (sin el parámetro, el service devuelve solo OPERATIVO).
export const listInmobiliariasQuerySchema = z.object({
    estadoOperativo: EstadoInmobiliariaEnum.optional(),
});

export const getInmobiliariaSchema = idParamSchema;
export const deleteInmobiliariaSchema = idParamSchema;
