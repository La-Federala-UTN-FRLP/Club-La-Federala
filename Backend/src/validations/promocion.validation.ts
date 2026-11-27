import { z } from 'zod';
import { idParamsSchema } from './params.validation';
import { numeroDelBody } from './body.validation';

// Schema para aplicar promoción
export const aplicarPromocionSchema = z.object({
  // Política compartida de números del body: sin z.coerce (true valía 1, [5] valía 5, "1e2" valía 100).
  precioPromocional: numeroDelBody('El precio promocional debe ser un número').pipe(
    z.number()
      .positive('El precio promocional debe ser positivo')
      .min(0.01, 'El precio promocional debe ser mayor a cero')
      // La columna es Decimal(12,2): con más decimales Postgres redondea (999.995 → 1000.00).
      // Tolerancia para la representación binaria (0.07 * 100 = 7.000000000000001).
      .refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, {
        message: 'El precio promocional puede tener hasta 2 decimales',
      }),
  ),
  fin: z
    .union([
      z.string().transform((val) => {
        if (!val || val.trim() === '') return null;
        const parsed = new Date(val);
        return isNaN(parsed.getTime()) ? null : parsed;
      }),
      z.date(),
      z.null(),
      z.undefined(),
    ])
    .optional()
    .nullable()
    .refine((val) => {
      if (!val || val === null || val === undefined) return true;
      if (val instanceof Date) {
        return val > new Date();
      }
      return false;
    }, { message: 'La fecha de fin debe ser una fecha válida en el futuro' }),
  explicacion: z
    .union([z.string(), z.null(), z.undefined(), z.literal('')])
    .optional()
    .nullable()
    .refine((val) => {
      if (!val || val === null || val === undefined || val === '') return true;
      return typeof val === 'string' && val.length <= 500;
    }, { message: 'La explicación no puede tener más de 500 caracteres' }),
});

// Schema para quitar promoción (sin body, solo params: id del lote)
export const quitarPromocionSchema = idParamsSchema;

// Schema para obtener promoción activa (params: id del lote)
export const getPromocionActivaSchema = idParamsSchema;








