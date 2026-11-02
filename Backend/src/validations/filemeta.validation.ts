import { z } from 'zod';
import { idParamsSchema, positiveIntString, ventaIdParamsSchema } from './params.validation';
import { booleanQuery } from './query.validation';

// Mismos valores que el enum TiposArchivos de Prisma
const tipoArchivoEnum = z.enum(['BOLETO', 'ESCRITURA', 'PLANO', 'IMAGEN', 'OTRO']);

// Body de POST /api/files (multipart/form-data): todo campo de texto llega como string, así que
// los IDs usan la política de string decimal canónico (positiveIntString, la misma de path y query)
// y no la de JSON. Number()/parseInt() aceptaban "1e2" (100), "0x10" (16) y "007" (7).
// ventaId vacío ("") se toma como ausente: es el comportamiento previo del form.
// Las reglas de dominio (qué tipos exigen o prohíben venta) siguen en el controller.
export const createFileMetadataSchema = z.object({
    idLoteAsociado: positiveIntString,
    tipo: tipoArchivoEnum,
    ventaId: z.union([z.literal('').transform(() => undefined), positiveIntString]).optional(),
});

export type CreateFileMetadataInput = z.output<typeof createFileMetadataSchema>;

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

