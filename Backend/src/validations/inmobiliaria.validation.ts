import { z } from 'zod';
import { idParamsSchema } from './params.validation';
import { idDelBody, numeroDelBody, INT4_MAX, tieneAlgunCampo, ACTUALIZAR_SIN_CAMPOS } from './body.validation';

// Definimos el enum una vez para reusarlo
const EstadoInmobiliariaEnum = z.enum(['OPERATIVO', 'ELIMINADO']);

// Comisión por venta (porcentaje 0..100). Decisión de negocio cerrada: null significa "sin
// comisión" y se normaliza a 0 de forma explícita. Antes lo lograba z.coerce.number() por
// accidente, y por el mismo mecanismo "", false y [] también valían 0 y true valía 1: ahora
// solo se aceptan number y string decimal ("5.5"), más null → 0.
const comisionPorVenta = z
    .preprocess(
        (valor) => (valor === null ? 0 : valor),
        numeroDelBody('La comisión por venta debe ser un número').pipe(
            z.number()
                .min(0, 'La comisión por venta no puede ser negativa')
                .max(100, 'La comisión por venta no puede ser mayor a 100'),
        ),
    )
    .optional();

// Límite de prioridades activas: contador entero >= 0; null limpia el límite (nullable actual).
const maxPrioridadesActivas = numeroDelBody('El máximo de prioridades activas debe ser un número')
    .pipe(
        z.number()
            .int('El máximo de prioridades activas debe ser un entero')
            .min(0, 'El máximo de prioridades activas no puede ser negativo')
            .max(INT4_MAX, 'El máximo de prioridades activas es demasiado grande'),
    )
    .nullable()
    .optional();

export const createInmobiliariaSchema = z.object({
    nombre: z.string().min(1, 'Se requiere un nombre').max(100, 'El nombre es demasiado largo').trim(),
    razonSocial: z.string().min(1, 'Se requiere una razón social').max(150, 'La razón social es demasiado larga').trim(),
    contacto: z.string().max(100, 'El contacto es demasiado largo').optional(),
    comxventa: comisionPorVenta,
    userId: idDelBody('del usuario').optional(),
    maxPrioridadesActivas,
    
    // Recomendación: Al crear, no deberíamos permitir enviar fechaBaja ni estado ELIMINADO.
    // Lo forzamos por defecto y ocultamos la fechaBaja en la creación.
    estado: EstadoInmobiliariaEnum.default('OPERATIVO'),
});

// body del PUT
export const updateInmobiliariaSchema = z.object({
    nombre: z.string().min(1).max(100).trim().optional(),
    razonSocial: z.string().min(1).max(150).trim().optional(),
    contacto: z.string().max(100).optional(),
    comxventa: comisionPorVenta,
    userId: idDelBody('del usuario').optional(),
    maxPrioridadesActivas,
    
    // Acá si permito cambiar el estado
    estado: EstadoInmobiliariaEnum.optional(),
   
    // z.coerce.date() transforma el string ISO a objeto Date válido para Prisma.
    fechaBaja: z.coerce.date().nullable().optional(), 
})
.refine(tieneAlgunCampo, ACTUALIZAR_SIN_CAMPOS);

// params: /:id (política común de IDs de path)
export const idParamSchema = idParamsSchema;

// Query de GET /inmobiliarias: el listado solo filtra por estadoOperativo
// (sin el parámetro, el service devuelve solo OPERATIVO).
export const listInmobiliariasQuerySchema = z.object({
    estadoOperativo: EstadoInmobiliariaEnum.optional(),
});

export const getInmobiliariaSchema = idParamSchema;
export const deleteInmobiliariaSchema = idParamSchema;
