import { z } from 'zod';
import { idParamsSchema, positiveIntString, ventaIdParamsSchema } from './params.validation';
import { booleanQuery } from './query.validation';

// Mismos valores que el enum TiposArchivos de Prisma
const tipoArchivoEnum = z.enum(['BOLETO', 'ESCRITURA', 'PLANO', 'IMAGEN', 'OTRO']);

export const fileMetadataSchema = z.object({
    filename: z.string().min(1, "El nombre del archivo es obligatorio"),
    url: z.string().url("La URL debe ser válida"),
    idLoteAsociado: z.number().int().positive("El ID del lote asociado debe ser un número entero positivo"),
    uploadedBy: z.string().nullable(),
    uploadedAt: z.date().default(() => new Date())
});

export const createFileMetadataSchema = z.object({
    idLoteAsociado: z.preprocess((val) => Number(val), z.number().int().positive()),
    tipo: tipoArchivoEnum,
    ventaId: z.preprocess((val) => (val === '' || val === undefined ? undefined : Number(val)), z.number().int().positive().optional()),
});

export const updateFileMetadataSchema = z.object({
    filename: z.string().min(1, "El nombre del archivo es obligatorio").optional(),
    url: z.string().url("La URL debe ser válida").optional(),   
    idLoteAsociado: z.number().int().positive("El ID del lote asociado debe ser un número entero positivo").optional(),
    uploadedBy: z.string().nullable().optional(),
    uploadedAt: z.date().optional()
});

export const deleteFileMetadataSchema = z.object({
    id: z.number().int().positive("El ID del archivo debe ser un número entero positivo")
});

// Params de las rutas activas de /api/files (política común de IDs de path)
export const fileIdParamsSchema = idParamsSchema;
export const fileVentaParamsSchema = ventaIdParamsSchema;
export const fileLoteParamsSchema = z.object({ idLoteAsociado: positiveIntString });

// Query de GET /api/files/venta/:ventaId (includeDeleted ya sale como boolean)
export const filesByVentaQuerySchema = z.object({
    tipo: tipoArchivoEnum.optional(),
    includeDeleted: booleanQuery.optional(),
});

// Query de GET /api/files/lote/:idLoteAsociado: solo includeDeleted (no hay filtro por tipo)
export const filesByLoteQuerySchema = z.object({
    includeDeleted: booleanQuery.optional(),
});

export const updateAprobacionSchema = z.object({
    target: z.enum(['COMISION', 'MUNICIPIO'], { message: 'target es obligatorio' }),
    estado: z.enum(['PENDIENTE', 'APROBADO', 'RECHAZADO'], { message: 'estado es obligatorio' }),
    observacion: z.string().max(500).optional(),
});

