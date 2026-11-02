import { z } from 'zod';
import { idParamsSchema, positiveIntString } from './params.validation';
import { booleanQuery } from './query.validation';
import { idDelBody, numeroDelBody, INT4_MAX, tieneAlgunCampo, ACTUALIZAR_SIN_CAMPOS } from './body.validation';

// **Schemas de validacion para Lote**

// Campos de Lote sin defaults: base común de creación y actualización.
// Los defaults van solo en createLoteSchema; en Zod 4 un .default() sobrevive a .partial()
// y un update parcial terminaría escribiendo valores que el cliente no envió.
export const baseLoteSchema = z.object({
  // Números e IDs del body: política compartida (body.validation.ts). Sin z.coerce.number(), que
  // convertía null, "", false y [] en 0, true en 1 y "1e2" en 100. Las reglas de dominio no cambian.
  numero: numeroDelBody('El número de lote debe ser un número').pipe(
    z.number().int('El número de lote debe ser un número entero').positive('El número de lote debe ser positivo').max(INT4_MAX, 'El número de lote es demasiado grande'),
  ),
  fraccionId: idDelBody('de la fracción'),
  numPartido: numeroDelBody('El número de partido debe ser un número').pipe(
    z.number().int('El número de partido debe ser un número entero').max(INT4_MAX, 'El número de partido es demasiado grande'),
  ),
  superficie: numeroDelBody('La superficie debe ser un número').pipe(z.number().min(0, 'La superficie no puede ser negativa')).optional(),
  estado: z.enum(['Disponible', 'Reservado', 'Vendido', 'No Disponible', 'En Promoción']).optional(), // ALQUILADO removido como estado
  subestado: z.enum(['En Construccion', 'No Construido', 'Construido']),
  tipo: z.enum(['Lote Venta', 'Espacio Comun']), // Lote Venta o Espacio Común
  precio: numeroDelBody('El precio debe ser un número').pipe(z.number().min(0, 'El precio no puede ser negativo')).optional(),
  ocupacion: z.enum(['ALQUILADO', 'NO_ALQUILADO']).optional(), // Nueva dimensión de ocupación
  // Booleanos JSON estrictos: z.coerce.boolean() convertía "false" en true.
  alquiler: z.boolean().optional(), // LEGACY: mantener para compatibilidad, pero preferir ocupacion
  deuda: z.boolean().optional(),
  nombreEspacioComun: z.string().max(100, 'El nombre es demasiado largo').optional(),
  capacidad: numeroDelBody('La capacidad debe ser un número').pipe(z.number().int('La capacidad debe ser un número entero').min(0, 'La capacidad no puede ser negativa').max(INT4_MAX, 'La capacidad es demasiado grande')).optional(), // Lote.capacidad es Int en Prisma
  descripcion: z.string().optional(),
  propietarioId: idDelBody('del propietario'),
  inquilinoId: idDelBody('del inquilino').optional(),
  ubicacionId: idDelBody('de la ubicación').optional(),
  // Campos para crear ubicación: calle (enum) y numeroCalle (número)
  calle: z.enum(['REINAMORA', 'MACA', 'ZORZAL', 'CAUQUEN', 'ALONDRA', 'JACANA', 'TACUARITO', 'JILGUERO', 'GOLONDRINA', 'CALANDRIA', 'AGUILAMORA', 'LORCA', 'MILANO']).optional(),
  numeroCalle: numeroDelBody('El número de calle debe ser un número').pipe(
    z.number().int('El número de calle debe ser un número entero').positive('El número de calle debe ser positivo').max(INT4_MAX, 'El número de calle es demasiado grande'),
  ).optional(),
});

// Para crear un nuevo Lote (numPartido toma 62 si no se envía)
export const createLoteSchema = baseLoteSchema.extend({
  numPartido: baseLoteSchema.shape.numPartido.default(62),
});

// Para actualizar un Lote (todos los campos opcionales y sin defaults: lo no enviado no se toca)
// El body validado debe traer al menos un campo (un {} o solo claves ajenas es un update vacío: 400).
export const updateLoteSchema = baseLoteSchema.partial().refine(tieneAlgunCampo, ACTUALIZAR_SIN_CAMPOS);

// Para obtener un Lote por ID (política común de IDs de path)
export const getLoteSchema = idParamsSchema;

// Para eliminar un Lote por ID (igual que obtener)
export const deleteLoteSchema = getLoteSchema;

// Para filtrar lotes por varios parámetros (GET /api/lotes).
// El controller pasa el resultado validado al service, así que lo que el service lee tiene que
// estar declarado acá: Zod descarta las claves que el schema no declara. IDs con la política
// común (positiveIntString) y deudor como booleano estricto ("true" | "false").
export const queryLoteSchema = z.object({
  estado: z.enum(['Disponible', 'Reservado', 'Vendido', 'No Disponible', 'En Promoción']).optional(), // ALQUILADO removido
  subestado: z.enum(['En Construccion', 'No Construido', 'Construido']).optional(),
  tipo: z.enum(['Lote Venta', 'Espacio Comun']).optional(),
  ocupacion: z.enum(['ALQUILADO', 'NO_ALQUILADO']).optional(), // Nuevo filtro de ocupación
  propietarioId: positiveIntString.optional(),
  ubicacionId: positiveIntString.optional(),
  deudor: booleanQuery.optional(),
});
