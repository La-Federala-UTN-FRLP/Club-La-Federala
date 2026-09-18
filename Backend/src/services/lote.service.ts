import { DeleteLoteResponse, TipoLote as TipoLoteDto, EstadoLoteOpc as EstadoLoteDto, SubestadoLote as SubestadoLoteDto} from '../types/interfacesCCLF.d';
import { Lote, TipoLote as TipoLotePrisma, EstadoLote as EstadoLotePrisma, SubestadoLote as SubestadoLotePrisma} from '../generated/prisma';
import prisma from '../config/prisma';
import { Prisma } from '../generated/prisma';
import { cancelActivesOnNoDisponible } from '../domain/loteState/loteState.effects';

// --------- DTO <-> PRISMA maps ----------
const tipoLoteToPrisma = (t: TipoLoteDto | undefined): TipoLotePrisma => {
  if (!t) {
    throw new Error('Tipo de lote no puede ser undefined');
  }
  const map: Record<TipoLoteDto, TipoLotePrisma> = {
    'Lote Venta': 'LOTE_VENTA',
    'Espacio Comun': 'ESPACIO_COMUN',
  };
  const result = map[t];
  if (!result) {
    throw new Error(`Tipo de lote inválido: ${t}`);
  }
  return result;
};
const estadoLoteDtoToPrismaMap: Record<EstadoLoteDto, EstadoLotePrisma> = {
  'Disponible': 'DISPONIBLE',
  'Reservado': 'RESERVADO',
  'Vendido': 'VENDIDO',
  'No Disponible': 'NO_DISPONIBLE',
  'Alquilado': 'ALQUILADO',
  'En Promoción': 'EN_PROMOCION',
  'Con Prioridad': 'CON_PRIORIDAD',
};

function isEstadoLoteDtoLabel(value: string): value is EstadoLoteDto {
  return Object.prototype.hasOwnProperty.call(estadoLoteDtoToPrismaMap, value);
}

const estadoLoteToPrisma = (e: string | EstadoLoteDto | undefined): EstadoLotePrisma | undefined => {
  if (!e) return undefined;
  if (!isEstadoLoteDtoLabel(e)) return undefined;
  return estadoLoteDtoToPrismaMap[e];
};
const subestadoLoteToPrisma = (s: SubestadoLoteDto | undefined): SubestadoLotePrisma | undefined => {
  if (!s) return undefined;
  const map: Record<SubestadoLoteDto, SubestadoLotePrisma> = {
    'En Construccion': 'EN_CONSTRUCCION',
    'No Construido': 'NO_CONSTRUIDO',
    'Construido': 'CONSTRUIDO',
  };
  return map[s];
};

const restrictedLoteFields = ['deuda', 'Venta', 'venta', 'Ventas', 'ventas', 'reserva', 'Reserva', 'reservas', 'Reservas'] as const;

function stripFieldsForTecnico<T>(lote: T): T {
  if (!lote) return lote;
  const sanitized: Record<string, any> = { ...(lote as Record<string, any>) };
  restrictedLoteFields.forEach((field) => {
    if (field in sanitized) {
      delete sanitized[field];
    }
  });
  return sanitized as T;
}

function normalizeSuperficie(payload: any) {
  // Función mantenida por compatibilidad, pero ya no valida frente/fondo
  // La superficie se maneja directamente en el payload
  // Esta función puede eliminarse en el futuro si no se usa en otros lugares
}

// ===================
// Funciones auxiliares para Alquileres y Ocupación
// ===================

// Calcular ocupación de un lote (derivada de alquiler activo)
export type OcupacionLote = 'ALQUILADO' | 'NO_ALQUILADO';

async function calcularOcupacion(loteId: number): Promise<OcupacionLote> {
  const alquilerActivo = await prisma.alquiler.findFirst({
    where: {
      loteId,
      estado: 'ACTIVO',
    },
  });
  return alquilerActivo ? 'ALQUILADO' : 'NO_ALQUILADO';
}

// Obtener alquiler activo de un lote
async function getAlquilerActivo(loteId: number) {
  return prisma.alquiler.findFirst({
    where: {
      loteId,
      estado: 'ACTIVO',
    },
    include: {
      inquilino: {
        select: {
          id: true,
          nombre: true,
          apellido: true,
          razonSocial: true,
          identificadorTipo: true,
          identificadorValor: true,
        },
      },
    },
  });
}

// Crear o mantener alquiler activo
async function crearOMantenerAlquiler(loteId: number, inquilinoId: number): Promise<void> {
  // Validar que la persona esté activa
  const persona = await prisma.persona.findUnique({
    where: { id: inquilinoId },
    select: { estadoOperativo: true },
  });

  if (!persona) {
    const error: any = new Error('Persona no encontrada');
    error.statusCode = 404;
    throw error;
  }

  if (persona.estadoOperativo !== 'OPERATIVO') {
    const error: any = new Error('No se puede asignar un inquilino inactivo');
    error.statusCode = 400;
    throw error;
  }

  // Verificar si ya existe un alquiler activo
  const alquilerExistente = await getAlquilerActivo(loteId);

  if (alquilerExistente) {
    // Si el inquilino es el mismo, no hacer nada
    if (alquilerExistente.inquilinoId === inquilinoId) {
      return;
    }
    // Si es diferente, finalizar el anterior y crear uno nuevo
    await prisma.alquiler.update({
      where: { id: alquilerExistente.id },
      data: {
        estado: 'FINALIZADO',
        fechaFin: new Date(),
      },
    });
  }

  // Crear nuevo alquiler activo
  await prisma.alquiler.create({
    data: {
      loteId,
      inquilinoId,
      estado: 'ACTIVO',
      fechaInicio: new Date(),
    },
  });
}

// Finalizar alquiler activo si existe
async function finalizarAlquilerActivo(loteId: number): Promise<void> {
  const alquilerActivo = await getAlquilerActivo(loteId);
  if (alquilerActivo) {
    await prisma.alquiler.update({
      where: { id: alquilerActivo.id },
      data: {
        estado: 'FINALIZADO',
        fechaFin: new Date(),
      },
    });
  }
}

// Normaliza filtros de query (DTO) a enums Prisma
function buildWhereFromQueryDTO(query: any, role?: string) {
  const where: any = {};

  // Filtrar por estado (excluir ALQUILADO si viene en el filtro, ya que no es un estado válido)
  if (query?.estado) {
    const estado = Array.isArray(query.estado) ? query.estado : [query.estado];
    const estadosFiltrados = estado
      .map((e: string) => estadoLoteToPrisma(e))
      .filter((e: any) => e && e !== 'ALQUILADO'); // Excluir ALQUILADO
    if (estadosFiltrados.length > 0) {
      where.estado = estadosFiltrados.length === 1 ? estadosFiltrados[0] : { in: estadosFiltrados };
    }
  }

  if (query?.subestado)   where.subestado   = subestadoLoteToPrisma(query.subestado);
  if (query?.tipo)        where.tipo        = tipoLoteToPrisma(query.tipo);
  if (query?.propietarioId) where.propietarioId = Number(query.propietarioId) || undefined;
  if (query?.ubicacionId)   where.ubicacionId   = Number(query.ubicacionId) || undefined;

  // El filtro "solo deudores" debe restringir el query a lotes que tengan deuda (deuda === true).
  // El campo en el modelo es `deuda` (Boolean?).
  if (query?.deudor === true || query?.deudor === 'true') {
    where.deuda = true;
  } else if (query?.deudor === false || query?.deudor === 'false') {
    where.deuda = false;
  }

  // Los técnicos ya no se limitan a EN_CONSTRUCCION; visibilidad controlada más abajo.
  return where;
}

// Filtrar por ocupación (aplicado después de obtener los lotes)
function filterByOcupacion(lotes: any[], ocupacion?: 'ALQUILADO' | 'NO_ALQUILADO') {
  if (!ocupacion) return lotes;
  
  return lotes.filter((lote) => {
    const tieneAlquilerActivo = lote.alquilerActivo != null;
    if (ocupacion === 'ALQUILADO') {
      return tieneAlquilerActivo;
    } else {
      return !tieneAlquilerActivo;
    }
  });
}
// ---------------------------------------

export async function getAllLotes(query: any = {}, role?: string) {
  const where = buildWhereFromQueryDTO(query, role);

  const [lotes, total] = await Promise.all([
    prisma.lote.findMany({
      where,
      orderBy: { id: 'asc' },
      include: {
        ubicacion: { select: { calle: true, numero: true} },
        propietario: { select: { id: true, nombre: true, apellido: true, razonSocial: true, identificadorTipo: true, identificadorValor: true } },
        fraccion: { select: { numero: true } },
        inquilino: { select: { id: true, nombre: true, apellido: true, razonSocial: true, identificadorTipo: true, identificadorValor: true } },
        alquileres: {
          where: { estado: 'ACTIVO' },
          include: {
            inquilino: {
              select: {
                id: true,
                nombre: true,
                apellido: true,
                razonSocial: true,
                identificadorTipo: true,
                identificadorValor: true,
              },
            },
          },
          take: 1,
        },
        promociones: {
          where: { activa: true },
          select: {
            id: true,
            precioPromocional: true,
            precioAnterior: true,
            inicio: true,
            fin: true,
            explicacion: true,
          },
          take: 1,
        },
        prioridad: {
          where: { estado: 'ACTIVA' },
          select: {
            id: true,
            inmobiliariaId: true,
            ownerType: true,
            inmobiliaria: {
              select: { id: true, nombre: true }
            }
          },
          take: 1,
        },
      },
    }),
    prisma.lote.count({ where }),
  ]);

  // Enriquecer lotes con alquilerActivo y ocupacion
  const lotesEnriquecidos = lotes.map((lote) => {
    const alquilerActivo = lote.alquileres?.[0] || null;
    const ocupacion: OcupacionLote = alquilerActivo ? 'ALQUILADO' : 'NO_ALQUILADO';
    
    return {
      ...lote,
      alquilerActivo: alquilerActivo ? {
        id: alquilerActivo.id,
        inquilino: alquilerActivo.inquilino,
        fechaInicio: alquilerActivo.fechaInicio,
      } : null,
      ocupacion,
      // Mantener inquilino legacy por compatibilidad (usar alquilerActivo.inquilino si existe)
      inquilino: alquilerActivo?.inquilino || lote.inquilino || null,
      inquilinoId: alquilerActivo?.inquilinoId || lote.inquilinoId || null,
    };
  });

  // Filtrar por ocupación si viene en query
  let lotesFiltrados = lotesEnriquecidos;
  if (query?.ocupacion === 'ALQUILADO' || query?.ocupacion === 'NO_ALQUILADO') {
    lotesFiltrados = filterByOcupacion(lotesEnriquecidos, query.ocupacion);
  }

  const lotesVisibles = role === 'TECNICO'
    ? lotesFiltrados.map((lote) => stripFieldsForTecnico(lote))
    : lotesFiltrados;

  return { lotes: lotesVisibles, total: lotesFiltrados.length };
}



export async function getLoteById(id: number, role?: string) {
  const lote = await prisma.lote.findUnique({
    where: { id: id },
    include: {
      ubicacion: { select: { calle: true, numero: true } },
      propietario: { select: { nombre: true, apellido: true, razonSocial: true, id: true, identificadorTipo: true, identificadorValor: true } },
      fraccion: { select: { numero: true } },
      inquilino: { select: { nombre: true, apellido: true, razonSocial: true, id: true, identificadorTipo: true, identificadorValor: true } },
      alquileres: {
        where: { estado: 'ACTIVO' },
        include: {
          inquilino: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              razonSocial: true,
              identificadorTipo: true,
              identificadorValor: true,
            },
          },
        },
        take: 1,
      },
      promociones: {
        where: { activa: true },
        select: {
          id: true,
          precioPromocional: true,
          precioAnterior: true,
          inicio: true,
          fin: true,
          explicacion: true,
        },
        take: 1,
      },
    },
  });
  if (!lote) {
    const e: any = new Error('Lote no encontrado'); e.statusCode = 404; throw e;
  }

  // Enriquecer con alquilerActivo y ocupacion
  const alquilerActivo = lote.alquileres?.[0] || null;
  const ocupacion: OcupacionLote = alquilerActivo ? 'ALQUILADO' : 'NO_ALQUILADO';
  
  const loteEnriquecido = {
    ...lote,
    alquilerActivo: alquilerActivo ? {
      id: alquilerActivo.id,
      inquilino: alquilerActivo.inquilino,
      fechaInicio: alquilerActivo.fechaInicio,
    } : null,
    ocupacion,
    // Mantener inquilino legacy por compatibilidad
    inquilino: alquilerActivo?.inquilino || lote.inquilino || null,
    inquilinoId: alquilerActivo?.inquilinoId || lote.inquilinoId || null,
  };

  if (role === 'TECNICO') {
    return stripFieldsForTecnico(loteEnriquecido);
  }
  return loteEnriquecido;
}


export async function createLote(data: any): Promise<Lote> {
  // La validación de Zod ya se aseguró de que los campos requeridos existan.
  // Mantenemos la lógica de negocio específica que no cubre Zod.

  // Regla: precio solo si es Lote Venta
  if (data.tipo === 'Lote Venta' && data.precio == null) {
    const error: any = new Error('El precio es obligatorio para "Lote Venta"');
    error.statusCode = 400;
    throw error;
  }
  if (data.tipo === 'Espacio Comun' && data.precio != null) {
    const error: any = new Error('El precio no aplica para "Espacio Comun"');
    error.statusCode = 400;
    throw error;
  }

  normalizeSuperficie(data);

  // Si el cliente no envía mapId, lo generamos automáticamente
  // a partir del número de lote y el número de fracción, por ejemplo: Lote16-3.
  // El número de lote es obligatorio y debe venir en el payload.
  let mapId = data.mapId;
  const numeroLote = data.numero ?? data.numeroLote;
  
  // Validar que el número de lote esté presente
  if (numeroLote == null) {
    const error: any = new Error('El número de lote es obligatorio');
    error.statusCode = 400;
    throw error;
  }
  
  // Obtener el número de fracción desde la base de datos
  const fraccion = await prisma.fraccion.findUnique({
    where: { id: data.fraccionId },
    select: { numero: true },
  });

  if (!fraccion) {
    const error: any = new Error('Fracción no encontrada');
    error.statusCode = 404;
    throw error;
  }

  const fraccionNumero = fraccion.numero;
  
  // Validar que no exista un lote con el mismo número en la misma fracción
  const loteExistente = await prisma.lote.findFirst({
    where: {
      numero: numeroLote,
      fraccionId: data.fraccionId,
    },
    select: { id: true, mapId: true },
  });

  if (loteExistente) {
    const error: any = new Error(`Ya existe un lote con el número ${numeroLote} en la fracción ${fraccionNumero}`);
    error.statusCode = 409; // Conflict
    throw error;
  }
  
  // Generar mapId usando el número de lote (obligatorio) y el número de fracción
  if (!mapId || (typeof mapId === 'string' && mapId.trim() === '')) {
    if (numeroLote != null && fraccionNumero != null) {
      mapId = `Lote${numeroLote}-${fraccionNumero}`;
    }
  }

  // Crear lote. `data` tiene la forma del schema de Zod.
  // Si se proporcionan calle y numeroCalle, crear la ubicación asociada.
  const ubicacionData = (data.calle && data.numeroCalle != null) ? {
    calle: data.calle as any, // El enum NombreCalle se valida en el backend
    numero: Number(data.numeroCalle),
  } : undefined;

  return prisma.lote.create({
    data: {
      // Mapeo de DTO a Prisma
      tipo: tipoLoteToPrisma(data.tipo),
      estado: estadoLoteToPrisma(data.estado),
      subestado: subestadoLoteToPrisma(data.subestado),

      // Campos directos desde el DTO validado por Zod
      descripcion: data.descripcion,
      frente: data.frente,
      fondo: data.fondo,
      superficie: data.superficie,
      precio: data.precio,
      numPartido: data.numPartido,
      alquiler: data.alquiler,
      nombreEspacioComun: data.nombreEspacioComun,
      capacidad: data.capacidad,
      numero: numeroLote,
      mapId: mapId || null,
      // Un lote recién creado arranca sin deuda -> AL_DÍA (deuda = false)
      // Si no se especifica, establecer false por defecto para que muestre "AL DÍA" en lugar de "N/D"
      deuda: data.deuda !== undefined ? data.deuda : false,

      // Relaciones por ID
      fraccion: { connect: { id: data.fraccionId } },
      propietario: { connect: { id: data.propietarioId } },
      // Si se proporciona ubicacionId, conectar ubicación existente
      // Si se proporcionan calle y numeroCalle, crear nueva ubicación
      ...(data.ubicacionId && { ubicacion: { connect: { id: data.ubicacionId } } }),
      ...(ubicacionData && !data.ubicacionId && { ubicacion: { create: ubicacionData } }),
    },
  });
}

export async function updatedLote(id: number, data: any, role?: string): Promise<Lote> {
  let payload = data;
  if (role === 'TECNICO') {
    const allowedFields = ['subestado', 'superficie', 'archivos'];
    const filtered: Record<string, any> = {};
    Object.keys(data || {}).forEach((field) => {
      if (allowedFields.includes(field)) {
        filtered[field] = data[field];
      }
    });

    if (Object.keys(filtered).length === 0) {
      const e: any = new Error('Como TECNICO, solo puedes modificar los campos: subestado, superficie y archivos (planos)');
      e.statusCode = 403;
      throw e;
    }
    payload = filtered;
  }

  normalizeSuperficie(payload);

  // Obtener estado actual del lote para validaciones
  const loteActual = await prisma.lote.findUnique({
    where: { id },
    select: { estado: true },
  });

  if (!loteActual) {
    const error: any = new Error('Lote no encontrado');
    error.statusCode = 404;
    throw error;
  }

  // La autorización para TECNICO ya fue manejada por el middleware y la lógica en getLoteById.
  // Aquí solo transformamos el DTO para la actualización.
  const dataToUpdate: Prisma.LoteUpdateInput = {};
  const { estado, subestado, tipo, propietarioId, inquilinoId, ocupacion, ubicacionId, superficie, calle, numeroCalle, ...rest } = payload;

  // ===================
  // Manejo de OCUPACIÓN (nueva lógica)
  // ===================
  if (ocupacion !== undefined) {
    // Validación: NO_DISPONIBLE no permite ocupación ALQUILADO
    if (ocupacion === 'ALQUILADO' && loteActual.estado === 'NO_DISPONIBLE') {
      const error: any = new Error('No se puede alquilar un lote en estado NO DISPONIBLE');
      error.statusCode = 400;
      throw error;
    }

    // Validación: si ocupacion=ALQUILADO, inquilinoId es requerido
    if (ocupacion === 'ALQUILADO' && (!inquilinoId || inquilinoId <= 0)) {
      const error: any = new Error('Debes seleccionar un inquilino si la ocupación es Alquilado');
      error.statusCode = 400;
      throw error;
    }

    if (ocupacion === 'ALQUILADO') {
      // Validar que la persona inquilino esté activa
      const personaInquilino = await prisma.persona.findUnique({
        where: { id: inquilinoId },
        select: { estadoOperativo: true },
      });

      if (!personaInquilino) {
        const error: any = new Error('Persona inquilino no encontrada');
        error.statusCode = 404;
        throw error;
      }

      if (personaInquilino.estadoOperativo !== 'OPERATIVO') {
        const error: any = new Error('No se puede asignar un inquilino inactivo');
        error.statusCode = 400;
        throw error;
      }

      // Crear o mantener alquiler activo
      await crearOMantenerAlquiler(id, inquilinoId);
    } else if (ocupacion === 'NO_ALQUILADO') {
      // Finalizar alquiler activo si existe
      await finalizarAlquilerActivo(id);
    }
  }
  
  // Procesar estado (NO debe incluir ALQUILADO como estado válido)
  if (estado) {
    const estadoPrisma = estadoLoteToPrisma(estado);
    // Validar que no se intente establecer ALQUILADO como estado (ya no es válido)
    if (estadoPrisma === EstadoLotePrisma.ALQUILADO) {
      const error: any = new Error('ALQUILADO ya no es un estado válido. Usa Ocupación en su lugar');
      error.statusCode = 400;
      throw error;
    }
    dataToUpdate.estado = estadoPrisma;
  }
  
  if (subestado) dataToUpdate.subestado = subestadoLoteToPrisma(subestado);
  if (tipo) dataToUpdate.tipo = tipoLoteToPrisma(tipo);
  if (propietarioId) dataToUpdate.propietario = { connect: { id: propietarioId } };
  
  // Manejar ubicación
  if (calle && numeroCalle !== undefined && numeroCalle !== null && numeroCalle > 0) {
    // Solo procesar si tenemos AMBOS: calle Y número válido
    const loteActual = await prisma.lote.findUnique({
      where: { id },
      include: { ubicacion: true },
    });

    if (loteActual?.ubicacion?.id) {
      // Actualizar ubicación existente
      await prisma.ubicacion.update({
        where: { id: loteActual.ubicacion.id },
        data: {
          calle: calle as any,
          numero: numeroCalle,
        },
      });
    } else {
      // Crear nueva ubicación conectada directamente al lote
      // Usamos nested create dentro del update del lote
      dataToUpdate.ubicacion = {
        create: {
          calle: calle as any,
          numero: numeroCalle,
        },
      };
    }
  } else if (ubicacionId) {
    // Si solo se proporciona ubicacionId (sin calle/numero), conectar ubicación existente
    dataToUpdate.ubicacion = { connect: { id: ubicacionId } };
  }
  
  // Superficie: si se envía explícitamente, usarla
  if (superficie !== undefined) {
    dataToUpdate.superficie = superficie;
  }

  // Asignar el resto de los campos (excluyendo calle, numeroCalle, inquilinoId y ocupacion que ya se procesaron)
  // Excluir también campos que no deben actualizarse directamente
  const { calle: _, numeroCalle: __, inquilinoId: ___, ocupacion: ____, ...restFields } = rest;
  Object.assign(dataToUpdate, restFields);

  // Detectar transición a NO_DISPONIBLE y cancelar operaciones activas (efecto centralizado)
  if (estado && estadoLoteToPrisma(estado) === EstadoLotePrisma.NO_DISPONIBLE) {
    const loteActual = await prisma.lote.findUnique({
      where: { id },
      select: { estado: true },
    });

    // Solo cancelar si el lote no estaba ya en NO_DISPONIBLE
    if (loteActual && loteActual.estado !== EstadoLotePrisma.NO_DISPONIBLE) {
      await cancelActivesOnNoDisponible(id);
    }
  }

  try {
    const updated = await prisma.lote.update({
      where: { id },
      data: dataToUpdate,
      include: {
        ubicacion: { select: { calle: true, numero: true } },
        propietario: { select: { id: true, nombre: true, apellido: true, razonSocial: true, identificadorTipo: true, identificadorValor: true } },
        fraccion: { select: { numero: true } },
        inquilino: { select: { id: true, nombre: true, apellido: true, razonSocial: true, identificadorTipo: true, identificadorValor: true } },
        promociones: {
          where: { activa: true },
          select: {
            id: true,
            precioPromocional: true,
            precioAnterior: true,
            inicio: true,
            fin: true,
            explicacion: true,
          },
          take: 1,
        },
      },
    });
    return updated;
  } catch (e: any) {
    if (e.code === 'P2025') { // Código de error de Prisma para "registro no encontrado"
      const error = new Error('Lote no encontrado');
      (error as any).statusCode = 404;
      throw error;
    }
    // Log temporal para debugging
    console.error('[updatedLote] Error updating lote:', {
      loteId: id,
      error: e,
      errorCode: e.code,
      errorMessage: e.message,
      dataToUpdate: JSON.stringify(dataToUpdate, null, 2),
    });
    throw e; // Re-lanzar otros errores
  }
}

export async function deleteLote(id: number, role?: string): Promise<DeleteLoteResponse> {
  if (role === 'TECNICO') {
    const e: any = new Error('Los técnicos no están autorizados para eliminar lotes');
    e.statusCode = 403;
    throw e;
  }
  
  // 1) Borrar archivos asociados a este lote antes de eliminar el lote
  // Esto evita el error de foreign key constraint "Archivos_idLoteAsociado_fkey"
  await prisma.archivos.deleteMany({
    where: {
      idLoteAsociado: id,
    },
  });

  // 2) Borrar reservas asociadas a este lote antes de eliminar el lote
  // Esto evita el error de foreign key constraint "Reserva_loteId_fkey"
  await prisma.reserva.deleteMany({
    where: {
      loteId: id,
    },
  });

  // 3) Borrar ventas asociadas a este lote antes de eliminar el lote
  // Esto evita el error de foreign key constraint "Venta_loteId_fkey"
  await prisma.venta.deleteMany({
    where: {
      loteId: id,
    },
  });

  // 4) Recién después borrar el lote
  await prisma.lote.delete({ where: { id: id } });
  return { message: 'Lote eliminado correctamente' };
}

export async function updateLoteState(id: number, newState: EstadoLoteDto): Promise<Lote> {
  return prisma.lote.update({
    where: { id },
    data: { estado: estadoLoteToPrisma(newState) },
  });
}


