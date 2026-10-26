// src/validations/pago.validation.ts
import { z } from 'zod';
import { ventaIdParamsSchema } from './params.validation';

// Helpers reutilizables (mismo estilo que reserva.validation.ts)
const idInt = z.coerce.number().int('El id debe ser entero').positive('El id debe ser positivo');
const dineroPositivo = z.coerce.number().positive('El monto debe ser mayor a 0');
const dinero = z.coerce.number().min(0, 'El monto no puede ser negativo');

const isoDate = z
  .union([
    z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha inválida'),
    z.date()
  ])
  .transform((v) => (v instanceof Date ? v.toISOString() : new Date(v).toISOString()));

// Enums válidos del submódulo Pagos
const tipoFinanciacionEnum = z.enum(['CONTADO', 'ANTICIPO_CUOTAS', 'CUOTAS_FIJAS', 'PERSONALIZADO']);
const monedaEnum = z.enum(['ARS', 'USD']);
const tipoCuotaEnum = z.enum(['ANTICIPO', 'CUOTA', 'OTRO']);
const medioPagoEnum = z.enum(['EFECTIVO', 'TRANSFERENCIA', 'DEPOSITO', 'CHEQUE', 'OTRO']);

// Params: ventaId (política común de IDs de path)
export const ventaIdParamSchema = ventaIdParamsSchema;

// Cuota dentro del body de creación de plan
const cuotaInputSchema = z.object({
  numeroCuota: z.coerce.number().int('El número de cuota debe ser entero').positive('El número de cuota debe ser positivo'),
  tipoCuota: tipoCuotaEnum,
  fechaVencimiento: isoDate,
  montoOriginal: dineroPositivo,
  descripcion: z.string().trim().optional(),
});

// Campos comunes plan + cuotas (sin moneda ni monto total; sirve para creación y reemplazo)
const planPagoCuotasBodyShape = {
  nombre: z.string().min(1, 'El nombre del plan es obligatorio').max(100, 'El nombre del plan es demasiado largo').trim(),
  tipoFinanciacion: tipoFinanciacionEnum,
  cantidadCuotas: z.coerce.number().int('La cantidad de cuotas debe ser un entero').positive('La cantidad de cuotas debe ser positiva'),
  fechaInicio: isoDate,
  cuotas: z.array(cuotaInputSchema).min(1, 'Debe incluir al menos una cuota'),
  descripcion: z.string().trim().optional(),
  montoAnticipo: dinero.optional(),
  observaciones: z.string().trim().optional(),
};

/** Base reutilizable: reglas que no dependen del monto total planificado */
export const planPagoCuotasBaseSchema = z.object(planPagoCuotasBodyShape)
  .refine((data) => {
    if (data.tipoFinanciacion !== 'CONTADO') return true;
    return (data.montoAnticipo ?? 0) === 0;
  }, {
    message: 'Para Contado, el anticipo no aplica y debe ser 0',
    path: ['montoAnticipo'],
  })
  .refine((data) => {
    if (data.tipoFinanciacion !== 'ANTICIPO_CUOTAS') return true;
    const anticipo = data.montoAnticipo ?? 0;
    return anticipo > 0;
  }, {
    message: 'Para Anticipo + cuotas, el anticipo es obligatorio y debe ser mayor a 0',
    path: ['montoAnticipo'],
  })
  .refine((data) => data.cantidadCuotas === data.cuotas.length, {
    message: 'La cantidad de cuotas debe coincidir con el número de cuotas enviadas',
    path: ['cantidadCuotas'],
  })
  .refine((data) => {
    const numeros = data.cuotas.map((c) => c.numeroCuota);
    return new Set(numeros).size === numeros.length;
  }, {
    message: 'No se permiten números de cuota repetidos',
    path: ['cuotas'],
  })
  .superRefine((data, ctx) => {
    const toUtcMidnight = (iso: string) => {
      const d = new Date(iso);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    };
    const fechaInicioTs = toUtcMidnight(data.fechaInicio);
    data.cuotas.forEach((c, i) => {
      const fechaVtoTs = toUtcMidnight(c.fechaVencimiento);
      if (fechaVtoTs < fechaInicioTs) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'La fecha de vencimiento de la cuota no puede ser anterior a la fecha de inicio del plan',
          path: ['cuotas', i, 'fechaVencimiento'],
        });
      }
    });
  });

// Body: crear plan de pago inicial
export const createPlanPagoSchema = planPagoCuotasBaseSchema
  .safeExtend({
    moneda: monedaEnum,
    montoTotalPlanificado: dineroPositivo,
  })
  .refine((data) => {
    const anticipo = data.montoAnticipo ?? 0;
    return data.montoTotalPlanificado >= anticipo;
  }, {
    message: 'El monto total planificado debe ser mayor o igual al anticipo',
    path: ['montoAnticipo'],
  })
  .refine((data) => {
    if (data.tipoFinanciacion !== 'ANTICIPO_CUOTAS') return true;
    const anticipo = data.montoAnticipo ?? 0;
    return anticipo < data.montoTotalPlanificado;
  }, {
    message: 'El anticipo debe ser menor al monto total planificado',
    path: ['montoAnticipo'],
  })
  .superRefine((data, ctx) => {
    const TOLERANCIA = 0.01;
    const getMontoEsperado = (d: typeof data) => {
      const total = d.montoTotalPlanificado;
      const anticipo = d.montoAnticipo ?? 0;
      switch (d.tipoFinanciacion) {
        case 'CONTADO': return total;
        case 'PERSONALIZADO': return anticipo > 0 ? total - anticipo : total;
        case 'CUOTAS_FIJAS': return total - anticipo;
        case 'ANTICIPO_CUOTAS': return total;
        default: return total;
      }
    };
    const montoEsperado = getMontoEsperado(data);
    const sumaCuotas = data.cuotas.reduce((acc, c) => acc + Number(c.montoOriginal), 0);
    if (Math.abs(sumaCuotas - montoEsperado) > TOLERANCIA) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `La suma de las cuotas (${sumaCuotas.toFixed(2)}) no coincide con el monto esperado (${montoEsperado.toFixed(2)})`,
        path: ['cuotas'],
      });
    }
  });

/**
 * Reemplazo de plan: mismo cuerpo que creación salvo moneda (opcional, solo para verificación)
 * y sin montoTotalPlanificado (el servidor usa el saldo pendiente real del plan vigente).
 */
export const reemplazarPlanPagoSchema = planPagoCuotasBaseSchema.safeExtend({
  moneda: monedaEnum.optional(),
});

// Body: registrar pago sobre una cuota
export const registrarPagoSchema = z.object({
  cuotaId: idInt,
  fechaPago: isoDate,
  monto: dineroPositivo,
  medioPago: medioPagoEnum,
  referencia: z.string().trim().optional(),
  observacion: z.string().trim().optional(),
});

// Body: aplicar recargo manual (importe final acumulativo sobre la cuota)
export const aplicarRecargoSchema = z.object({
  cuotaId: idInt,
  montoRecargo: dineroPositivo,
});
