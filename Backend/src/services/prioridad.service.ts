// src/services/prioridad.service.ts
import prisma from '../config/prisma';
import { EstadoLote, EstadoPrioridad, OwnerPrioridad, Prisma } from '../generated/prisma';
import { assertLoteOperableFor, assertPrioridadUnicaActiva, computeRestoreStateFromPrioridad } from '../domain/loteState/loteState.rules';
import { assertInmobiliariaAsignable, assertInmobiliariaOperativa } from '../utils/inmobiliaria.utils';
import { safeErrorForLog } from '../utils/safeErrorLog';

// Índice único parcial (migración 20261113120000_prioridad_una_activa_por_lote): como máximo una
// prioridad ACTIVA por lote. Prisma 6 no expresa índices parciales en el schema.
export const INDICE_UNA_ACTIVA_POR_LOTE = 'Prioridad_loteId_activa_key';
export const MENSAJE_PRIORIDAD_ACTIVA_EXISTENTE = 'Ya existe una prioridad ACTIVA para este lote';

function esViolacionUnaActivaPorLote(e: Prisma.PrismaClientKnownRequestError): boolean {
  const target = e.meta?.target;
  const campos = Array.isArray(target) ? target : typeof target === 'string' ? [target] : [];
  return campos.some((t) => t === INDICE_UNA_ACTIVA_POR_LOTE || t === 'loteId');
}

// Mapper de errores de Prisma a errores HTTP
function mapPrismaError(e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2002' && esViolacionUnaActivaPorLote(e)) {
      // Dos altas concurrentes para el mismo lote: la base deja pasar una sola.
      const err: any = new Error(MENSAJE_PRIORIDAD_ACTIVA_EXISTENTE);
      err.status = 409;
      return err;
    }
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

/**
 * Fin del ciclo de una prioridad (cancelar, finalizar, expirar): devuelve el lote al estado que tenía
 * al crearse la prioridad (EN_PROMOCION si venía de promoción; si no, DISPONIBLE), solo si sigue
 * CON_PRIORIDAD (regla segura: no pisa una reserva/venta posterior). Corre dentro de la transacción
 * de la operación que termina la prioridad, después de haberla sacado de ACTIVA.
 *
 * Es un único UPDATE condicionado (sin leer antes): no hay ventana entre lectura y escritura.
 * No puede pisar una prioridad nueva del mismo lote: el índice único parcial impide insertar otra
 * ACTIVA mientras esta transacción no confirme el cierre, y el alta solo marca el lote CON_PRIORIDAD
 * después de insertar su prioridad. Orden de locks en ambos caminos: prioridad → lote.
 */
async function restaurarLoteTrasPrioridad(
  tx: Prisma.TransactionClient,
  loteId: number,
  loteEstadoAlCrear: EstadoLote,
): Promise<void> {
  const estadoARestaurar = computeRestoreStateFromPrioridad(loteEstadoAlCrear);
  // Convertir EstadoLoteOp a EstadoLote de Prisma
  const estadoPrisma = estadoARestaurar === 'En Promoción' ? EstadoLote.EN_PROMOCION : EstadoLote.DISPONIBLE;
  await tx.lote.updateMany({
    where: { id: loteId, estado: EstadoLote.CON_PRIORIDAD },
    data: { estado: estadoPrisma },
  });
}

/**
 * Cierra una prioridad ACTIVA (cancelar o finalizar) de forma atómica: el update se condiciona a que
 * siga ACTIVA en el momento de escribir. Si otra transición ganó la carrera (el job la expiró, u otro
 * request la canceló o finalizó), no se pisa ese estado ni se vuelve a tocar el lote: responde el
 * mismo 400 que la validación previa ("Solo se pueden … prioridades ACTIVA").
 */
async function cerrarPrioridadActiva(
  prioridad: { id: number; loteId: number; loteEstadoAlCrear: EstadoLote },
  estadoFinal: typeof EstadoPrioridad.CANCELADA | typeof EstadoPrioridad.FINALIZADA,
  mensajeNoActiva: string,
) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.prioridad.updateMany({
      where: { id: prioridad.id, estado: EstadoPrioridad.ACTIVA },
      data: { estado: estadoFinal },
    });
    if (count === 0) {
      const err: any = new Error(mensajeNoActiva);
      err.status = 400;
      throw err;
    }

    // Restaurar el estado original del lote solo si está actualmente CON_PRIORIDAD (regla segura)
    await restaurarLoteTrasPrioridad(tx, prioridad.loteId, prioridad.loteEstadoAlCrear);

    return tx.prioridad.findUnique({ where: { id: prioridad.id } });
  });
}

type PrioridadActor = { role: string; inmobiliariaId?: number | null };

// Tenant del actor para las operaciones de Prioridades.
// INMOBILIARIA sin inmobiliariaId no tiene tenant: 403, nunca el camino de ADMINISTRADOR/GESTOR.
// Devuelve el tenant si el actor es INMOBILIARIA; undefined para el resto de los roles.
function requireTenantSiInmobiliaria(user?: PrioridadActor): number | undefined {
  if (user?.role !== 'INMOBILIARIA') {
    return undefined;
  }
  if (user.inmobiliariaId == null) {
    const err: any = new Error('El usuario INMOBILIARIA no tiene una inmobiliaria asociada');
    err.status = 403;
    err.statusCode = 403;
    throw err;
  }
  return user.inmobiliariaId;
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
  const tenantId = requireTenantSiInmobiliaria(user);

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

  if (tenantId !== undefined) {
    // Validar límite de prioridades activas para INMOBILIARIA
    const inm = await prisma.inmobiliaria.findUnique({
      where: { id: tenantId },
      select: { maxPrioridadesActivas: true },
    });
    const limite = inm?.maxPrioridadesActivas ?? 5;
    
    const activas = await prisma.prioridad.count({
      where: { inmobiliariaId: tenantId, estado: EstadoPrioridad.ACTIVA },
    });
    
    if (activas >= limite) {
      const err: any = new Error(`La inmobiliaria alcanzó el límite de prioridades activas (${limite}).`);
      err.status = 409;
      throw err;
    }
    
    ownerType = OwnerPrioridad.INMOBILIARIA;
    inmobiliariaIdFinal = tenantId;
  } else if (user?.role === 'ADMINISTRADOR' || user?.role === 'GESTOR') {
    // ADMIN/GESTOR pueden setear ownerType e inmobiliariaId desde el body
    if (body.ownerType) {
      ownerType = body.ownerType as OwnerPrioridad;
      inmobiliariaIdFinal = body.ownerType === OwnerPrioridad.INMOBILIARIA 
        ? (body.inmobiliariaId ?? null)
        : null;
      // D1: la inmobiliaria elegida por staff debe estar OPERATIVO
      await assertInmobiliariaAsignable(inmobiliariaIdFinal);
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

  // Transacción: insertar la prioridad ACTIVA y marcar el lote CON_PRIORIDAD, en ese orden.
  // - El índice único parcial (una ACTIVA por lote) es la barrera definitiva: de dos altas
  //   concurrentes para el mismo lote, la segunda falla al insertar (409) y no toca el lote.
  // - El lote se marca con un UPDATE condicionado al estado leído al validar: si cambió en el medio
  //   (reserva, venta, otra prioridad), no se pisa y el alta se revierte con 409. Así
  //   loteEstadoAlCrear es siempre el estado real previo a la prioridad.
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

      // Cambiar lote a CON_PRIORIDAD solo si sigue en el estado validado
      const { count } = await tx.lote.updateMany({
        where: { id: body.loteId, estado: lote.estado },
        data: { estado: EstadoLote.CON_PRIORIDAD },
      });
      if (count === 0) {
        const err: any = new Error('Solo se puede crear una prioridad para lotes DISPONIBLE o EN_PROMOCION');
        err.status = 409;
        throw err;
      }

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
  const tenantId = requireTenantSiInmobiliaria(user);

  // Construir where clause
  const where: any = {};

  // Si el usuario es INMOBILIARIA, solo mostrar sus prioridades (ignorar inmobiliariaId del query)
  if (tenantId !== undefined) {
    where.inmobiliariaId = tenantId;
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
  const tenantId = requireTenantSiInmobiliaria(user);
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
    if (tenantId !== undefined) {
      if (prioridad.inmobiliariaId !== tenantId || prioridad.ownerType !== 'INMOBILIARIA') {
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
  const tenantId = requireTenantSiInmobiliaria(user);
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
    if (tenantId !== undefined) {
      if (prioridad.inmobiliariaId !== tenantId || prioridad.ownerType !== 'INMOBILIARIA') {
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
  const tenantId = requireTenantSiInmobiliaria(user);
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
  if (tenantId !== undefined) {
    if (prioridad.ownerType !== OwnerPrioridad.INMOBILIARIA || prioridad.inmobiliariaId !== tenantId) {
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
  const tenantId = requireTenantSiInmobiliaria(user);
  const prioridad = await prisma.prioridad.findUnique({
    where: { id },
    select: { id: true, estado: true, loteId: true, loteEstadoAlCrear: true, ownerType: true, inmobiliariaId: true },
  });

  if (!prioridad) {
    const err: any = new Error('Prioridad no encontrada');
    err.status = 404;
    throw err;
  }

  // Validar permisos: INMOBILIARIA solo puede cancelar sus propias prioridades
  if (tenantId !== undefined) {
    if (prioridad.ownerType !== OwnerPrioridad.INMOBILIARIA || prioridad.inmobiliariaId !== tenantId) {
      const err: any = new Error('No puedes cancelar esta prioridad');
      err.status = 403;
      throw err;
    }
  } else if (user?.role !== 'ADMINISTRADOR' && user?.role !== 'GESTOR') {
    const err: any = new Error('No tienes permisos para cancelar prioridades');
    err.status = 403;
    throw err;
  }

  // Validar que la prioridad esté ACTIVA
  if (prioridad.estado !== EstadoPrioridad.ACTIVA) {
    const err: any = new Error('Solo se pueden cancelar prioridades ACTIVA');
    err.status = 400;
    throw err;
  }

  // Cancelar + restaurar lote en una transacción, condicionado a que siga ACTIVA
  return cerrarPrioridadActiva(prioridad, EstadoPrioridad.CANCELADA, 'Solo se pueden cancelar prioridades ACTIVA');
}

// ==============================
// Finalizar prioridad
// ==============================
export async function finalizePrioridad(
  id: number,
  user?: { role: string; inmobiliariaId?: number | null }
): Promise<any> {
  const tenantId = requireTenantSiInmobiliaria(user);
  const prioridad = await prisma.prioridad.findUnique({
    where: { id },
    select: { id: true, estado: true, loteId: true, loteEstadoAlCrear: true, ownerType: true, inmobiliariaId: true },
  });

  if (!prioridad) {
    const err: any = new Error('Prioridad no encontrada');
    err.status = 404;
    throw err;
  }

  // Validar permisos: INMOBILIARIA solo puede finalizar sus propias prioridades
  if (tenantId !== undefined) {
    if (prioridad.ownerType !== OwnerPrioridad.INMOBILIARIA || prioridad.inmobiliariaId !== tenantId) {
      const err: any = new Error('No puedes finalizar esta prioridad');
      err.status = 403;
      throw err;
    }
  } else if (user?.role !== 'ADMINISTRADOR' && user?.role !== 'GESTOR') {
    const err: any = new Error('No tienes permisos para finalizar prioridades');
    err.status = 403;
    throw err;
  }

  // Validar que la prioridad esté ACTIVA
  if (prioridad.estado !== EstadoPrioridad.ACTIVA) {
    const err: any = new Error('Solo se pueden finalizar prioridades ACTIVA');
    err.status = 400;
    throw err;
  }

  // Finalizar + restaurar lote en una transacción, condicionado a que siga ACTIVA
  return cerrarPrioridadActiva(prioridad, EstadoPrioridad.FINALIZADA, 'Solo se pueden finalizar prioridades ACTIVA');
}

// ==============================
// Expirar prioridades vencidas
// ==============================
/**
 * Única operación de expiración de prioridades (D3): la usan el job programado (runExpirations) y
 * el endpoint manual POST /api/prioridades/jobs/expire.
 *
 * Por cada prioridad ACTIVA con fechaFin vencida, en una transacción propia:
 * - la marca EXPIRADA con un update condicionado a que siga ACTIVA y vencida: si otro request la
 *   canceló/finalizó, u otra corrida ya la expiró, no se pisa nada (count 0) ni se toca el lote;
 * - restaura el lote (restaurarLoteTrasPrioridad). Prioridad y lote cambian juntos o no cambian.
 * Una prioridad que falla no frena a las demás (mismo criterio que expireReservas): se loguea y sigue.
 */
export async function expirePrioridadesVencidas(now: Date = new Date()): Promise<{ expired: number }> {
  const vencida = { estado: EstadoPrioridad.ACTIVA, fechaFin: { lt: now } };

  // Candidatas (necesitamos loteId y loteEstadoAlCrear para restaurar el lote)
  const prioridadesVencidas = await prisma.prioridad.findMany({
    where: vencida,
    select: { id: true, loteId: true, loteEstadoAlCrear: true },
  });

  let expired = 0;
  for (const prioridad of prioridadesVencidas) {
    try {
      const expirada = await prisma.$transaction(async (tx) => {
        const { count } = await tx.prioridad.updateMany({
          where: { id: prioridad.id, ...vencida },
          data: { estado: EstadoPrioridad.EXPIRADA },
        });
        if (count === 0) return false;

        await restaurarLoteTrasPrioridad(tx, prioridad.loteId, prioridad.loteEstadoAlCrear);
        return true;
      });
      if (expirada) expired++;
    } catch (error) {
      console.error(`[expirePrioridades] Error al expirar prioridad ${prioridad.id}:`, safeErrorForLog(error));
    }
  }

  return { expired };
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
  const tenantId = requireTenantSiInmobiliaria(user);
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
  if (tenantId !== undefined) {
    if (prioridadActual.ownerType !== OwnerPrioridad.INMOBILIARIA || prioridadActual.inmobiliariaId !== tenantId) {
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
        select: { maxPrioridadesActivas: true, estadoOperativo: true },
      });

      if (!inmobDestino) {
        const err: any = new Error('La inmobiliaria destino no existe');
        err.status = 404;
        throw err;
      }
      // D1: no se reasigna a una inmobiliaria ELIMINADO
      assertInmobiliariaOperativa(inmobDestino);

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
