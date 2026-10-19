import { z } from 'zod';
import { idParamsSchema } from './params.validation';

// **Schemas de validacion para Lote**

// Campos de Lote sin defaults: base común de creación y actualización.
// Los defaults van solo en createLoteSchema; en Zod 4 un .default() sobrevive a .partial()
// y un update parcial terminaría escribiendo valores que el cliente no envió.
export const baseLoteSchema = z.object({
  numero: z.coerce.number().int('El número de lote debe ser un número entero').positive('El número de lote debe ser positivo'),
  fraccionId: z.coerce.number().int('La fracción debe ser un número entero').positive('La fracción debe ser positiva'),
  numPartido: z.coerce.number().int(),
  superficie: z.coerce.number().min(0, 'La superficie no puede ser negativa').optional(),
  estado: z.enum(['Disponible', 'Reservado', 'Vendido', 'No Disponible', 'En Promoción']).optional(), // ALQUILADO removido como estado
  subestado: z.enum(['En Construccion', 'No Construido', 'Construido']),
  tipo: z.enum(['Lote Venta', 'Espacio Comun']), // Lote Venta o Espacio Común
  precio: z.coerce.number().min(0, 'El precio no puede ser negativo').optional(),
  ocupacion: z.enum(['ALQUILADO', 'NO_ALQUILADO']).optional(), // Nueva dimensión de ocupación
  // Booleanos JSON estrictos: z.coerce.boolean() convertía "false" en true.
  alquiler: z.boolean().optional(), // LEGACY: mantener para compatibilidad, pero preferir ocupacion
  deuda: z.boolean().optional(),
  nombreEspacioComun: z.string().max(100, 'El nombre es demasiado largo').optional(),
  capacidad: z.coerce.number().min(0, 'La capacidad no puede ser negativa').optional(), 
  descripcion: z.string().optional(),
  propietarioId: z.coerce.number().int('El ID del propietario debe ser un número entero').positive('El ID del propietario debe ser positivo'),
  inquilinoId: z.coerce.number().int('El ID del inquilino debe ser un número entero').positive('El ID del inquilino debe ser positivo').optional(),
  ubicacionId: z.coerce.number().int('El ID de la ubicación debe ser un número entero').positive('El ID de la ubicación debe ser positivo').optional(),
  // Campos para crear ubicación: calle (enum) y numeroCalle (número)
  calle: z.enum(['REINAMORA', 'MACA', 'ZORZAL', 'CAUQUEN', 'ALONDRA', 'JACANA', 'TACUARITO', 'JILGUERO', 'GOLONDRINA', 'CALANDRIA', 'AGUILAMORA', 'LORCA', 'MILANO']).optional(),
  numeroCalle: z.coerce.number().int('El número de calle debe ser un número entero').positive('El número de calle debe ser positivo').optional(),
});

// Para crear un nuevo Lote (numPartido toma 62 si no se envía)
export const createLoteSchema = baseLoteSchema.extend({
  numPartido: baseLoteSchema.shape.numPartido.default(62),
});

// Para actualizar un Lote (todos los campos opcionales y sin defaults: lo no enviado no se toca)
export const updateLoteSchema = baseLoteSchema.partial();

// Para obtener un Lote por ID (política común de IDs de path)
export const getLoteSchema = idParamsSchema;

// Para eliminar un Lote por ID (igual que obtener)
export const deleteLoteSchema = getLoteSchema;

// Para filtrar lotes por varios parámetros
export const queryLoteSchema = z.object({
  estado: z.enum(['Disponible', 'Reservado', 'Vendido', 'No Disponible', 'En Promoción']).optional(), // ALQUILADO removido
  subestado: z.enum(['En Construccion', 'No Construido', 'Construido']).optional(),
  tipo: z.enum(['Lote Venta', 'Espacio Comun']).optional(),
  ocupacion: z.enum(['ALQUILADO', 'NO_ALQUILADO']).optional(), // Nuevo filtro de ocupación
  propietarioId: z.coerce.number().int('El ID del propietario debe ser un número entero').positive('El ID del propietario debe ser positivo').optional(),
  ubicacionId: z.coerce.number().int('El ID de la ubicación debe ser un número entero').positive('El ID de la ubicación debe ser positivo').optional(),
  fechaCreacionFrom: z.string().refine((date) => !isNaN(Date.parse(date)), { message: 'Fecha de creación "from" inválida' }).optional(),
  fechaCreacionTo: z.string().refine((date) => !isNaN(Date.parse(date)), { message: 'Fecha de creación "to" inválida' }).optional(),
  superficieMin: z.coerce.number().min(0, 'La superficie mínima no puede ser negativa').optional(),
  superficieMax: z.coerce.number().min(0, 'La superficie máxima no puede ser negativa').optional(),
});
