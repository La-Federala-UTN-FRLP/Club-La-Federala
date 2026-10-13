// src/services/prioridad.service.ts
import prisma from '../config/prisma';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { EstadoLote, EstadoPrioridad, OwnerPrioridad } from '../generated/prisma';
import { assertLoteOperableFor, assertPrioridadUnicaActiva, computeRestoreStateFromPrioridad } from '../domain/loteState/loteState.rules';

// Mapper de errores de Prisma a errores HTTP
function mapPrismaError(e: unknown) {
  if (e instanceof PrismaClientKnownRequestError) {
    if (e.code === 'P2002') {
      // Verificar si es un error de unicidad de numero
      if (e.meta?.target && Array.isArray(e.meta.target) && e.meta.target.includes('numero')) {
        const err: any = new Error('Ya existe una prioridad con este número');
        err.status = 409;
        return err;
      }
      const err: any = new Error('Error de unicidad en la base de datos');
      err.status = 409;
      return err;
    }
    if (e.code === 'P2003') { // FK inválida
      const err: any = new Error('Alguna referencia (lote/inmobiliaria) no existe');
      err.status = 409; return err;
    }
    if (e.code === 'P2025') { // not found
      const err: any = new Error('La prioridad no existe');
      err.status = 404; return err;
    }
  }
  return e;
}

// ==============================
// Crear prioridad
// ==============================
export async function createPrioridad(
  body: {
    numero: string;
    loteId: number;
    fechaInicio: string; // ISO string
    fechaFin: string; // ISO string
    ownerType?: 'INMOBILIARIA' | 'CCLF';
    inmobiliariaId?: number | null;
  },
  user?: { role: string; inmobiliariaId?: number | null }
): Promise<any> {
  // Validar que el lote exista
  const lote = await prisma.lote.findUnique({ where: { id: body.loteId } });
  if (!lote) {
    const err: any = new Error('Lote no encontrado');
    err.status = 404;
    throw err;
  }

  // Validar que el lote esté operativo (bloquea NO_DISPONIBLE)
  assertLoteOperableFor('crear prioridad', lote.estado);

  // Validar que el lote esté DISPONIBLE o EN_PROMOCION
  if (lote.estado !== EstadoLote.DISPONIBLE && lote.estado !== EstadoLote.EN_PROMOCION) {
    const err: any = new Error('Solo se puede crear una prioridad para lotes DISPONIBLE o EN_PROMOCION');
    err.status = 409;
    throw err;
  }

  // Validar unicidad de numero
  const prioridadExistente = await prisma.prioridad.findUnique({
    where: { numero: body.numero.trim() },
  });
  if (prioridadExistente) {
    const err: any = new Error('Ya existe una prioridad con este número');
    err.status = 409;
    throw err;
  }

  // Validar unicidad: solo puede haber 1 prioridad ACTIVA por lote
  await assertPrioridadUnicaActiva(body.loteId);

  // Validar fechas: fechaFin debe ser posterior a fechaInicio
  const fechaInicioDate = new Date(body.fechaInicio);
  const fechaFinDate = new Date(body.fechaFin);
  if (fechaFinDate <= fechaInicioDate) {
    const err: any = new Error('La fecha de fin debe ser posterior a la fecha de inicio');
    err.status = 400;
    throw err;
  }

  // Validar fechas: fechaFin debe ser posterior a ahora (para crear prioridad ACTIVA)
  const now = new Date();
  if (fechaFinDate <= now) {
    const err: any = new Error('La fecha de fin debe ser posterior a la fecha actual');
    err.status = 400;
    throw err;
  }

  // Definir ownerType según el rol del usuario
  let ownerType: OwnerPrioridad;
  let inmobiliariaIdFinal: number | null = null;

  if (user?.role === 'INMOBILIARIA') {
    if (!user.inmobiliariaId) {
      const err: any = new Error('El usuario INMOBILIARIA no tiene una inmobiliaria asociada.');
      err.status = 400;
      throw err;
    }
    
    // Validar límite de prioridades activas para INMOBILIARIA
    const inm = await prisma.inmobiliaria.findUnique({
      where: { id: user.inmobiliariaId },
      select: { maxPrioridadesActivas: true },
    });
    const limite = inm?.maxPrioridadesActivas ?? 5;
    
    const activas = await prisma.prioridad.count({
      where: { inmobiliariaId: user.inmobiliariaId, estado: EstadoPrioridad.ACTIVA },
    });
    
    if (activas >= limite) {
      const err: any = new Error(`La inmobiliaria alcanzó el límite de prioridades activas (${limite}).`);
      err.status = 409;
      throw err;
    }
    
    ownerType = OwnerPrioridad.INMOBILIARIA;
    inmobiliariaIdFinal = user.inmobiliariaId;
  } else if (user?.role === 'ADMINISTRADOR' || user?.role === 'GESTOR') {
    // ADMIN/GESTOR pueden setear ownerType e inmobiliariaId desde el body
    if (body.ownerType) {
      ownerType = body.ownerType as OwnerPrioridad;
      inmobiliariaIdFinal = body.ownerType === OwnerPrioridad.INMOBILIARIA 
        ? (body.inmobiliariaId ?? null)
        : null;
    } else {
      // Default: CCLF si no viene
      ownerType = OwnerPrioridad.CCLF;
      inmobiliariaIdFinal = null;
    }
  } else {
    const err: any = new Error('No tienes permisos para crear prioridades');
    err.status = 403;
    throw err;
  }

  // Ejecutar en transacción: crear prioridad + actualizar lote
  try {
    const resultado = await prisma.$transaction(async (tx) => {
      // Crear prioridad
      const prioridad = await tx.prioridad.create({
        data: {
          numero: body.numero.trim(), // Persistir numero tal como viene (trim)
          loteId: body.loteId,
          estado: EstadoPrioridad.ACTIVA,
          ownerType: ownerType,
          inmobiliariaId: inmobiliariaIdFinal,
          fechaInicio: new Date(body.fechaInicio), // Persistir fechaInicio desde body
          fechaFin: new Date(body.fechaFin),
          loteEstadoAlCrear: lote.estado, // Guardamos el estado original del lote
        },
      });

      // Cambiar lote a CON_PRIORIDAD
      await tx.lote.update({
        where: { id: body.loteId },
        data: { estado: EstadoLote.CON_PRIORIDAD },
      });

      return prioridad;
    });

    return resultado;
  } catch (e) {
    throw mapPrismaError(e);
  }
}

// Filtros aceptados por el listado (el controller arma este objeto desde la query)
export type PrioridadesListQuery = {
  estado?: string;
  estadoOperativo?: string;
  ownerType?: string;
  inmobiliariaId?: number;
  loteId?: number;
  fechaInicioDesde?: string;
  fechaInicioHasta?: string;
  fechaFinDesde?: string;
  fechaFinHasta?: string;
};

// ==============================
// Obtener todas las prioridades
// ==============================
export async function getAllPrioridades(
  query: PrioridadesListQuery,
  user?: { role: string; inmobiliariaId?: number | null }
): Promise<{ prioridades: any[]; total: number }> {
  // Construir where clause
  const where: any = {};

  // Si el usuario es INMOBILIARIA, solo mostrar sus prioridades (ignorar inmobiliariaId del query)
  if (user?.role === 'INMOBILIARIA' && user?.inmobiliariaId != null) {
    where.inmobiliariaId = user.inmobiliariaId;
  } else {
    // Admin/Gestor pueden filtrar por inmobiliariaId si viene en query
    if (query.inmobiliariaId) {
      where.inmobiliariaId = query.inmobiliariaId;
    }
  }

  // Filtro estadoOperativo: default OPERATIVO si no viene
  if (query.estadoOperativo) {
    where.estadoOperativo = query.estadoOperativo;
  } else {
    where.estadoOperativo = 'OPERATIVO'; // Default: solo operativas
  }

  // Filtros opcionales
  if (query.estado) {
    where.estado = query.estado;
  }

  if (query.ownerType) {
    where.ownerType = query.ownerType;
  }

  if (query.loteId) {
    where.loteId = query.loteId;
  }

  // Filtros de fechas
  if (query.fechaInicioDesde || query.fechaInicioHasta) {
    where.fechaInicio = {};
    if (query.fechaInicioDesde) {
      where.fechaInicio.gte = new Date(query.fechaInicioDesde);
    }
    if (query.fechaInicioHasta) {
      where.fechaInicio.lte = new Date(query.fechaInicioHasta);
    }
  }

  if (query.fechaFinDesde || query.fechaFinHasta) {
    where.fechaFin = {};
    if (query.fechaFinDesde) {
      where.fechaFin.gte = new Date(query.fechaFinDesde);
    }
    if (query.fechaFinHasta) {
      where.fechaFin.lte = new Date(query.fechaFinHasta);
    }
  }

  const prioridades = await prisma.prioridad.findMany({
    where,
    orderBy: { fechaInicio: 'desc' },
    include: {
      lote: {
        select: { 
          id: true, 
          numero: true, 
          mapId: true, 
          estado: true,
          fraccion: {
            select: { numero: true }
          }
        },
      },
      inmobiliaria: {
        select: { id: true, nombre: true },
      },
    },
  });

  return { prioridades, total: prioridades.length };
}

// ==============================
// Eliminar prioridad (soft delete)
// ==============================
export async function eliminarPrioridad(
  id: number,
  user?: { role: string; inmobiliariaId?: number | null }
): Promise<any> {
  try {
    // Obtener la prioridad existente
    const prioridad = await prisma.prioridad.findUnique({
      where: { id },
      include: {
        lote: {
          select: { 
            id: true, 
            numero: true, 
            mapId: true, 
            estado: true,
            fraccion: {
              select: { numero: true }
            }
          },
        },
        inmobiliaria: {
          select: { id: true, nombre: true },
        },
      },
    });

    if (!prioridad) {
      const err: any = new Error('Prioridad no encontrada');
      err.statusCode = 404;
      throw err;
    }

    // Validar permisos: INMOBILIARIA solo puede eliminar sus propias prioridades
    if (user?.role === 'INMOBILIARIA' && user?.inmobiliariaId != null) {
      if (prioridad.inmobiliariaId !== user.inmobiliariaId || prioridad.ownerType !== 'INMOBILIARIA') {
        const err: any = new Error('No tienes permiso para eliminar esta prioridad');
        err.statusCode = 403;
        throw err;
      }
    }

    // Validar que no esté ya eliminada
    if (prioridad.estadoOperativo === 'ELIMINADO') {
      const err: any = new Error('La prioridad ya está eliminada.');
      err.statusCode = 409;
      throw err;
    }

    // Validar que no esté ACTIVA
    if (prioridad.estado === 'ACTIVA') {
      const err: any = new Error('No se puede eliminar una prioridad activa. Primero cancelarla o finalizarla.');
      err.statusCode = 409;
      throw err;
    }

    // Actualizar estadoOperativo a ELIMINADO
    const updated = await prisma.prioridad.update({
      where: { id },
      data: {
        estadoOperativo: 'ELIMINADO',
      },
      include: {
        lote: {
          select: { 
            id: true, 
            numero: true, 
            mapId: true, 
            estado: true,
            fraccion: {
              select: { numero: true }
            }
          },
        },
        inmobiliaria: {
          select: { id: true, nombre: true },
        },
      },
    });

    return updated;
  } catch (e: any) {
    if (e.statusCode) {
      throw e;
    }
    throw mapPrismaError(e);
  }
}

// ==============================
// Reactivar prioridad
// ==============================
export async function reactivarPrioridad(
  id: number,
  user?: { role: string; inmobiliariaId?: number | null }
): Promise<any> {
  try {
    // Obtener la prioridad existente
    const prioridad = await prisma.prioridad.findUnique({
      where: { id },
      include: {
        lote: {
          select: { 
            id: true, 
            numero: true, 
            mapId: true, 
            estado: true,
            fraccion: {
              select: { numero: true }
            }
          },
        },
        inmobiliaria: {
          select: { id: true, nombre: true },
        },
      },
    });

    if (!prioridad) {
      const err: any = new Error('Prioridad no encontrada');
      err.statusCode = 404;
      throw err;
    }

    // Validar permisos: INMOBILIARIA solo puede reactivar sus propias prioridades
    if (user?.role === 'INMOBILIARIA' && user?.inmobiliariaId != null) {
      if (prioridad.inmobiliariaId !== user.inmobiliariaId || prioridad.ownerType !== 'INMOBILIARIA') {
        const err: any = new Error('No tienes permiso para reactivar esta prioridad');
        err.statusCode = 403;
        throw err;
      }
    }

    // Validar que no esté ya operativa
    if (prioridad.estadoOperativo === 'OPERATIVO') {
      const err: any = new Error('La prioridad ya está operativa.');
      err.statusCode = 409;
      throw err;
    }

    // Actualizar estadoOperativo a OPERATIVO
    const updated = await prisma.prioridad.update({
      where: { id },
      data: {
        estadoOperativo: 'OPERATIVO',
      },
      include: {
        lote: {
          select: { 
            id: true, 
            numero: true, 
            mapId: true, 
            estado: true,
            fraccion: {
              select: { numero: true }
            }
          },
        },
        inmobiliaria: {
          select: { id: true, nombre: true },
        },
      },
    });

    return updated;
  } catch (e: any) {
    if (e.statusCode) {
      throw e;
    }
    throw mapPrismaError(e);
  }
}

// ==============================
// Obtener prioridad por ID
// ==============================
export async function getPrioridadById(
  id: number,
  user?: { role: string; inmobiliariaId?: number | null }
): Promise<any> {
  const prioridad = await prisma.prioridad.findUnique({
    where: { id },
    include: {
      lote: {
        select: { id: true, numero: true, mapId: true, estado: true, fraccion: { select: { numero: true } } },
      },
      inmobiliaria: {
        select: { id: true, nombre: true },
      },
    },
  });

  if (!prioridad) {
    const err: any = new Error('Prioridad no encontrada');
    err.status = 404;
    throw err;
  }

  // Validar permisos: INMOBILIARIA solo puede ver sus propias prioridades
  if (user?.role === 'INMOBILIARIA') {
    if (!user.inmobiliariaId) {
      const err: any = new Error('El usuario INMOBILIARIA no tiene una inmobiliaria asociada');
      err.status = 400;
      throw err;
    }
    if (prioridad.ownerType !== OwnerPrioridad.INMOBILIARIA || prioridad.inmobiliariaId !== user.inmobiliariaId) {
      const err: any = new Error('No puedes ver esta prioridad');
      err.status = 403;
      throw err;
    }
  } else if (user?.role !== 'ADMINISTRADOR' && user?.role !== 'GESTOR') {
    const err: any = new Error('No tienes permisos para ver esta prioridad');
    err.status = 403;
    throw err;
  }

  return prioridad;
}

// ==============================
// Cancelar prioridad
// ==============================
export async function cancelPrioridad(
  id: number,
  user?: { role: string; inmobiliariaId?: number | null }
): Promise<any> {
  const prioridad = await prisma.prioridad.findUnique({
    where: { id },
    select: { id: true, estado: true, loteId: true, loteEstadoAlCrear: true, ownerType: true, inmobiliariaId: true },
  });

  if (!prioridad) {
    const err: any = new Error('Prioridad no encontrada');
    err.status = 404;
    throw err;
  }

  // Validar que la prioridad esté ACTIVA
  if (prioridad.estado !== EstadoPrioridad.ACTIVA) {
    const err: any = new Error('Solo se pueden cancelar prioridades ACTIVA');
    err.status = 400;
    throw err;
  }

  // Validar permisos: INMOBILIARIA solo puede cancelar sus propias prioridades
  if (user?.role === 'INMOBILIARIA') {
    if (!user.inmobiliariaId) {
      const err: any = new Error('El usuario INMOBILIARIA no tiene una inmobiliaria asociada');
      err.status = 400;
      throw err;
    }
    if (prioridad.ownerType !== OwnerPrioridad.INMOBILIARIA || prioridad.inmobiliariaId !== user.inmobiliariaId) {
      const err: any = new Error('No puedes cancelar esta prioridad');
      err.status = 403;
      throw err;
    }
  } else if (user?.role !== 'ADMINISTRADOR' && user?.role !== 'GESTOR') {
    const err: any = new Error('No tienes permisos para cancelar prioridades');
    err.status = 403;
    throw err;
  }

  // Ejecutar en transacción: cancelar prioridad + restaurar lote si aplica
  const resultado = await prisma.$transaction(async (tx) => {
    // Marcar como CANCELADA
    const updated = await tx.prioridad.update({
      where: { id },
      data: { estado: EstadoPrioridad.CANCELADA },
    });

    // Restaurar el estado original del lote solo si está actualmente CON_PRIORIDAD (regla segura)
    const loteActual = await tx.lote.findUnique({
      where: { id: prioridad.loteId },
      select: { estado: true },
    });

    if (loteActual && loteActual.estado === EstadoLote.CON_PRIORIDAD) {
      const estadoARestaurar = computeRestoreStateFromPrioridad(prioridad.loteEstadoAlCrear);
      // Convertir EstadoLoteOp a EstadoLote de Prisma
      const estadoPrisma = estadoARestaurar === 'En Promoción' ? EstadoLote.EN_PROMOCION : EstadoLote.DISPONIBLE;
      await tx.lote.update({
        where: { id: prioridad.loteId },
        data: { estado: estadoPrisma },
      });
    }

    return updated;
  });

  return resultado;
}

// ==============================
// Finalizar prioridad
// ==============================
export async function finalizePrioridad(
  id: number,
  user?: { role: string; inmobiliariaId?: number | null }
): Promise<any> {
  const prioridad = await prisma.prioridad.findUnique({
    where: { id },
    select: { id: true, estado: true, loteId: true, loteEstadoAlCrear: true, ownerType: true, inmobiliariaId: true },
  });

  if (!prioridad) {
    const err: any = new Error('Prioridad no encontrada');
    err.status = 404;
    throw err;
  }

  // Validar que la prioridad esté ACTIVA
  if (prioridad.estado !== EstadoPrioridad.ACTIVA) {
    const err: any = new Error('Solo se pueden finalizar prioridades ACTIVA');
    err.status = 400;
    throw err;
  }

  // Validar permisos: INMOBILIARIA solo puede finalizar sus propias prioridades
  if (user?.role === 'INMOBILIARIA') {
    if (!user.inmobiliariaId) {
      const err: any = new Error('El usuario INMOBILIARIA no tiene una inmobiliaria asociada');
      err.status = 400;
      throw err;
    }
    if (prioridad.ownerType !== OwnerPrioridad.INMOBILIARIA || prioridad.inmobiliariaId !== user.inmobiliariaId) {
      const err: any = new Error('No puedes finalizar esta prioridad');
      err.status = 403;
      throw err;
    }
  } else if (user?.role !== 'ADMINISTRADOR' && user?.role !== 'GESTOR') {
    const err: any = new Error('No tienes permisos para finalizar prioridades');
    err.status = 403;
    throw err;
  }

  // Ejecutar en transacción: finalizar prioridad + restaurar lote si aplica
  const resultado = await prisma.$transaction(async (tx) => {
    // Marcar como FINALIZADA
    const updated = await tx.prioridad.update({
      where: { id },
      data: { estado: EstadoPrioridad.FINALIZADA },
    });

    // Restaurar el estado original del lote solo si está actualmente CON_PRIORIDAD (regla segura)
    const loteActual = await tx.lote.findUnique({
      where: { id: prioridad.loteId },
      select: { estado: true },
    });

    if (loteActual && loteActual.estado === EstadoLote.CON_PRIORIDAD) {
      const estadoARestaurar = computeRestoreStateFromPrioridad(prioridad.loteEstadoAlCrear);
      // Convertir EstadoLoteOp a EstadoLote de Prisma
      const estadoPrisma = estadoARestaurar === 'En Promoción' ? EstadoLote.EN_PROMOCION : EstadoLote.DISPONIBLE;
      await tx.lote.update({
        where: { id: prioridad.loteId },
        data: { estado: estadoPrisma },
      });
    }

    return updated;
  });

  return resultado;
}

// ==============================
// Expirar prioridades vencidas (manual)
// ==============================
export async function expirePrioridadesManual(): Promise<{ expired: number }> {
  const now = new Date();

  // Buscar prioridades ACTIVA vencidas (necesitamos loteId y loteEstadoAlCrear para restaurar)
  const prioridadesVencidas = await prisma.prioridad.findMany({
    where: {
      estado: EstadoPrioridad.ACTIVA,
      fechaFin: {
        lt: now, // fechaFin < now
      },
    },
    select: { id: true, loteId: true, loteEstadoAlCrear: true },
  });

  if (prioridadesVencidas.length === 0) {
    return { expired: 0 };
  }

  // Marcar todas como EXPIRADA
  await prisma.prioridad.updateMany({
    where: {
      id: { in: prioridadesVencidas.map((p) => p.id) },
    },
    data: {
      estado: EstadoPrioridad.EXPIRADA,
    },
  });

  // Restaurar el estado original de cada lote solo si está actualmente CON_PRIORIDAD (regla segura)
  for (const prioridad of prioridadesVencidas) {
    const loteActual = await prisma.lote.findUnique({
      where: { id: prioridad.loteId },
      select: { estado: true },
    });

    if (loteActual && loteActual.estado === EstadoLote.CON_PRIORIDAD) {
      const estadoARestaurar = computeRestoreStateFromPrioridad(prioridad.loteEstadoAlCrear);
      // Convertir EstadoLoteOp a EstadoLote de Prisma
      const estadoPrisma = estadoARestaurar === 'En Promoción' ? EstadoLote.EN_PROMOCION : EstadoLote.DISPONIBLE;
      await prisma.lote.update({
        where: { id: prioridad.loteId },
        data: { estado: estadoPrisma },
      });
    }
  }

  return { expired: prioridadesVencidas.length };
}

// ==============================
// Actualizar prioridad
// ==============================
export async function updatePrioridad(
  id: number,
  body: Partial<{
    numero: string;
    inmobiliariaId: number | null;
    fechaFin: string; // ISO string
  }>,
  user?: { role: string; inmobiliariaId?: number | null }
): Promise<any> {
  // Obtener prioridad actual
  const prioridadActual = await prisma.prioridad.findUnique({
    where: { id },
    select: { id: true, numero: true, estado: true, ownerType: true, inmobiliariaId: true, fechaInicio: true, fechaFin: true },
  });

  if (!prioridadActual) {
    const err: any = new Error('Prioridad no encontrada');
    err.status = 404;
    throw err;
  }

  // Validar permisos: INMOBILIARIA solo puede editar sus propias prioridades
  if (user?.role === 'INMOBILIARIA') {
    if (!user.inmobiliariaId) {
      const err: any = new Error('El usuario INMOBILIARIA no tiene una inmobiliaria asociada');
      err.status = 400;
      throw err;
    }
    if (prioridadActual.ownerType !== OwnerPrioridad.INMOBILIARIA || prioridadActual.inmobiliariaId !== user.inmobiliariaId) {
      const err: any = new Error('No puedes editar esta prioridad');
      err.status = 403;
      throw err;
    }

    // INMOBILIARIA solo puede cambiar numero, no inmobiliariaId
    if (body.inmobiliariaId !== undefined) {
      const err: any = new Error('No puedes cambiar la inmobiliaria de esta prioridad');
      err.status = 403;
      throw err;
    }
  } else if (user?.role !== 'ADMINISTRADOR' && user?.role !== 'GESTOR') {
    const err: any = new Error('No tienes permisos para editar prioridades');
    err.status = 403;
    throw err;
  }

  // Validar unicidad de numero si cambia
  if (body.numero !== undefined && body.numero.trim() !== prioridadActual.numero) {
    const numeroTrim = body.numero.trim();
    const prioridadExistente = await prisma.prioridad.findUnique({
      where: { numero: numeroTrim },
    });
    if (prioridadExistente && prioridadExistente.id !== id) {
      const err: any = new Error('Ya existe una prioridad con este número');
      err.status = 409;
      throw err;
    }
  }

  // Validar fechaFin: debe ser > fechaInicio y > now()
  if (body.fechaFin !== undefined) {
    const fechaFinDate = new Date(body.fechaFin);
    const fechaInicioDate = new Date(prioridadActual.fechaInicio);
    const now = new Date();

    if (fechaFinDate <= fechaInicioDate) {
      const err: any = new Error('La fecha de fin debe ser posterior a la fecha de inicio');
      err.status = 400;
      throw err;
    }

    if (fechaFinDate <= now) {
      const err: any = new Error('La fecha de fin debe ser posterior a la fecha actual');
      err.status = 400;
      throw err;
    }
  }

  // Validar cupo si se está cambiando a una inmobiliaria diferente (solo para Admin/Gestor)
  if (body.inmobiliariaId !== undefined && 
      (user?.role === 'ADMINISTRADOR' || user?.role === 'GESTOR') &&
      body.inmobiliariaId !== prioridadActual.inmobiliariaId) {
    
    // Si se está asignando a una inmobiliaria (no a La Federala que es null)
    if (body.inmobiliariaId !== null) {
      const inmobDestino = await prisma.inmobiliaria.findUnique({
        where: { id: body.inmobiliariaId },
        select: { maxPrioridadesActivas: true },
      });

      if (!inmobDestino) {
        const err: any = new Error('La inmobiliaria destino no existe');
        err.status = 404;
        throw err;
      }

      const limite = inmobDestino.maxPrioridadesActivas ?? 5;
      
      // Contar prioridades activas de la inmobiliaria destino (excluyendo la prioridad actual)
      const activas = await prisma.prioridad.count({
        where: { 
          inmobiliariaId: body.inmobiliariaId, 
          estado: EstadoPrioridad.ACTIVA,
          id: { not: id } // Excluir la prioridad actual del conteo
        },
      });
      
      if (activas >= limite) {
        const err: any = new Error(`La inmobiliaria alcanzó el límite de prioridades activas (${activas}/${limite})`);
        err.status = 409;
        throw err;
      }
    }
  }

  // Construir objeto de actualización
  const updateData: any = {};
  if (body.numero !== undefined) {
    updateData.numero = body.numero.trim();
  }
  if (body.inmobiliariaId !== undefined && (user?.role === 'ADMINISTRADOR' || user?.role === 'GESTOR')) {
    updateData.inmobiliariaId = body.inmobiliariaId;
    // Si inmobiliariaId es null, ownerType debe ser CCLF, si no, INMOBILIARIA
    if (body.inmobiliariaId === null) {
      updateData.ownerType = OwnerPrioridad.CCLF;
    } else {
      updateData.ownerType = OwnerPrioridad.INMOBILIARIA;
    }
  }
  if (body.fechaFin !== undefined && (user?.role === 'ADMINISTRADOR' || user?.role === 'GESTOR')) {
    updateData.fechaFin = new Date(body.fechaFin);
  }

  // Si no hay cambios, retornar la prioridad actual
  if (Object.keys(updateData).length === 0) {
    return await getPrioridadById(id, user);
  }

  // Actualizar
  try {
    const updated = await prisma.prioridad.update({
      where: { id },
      data: updateData,
      include: {
        lote: {
          select: { id: true, numero: true, mapId: true, estado: true, fraccion: { select: { numero: true } } },
        },
        inmobiliaria: {
          select: { id: true, nombre: true },
        },
      },
    });

    return updated;
  } catch (e) {
    throw mapPrismaError(e);
  }
}
