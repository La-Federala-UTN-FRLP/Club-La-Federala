import { z } from 'zod';
import { idParamsSchema, positiveIntString } from './params.validation';

// Schemas base reutilizables
const estadoVentaEnum = z.enum(['INICIADA', 'CON_BOLETO', 'ESCRITURADO', 'CANCELADA']);
const estadoCobroEnum = z.enum(['PENDIENTE', 'EN_CURSO', 'PAGO_COMPLETO']);
const estadoOperativoEnum = z.enum(['OPERATIVO', 'ELIMINADO']);

const fechaISO = z.string().refine((date) => !isNaN(Date.parse(date)), { 
    message: 'Fecha inválida' 
});

// Números del body: number finito o string en notación decimal ("10", " 10.5 ", "-1").
// Reemplaza z.coerce.number(), que convertía null, "", "   ", false y [] en 0 y true en 1.
// Las reglas propias de cada campo (min, int, positive) se aplican después sobre el número.
const numeroDelBody = (mensaje: string) =>
    z.union([z.number(), z.string().trim().regex(/^-?\d+(\.\d+)?$/)], { message: mensaje })
        .transform(Number);

const montoSchema = numeroDelBody('El monto debe ser un número')
    .pipe(z.number().min(0, 'El monto no puede ser negativo'));

// IDs del body (los params y la query mantienen su propio schema)
const idDelBody = (entidad: string) =>
    numeroDelBody(`El ID ${entidad} debe ser un número`).pipe(
        z.number()
            .int(`El ID ${entidad} debe ser un número entero`)
            .positive(`El ID ${entidad} debe ser un número positivo`),
    );

const compradorInputSchema = z.object({
    personaId: idDelBody('de la persona'),
});

export const createVentaSchema = z.object({
    loteId: idDelBody('del lote'),
    fechaVenta: fechaISO,
    monto: montoSchema,
    estado: estadoVentaEnum.optional(),
    estadoCobro: estadoCobroEnum.optional(),
    plazoEscritura: fechaISO.optional(),
    fechaEscrituraReal: fechaISO.optional(),
    fechaCancelacion: fechaISO.optional(),
    motivoCancelacion: z.string().trim().min(1, 'El motivo de cancelación no puede estar vacío').optional(),
    tipoPago: z.string().trim().min(1, 'Se requiere un tipo de pago'),
    compradorId: idDelBody('del comprador').optional(), // legacy

    compradores: z.array(compradorInputSchema).min(1, 'Debe especificar al menos un comprador').optional(),
    inmobiliariaId: idDelBody('de la inmobiliaria').optional(),
    reservaId: z.number().int('El ID de la reserva debe ser un número entero').positive('El ID de la reserva debe ser un número positivo').optional().nullable(),
    numero: z.string().trim().min(3, 'El número de venta es obligatorio').max(30, 'El número de venta es demasiado largo'),
}).refine((data) => {
    // Debe venir compradores[] O compradorId (al menos uno)
    const tieneCompradores = data.compradores && data.compradores.length > 0;
    const tieneCompradorId = data.compradorId != null;
    return tieneCompradores || tieneCompradorId;
}, {
    message: 'Debe especificar al menos un comprador (campo compradores[] o compradorId)',
    path: ['compradores'],
}).refine((data) => {
    // Si estado es ESCRITURADO, fechaEscrituraReal es obligatoria
    if (data.estado === 'ESCRITURADO' && !data.fechaEscrituraReal) {
        return false;
    }
    return true;
}, {
    message: 'El campo fechaEscrituraReal es obligatorio para el estado ESCRITURADO',
    path: ['fechaEscrituraReal'],
}).refine((data) => {
    // Si estado es CANCELADA, fechaCancelacion es obligatoria
    if (data.estado === 'CANCELADA' && !data.fechaCancelacion) {
        return false;
    }
    return true;
}, {
    message: 'El campo fechaCancelacion es obligatorio para el estado CANCELADA',
    path: ['fechaCancelacion'],
}).refine((data) => {
    // Si estado es CANCELADA, motivoCancelacion es obligatorio
    if (data.estado === 'CANCELADA' && !data.motivoCancelacion) {
        return false;
    }
    return true;
}, {
    message: 'El campo motivoCancelacion es obligatorio para el estado CANCELADA',
    path: ['motivoCancelacion'],
});

export const updateVentaSchema = z.object({
    loteId: idDelBody('del lote').optional(),
    fechaVenta: fechaISO.optional(),
    monto: montoSchema.optional(),
    estado: estadoVentaEnum.optional(),
    estadoCobro: estadoCobroEnum.optional(),
    plazoEscritura: fechaISO.optional(),
    fechaEscrituraReal: fechaISO.optional(),
    fechaCancelacion: fechaISO.optional(),
    motivoCancelacion: z.string().trim().min(1, 'El motivo de cancelación no puede estar vacío').optional(),
    tipoPago: z.string().trim().min(1, 'Se requiere un tipo de pago').optional(),
    compradorId: idDelBody('del comprador').optional(), // legacy

    compradores: z.array(compradorInputSchema).min(1, 'Debe especificar al menos un comprador').optional(),
    inmobiliariaId: idDelBody('de la inmobiliaria').optional(),
    numero: z.string().trim().min(3, 'El número de venta es obligatorio').max(30, 'El número de venta es demasiado largo').optional(),
}).refine((data) => {
    // Si se envía compradores[], debe tener al menos 1
    if (data.compradores !== undefined && data.compradores.length === 0) {
        return false;
    }
    return true;
}, {
    message: 'La lista de compradores no puede estar vacía',
    path: ['compradores'],
});
// Los campos obligatorios por estado (fechaEscrituraReal para ESCRITURADO; fecha y motivo
// para CANCELADA) no se exigen acá: en un update parcial pueden estar ya persistidos.
// Los valida updateVenta con assertCamposObligatoriosPorEstado sobre DB + payload.

// Params /:id de Venta (política común de IDs de path)
export const getVentaSchema = idParamsSchema;

export const deleteVentaSchema = getVentaSchema;
export const patchVentaParamsSchema = getVentaSchema;

// Query de GET /ventas y GET /ventas/inmobiliaria/:id. IDs con la política común de IDs HTTP
// (positiveIntString). El schema acepta más filtros de los que los services usan: cada controller
// arma el DTO permitido a partir del resultado validado.
export const queryVentaSchema = z.object({
    estado: estadoVentaEnum.optional(),
    estadoOperativo: estadoOperativoEnum.optional(),
    compradorId: positiveIntString.optional(),
    vendedorId: positiveIntString.optional(),
    loteId: positiveIntString.optional(),
    fechaVentaFrom: fechaISO.optional(),
    fechaVentaTo: fechaISO.optional(),
    montoMin: z.coerce.number().min(0, 'El monto mínimo no puede ser negativo').optional(),
    montoMax: z.coerce.number().min(0, 'El monto máximo no puede ser negativo').optional(),
})
