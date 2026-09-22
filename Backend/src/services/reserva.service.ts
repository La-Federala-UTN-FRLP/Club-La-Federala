// src/services/reserva.service.ts
import prisma from '../config/prisma'; 
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { EstadoLote, EstadoReserva, EstadoPrioridad, OwnerPrioridad, EstadoOperativo } from '../generated/prisma';
import { updateLoteState } from './lote.service';
import { ESTADO_LOTE_OP } from '../domain/loteState/loteState.types';
import { assertLoteOperableFor, assertReservaUnicaVigente, computeRestoreStateFromReserva } from '../domain/loteState/loteState.rules';
import { cancelPrioridadActivaOnReserva } from '../domain/loteState/loteState.effects';

// Esto es un mapper de errores de Prisma a errores HTTP para no tenes que hacerlo en cada funcion
// -------------------------------------
function mapPrismaError(e: unknown) {
  if (e instanceof PrismaClientKnownRequestError) {
    if (e.code === 'P2002') {
      // Verificar si es un error de unicidad de numero
      if (e.meta?.target && Array.isArray(e.meta.target) && e.meta.target.includes('numero')) {
        const err: any = new Error('Ya existe una reserva con este número');
        err.status = 409;
        return err;
      }
      // unique compuesta (clienteId + loteId + fechaReserva)
      const err: any = new Error('Ya existe una reserva para ese cliente, lote y fecha');
      err.status = 409; return err;
    }
    if (e.code === 'P2003') { // FK inválida
      const err: any = new Error('Alguna referencia (cliente/lote/inmobiliaria) no existe');
      err.status = 409; return err;
    }
    if (e.code === 'P2025') { // not found
      const err: any = new Error('La reserva no existe');
      err.status = 404; return err;
    }
  }
  return e;
}

type ReservaActor = { role: string; inmobiliariaId?: number | null };

function forbidReserva(message: string): Error {
  const err: any = new Error(message);
  err.status = 403;
  err.statusCode = 403;
  return err;
}

function requireReservaActor(user: ReservaActor | undefined): ReservaActor {
  const allowed =
    user?.role === 'ADMINISTRADOR' ||
    user?.role === 'GESTOR' ||
    user?.role === 'INMOBILIARIA';
  if (!user || !allowed) {
    throw forbidReserva('No tienes permisos para esta acción');
  }
  return user;
}

// Solo exige tenant cuando el rol es INMOBILIARIA.
// Llamadas sin user (p. ej. expireReservas → updateReserva) no entran en esta rama.
function requireInmobiliariaContext(user?: ReservaActor): number | undefined {
  if (user?.role !== 'INMOBILIARIA') {
    return undefined;
  }
  if (user.inmobiliariaId == null) {
    throw forbidReserva('El usuario INMOBILIARIA no tiene una inmobiliaria asociada');
  }
  return user.inmobiliariaId;
}

function assertReservaOwnership(
  user: ReservaActor | undefined,
  reserva: { inmobiliariaId?: number | null },
  message = 'No tienes permiso para operar esta reserva',
): void {
  if (user?.role !== 'INMOBILIARIA') {
    return;
  }
  const tenantId = requireInmobiliariaContext(user);
  if (reserva.inmobiliariaId !== tenantId) {
    throw forbidReserva(message);
  }
}

// ==============================
// Obtener todas las reservas
// Retorna el listado junto con el total.
// Si el usuario es INMOBILIARIA, solo devuelve las reservas de su inmobiliaria.
// ==============================
export async function getAllReservas(
  query?: { estadoOperativo?: string },
  user?: { role: string; inmobiliariaId?: number | null }
): Promise<{ reservas: any[]; total: number }> {
  const whereClause: any = {};

  if (user?.role === 'INMOBILIARIA') {
    whereClause.inmobiliariaId = requireInmobiliariaContext(user);
  }

  // Filtro estadoOperativo: default OPERATIVO si no viene
  if (query?.estadoOperativo) {
    whereClause.estadoOperativo = query.estadoOperativo;
  } else {
    whereClause.estadoOperativo = 'OPERATIVO'; // Default: solo operativas
  }
  
  const reservas = await prisma.reserva.findMany({
    where: whereClause,
    orderBy: { fechaReserva: 'desc' },
    include: {
          cliente: {
            select: { id: true, nombre: true, apellido: true, razonSocial: true }, // lo que muestra la tabla
          },
          inmobiliaria: {
            select: { id: true, nombre: true }, // nombre visible
          },
      lote: { select: { id: true, precio: true, mapId: true, numero: true, fraccion: { select: { numero: true } } } },
        },
  });
  return { reservas, total: reservas.length };
}

// ==============================
// Obtener una reserva por ID
// Valida permisos: INMOBILIARIA solo puede ver sus propias reservas.
// ==============================
export async function getReservaById(id: number, user?: { role: string; inmobiliariaId?: number | null }): Promise<any> {
  const row = await prisma.reserva.findUnique({ 
    where: { id },
    include: {
      cliente: {
        select: { id: true, nombre: true, apellido: true, razonSocial: true },
      },
      inmobiliaria: {
        select: { id: true, nombre: true },
      },
      lote: { select: { id: true, precio: true, mapId: true, numero: true, fraccion: { select: { numero: true } } } },
    },
  });
  if (!row) {
    const err: any = new Error('La reserva no existe');
    err.status = 404;
    throw err;
  }
  
  console.log("getReservaById row:", JSON.stringify(row));
  
  // Validar permisos: INMOBILIARIA solo puede ver sus propias reservas
  if (user?.role === 'INMOBILIARIA') {
    assertReservaOwnership(user, row, 'No puedes ver esta reserva');
  } else if (user?.role !== 'ADMINISTRADOR' && user?.role !== 'GESTOR') {
    // Cualquier otro rol que no sea Admin/Gestor/Inmobiliaria queda bloqueado
    const err: any = new Error('No tienes permisos para ver esta reserva');
    err.status = 403;
    throw err;
  }
  
  return row; // devolvemos el registro con relaciones incluidas
}


export async function getReservaByImmobiliariaId(id: number, user: ReservaActor | undefined): Promise<any> {
  const actor = requireReservaActor(user);
  if (actor.role === 'INMOBILIARIA') {
    const tenantId = requireInmobiliariaContext(actor);
    if (id !== tenantId) {
      throw forbidReserva('No tienes permiso para ver las reservas de esta inmobiliaria');
    }
  }
  const row = await prisma.reserva.findMany({ where: { inmobiliariaId: id } });
  if (!row) {
    const err: any = new Error('Inmobialiaria no existe');
    err.status = 404;
    throw err;
  }
  return row; // devolvemos el registro tal cual viene de Prisma
}

// Buscar reservas por estado -- Nuevo
export async function getReservaByEstado(estadoR: EstadoReserva, user: ReservaActor | undefined): Promise<any> {
  const actor = requireReservaActor(user);
  const where =
    actor.role === 'INMOBILIARIA'
      ? { estado: estadoR, inmobiliariaId: requireInmobiliariaContext(actor) }
      : { estado: estadoR };
  const row = await prisma.reserva.findMany({ where });
  if (row.length === 0) {
    const err: any = new Error('No se encontraron reservas con ese estado');
    err.status = 404;
    throw err;
  }
  return row; // devolvemos el registro tal cual viene de Prisma
}

// ==============================
// Crear reserva
// ==============================
export async function createReserva(
  body: {
    fechaReserva: string;           // ISO (lo transformo a Date)
    loteId: number;
    clienteId: number;
    inmobiliariaId?: number | null;
    sena?: number;                  // Zod ya garantiza >= 0 si viene
    numero: string;                 // Número de reserva (obligatorio y único)
    fechaFinReserva: string;     // Fecha de fin de la reserva
    ofertaInicial: number;       // Oferta inicial (obligatoria)
  },
  user?: { role: string; inmobiliariaId?: number | null }
): Promise<any> {
  try {
    const lote = await prisma.lote.findUnique({ where: { id: body.loteId } });
    if (!lote) {
      throw new Error("Lote no encontrado.");
    }
    // Validar que el lote esté operativo (bloquea NO_DISPONIBLE)
    assertLoteOperableFor('crear reserva', lote.estado);

    // Permitir reservar si el lote está DISPONIBLE, EN_PROMOCION o CON_PRIORIDAD
    if (lote.estado !== EstadoLote.DISPONIBLE && lote.estado !== EstadoLote.EN_PROMOCION && lote.estado !== EstadoLote.CON_PRIORIDAD) {
      throw new Error("El lote no está disponible para reservar.");
    }

    // Validar unicidad: solo puede haber 1 reserva vigente (ACTIVA o ACEPTADA) por lote
    await assertReservaUnicaVigente(body.loteId);

    // Si el lote está CON_PRIORIDAD, validar exclusividad de la prioridad
    if (lote.estado === EstadoLote.CON_PRIORIDAD) {
      const prioridadActiva = await prisma.prioridad.findFirst({
        where: {
          loteId: body.loteId,
          estado: EstadoPrioridad.ACTIVA,
        },
        include: {
          inmobiliaria: {
            select: {
              id: true,
              nombre: true,
            },
          },
        },
      });

      if (!prioridadActiva) {
        const err: any = new Error('Lote marcado Con Prioridad pero no hay prioridad activa');
        err.status = 409;
        throw err;
      }

      // Validar exclusividad según ownerType de la prioridad
      if (prioridadActiva.ownerType === OwnerPrioridad.CCLF) {
        // Solo ADMINISTRADOR/GESTOR pueden reservar lotes con prioridad CCLF
        if (user?.role !== 'ADMINISTRADOR' && user?.role !== 'GESTOR') {
          const err: any = new Error('Solo administradores y gestores pueden reservar lotes con prioridad CCLF');
          err.status = 403;
          throw err;
        }
      } else if (prioridadActiva.ownerType === OwnerPrioridad.INMOBILIARIA) {
        // Validar que la inmobiliaria de la reserva coincida con la dueña de la prioridad
        let targetInmoId: number | null = null;
        if (user?.role === 'INMOBILIARIA') {
           if (!user.inmobiliariaId) {
             const err: any = new Error('El usuario INMOBILIARIA no tiene una inmobiliaria asociada');
             err.status = 400;
             throw err;
           }
           targetInmoId = user.inmobiliariaId;
        } else if (user?.role === 'ADMINISTRADOR' || user?.role === 'GESTOR') {
           // Si es admin, validamos contra la inmobiliaria que viene en el body
           targetInmoId = body.inmobiliariaId || null;
        } else {
             const err: any = new Error('Solo la inmobiliaria dueña de la prioridad o Administradores pueden reservar este lote');
             err.status = 403;
             throw err;
        }

        if (!targetInmoId || Number(prioridadActiva.inmobiliariaId) !== Number(targetInmoId)) {
             const nombreInmo = prioridadActiva.inmobiliaria?.nombre || 'Inmobiliaria';
             const err: any = new Error(`Esta reserva solo puede ser creada para la inmobiliaria "${nombreInmo}" que posee la prioridad.`);
             err.status = 403;
             throw err;
        }
      }
    }

    // Validar que el cliente exista y esté ACTIVA (soft delete)
    const clienteExists = await prisma.persona.findUnique({
      where: { id: body.clienteId },
    });
    if (!clienteExists) {
      const err: any = new Error('Cliente no encontrado');
      err.status = 404;
      throw err;
    }
    if (clienteExists.estadoOperativo !== 'OPERATIVO') {
      const err: any = new Error('No se puede crear una reserva con un cliente inactivo');
      err.status = 400;
      throw err;
    }

    // Si el usuario es INMOBILIARIA, usar siempre su inmobiliariaId
    let inmobiliariaIdFinal = body.inmobiliariaId ?? null;
    if (user?.role === 'INMOBILIARIA') {
      if (!user.inmobiliariaId) {
        throw new Error("El usuario INMOBILIARIA no tiene una inmobiliaria asociada.");
      }
      inmobiliariaIdFinal = user.inmobiliariaId;
    }

    // Guardar el estado original del lote antes de crear la reserva (para restaurarlo al finalizar)
    const estadoOriginalLote = lote.estado;

    console.log("DEBUG: createReserva creating prisma record", { 
        data: {
            fechaReserva: body.fechaReserva,
            loteId: body.loteId,
            sena: body.sena,
            ofertaInicial: body.ofertaInicial,
            state: EstadoReserva.ACTIVA
        }
    });

    const result = await prisma.$transaction(async (tx) => {
        // 1. Crear Reserva
        // 1. Crear Reserva
        const reserva = await tx.reserva.create({
          data: {
            fechaReserva: new Date(body.fechaReserva),
            loteId: body.loteId,
            clienteId: body.clienteId,
            inmobiliariaId: inmobiliariaIdFinal,
            ...(body.sena !== undefined ? { sena: body.sena } : {}),
            ofertaInicial: body.ofertaInicial,
            ofertaActual: body.ofertaInicial, // Inicialmente igual a la inicial
            estado: EstadoReserva.ACTIVA, // Siempre nace activa salvo logica especial, pero simplifiquemos
            numero: body.numero,
            fechaFinReserva: new Date(body.fechaFinReserva),
            loteEstadoAlCrear: estadoOriginalLote,
            estadoOperativo: 'OPERATIVO'
          },
          include: {
            inmobiliaria: { select: { nombre: true, id: true } },
            cliente: { select: { id: true, nombre: true, apellido: true, razonSocial: true } }
          }
        });

        // 2. Crear Oferta Inicial (Primer registro histórico)
        let nombreEfector = "La Federala";
        let efectorId = null;
        let ownerType: OwnerPrioridad = OwnerPrioridad.CCLF; // Default admin

        if (reserva.inmobiliariaId) {
            nombreEfector = reserva.inmobiliaria?.nombre || "Inmobiliaria";
            efectorId = reserva.inmobiliariaId;
            ownerType = OwnerPrioridad.INMOBILIARIA;
        }

        await tx.ofertaReserva.create({
            data: {
                reservaId: reserva.id,
                monto: body.ofertaInicial,
                motivo: "Oferta Inicial",
                createdAt: new Date(),
                nombreEfector,
                efectorId,
                ownerType, // Usamos el enum correcto
            }
        });


        return reserva;
    });

    // 3. Side Effects (Lote Update)
    await updateLoteState(body.loteId, ESTADO_LOTE_OP.RESERVADO);

    if (estadoOriginalLote === EstadoLote.CON_PRIORIDAD) {
      await cancelPrioridadActivaOnReserva(body.loteId);
    }

    return result;
  } catch (e) {
    throw mapPrismaError(e);
  }
}

// ==============================
// Actualizar reserva (parcial)
// ==============================
export async function updateReserva(
  id: number,
  body: Partial<{
    fechaReserva: string;
    loteId: number;
    estado: EstadoReserva;
    clienteId: number;
    inmobiliariaId: number | null;
    sena: number;
    numero: string;
    fechaFinReserva: string;
  }>,
  user?: { role: string; inmobiliariaId?: number | null }
): Promise<any> {
  try {
    // Obtener reserva actual para validaciones
    const reservaActual = await prisma.reserva.findUnique({
      where: { id },
      select: { estado: true, inmobiliariaId: true, loteId: true, loteEstadoAlCrear: true, ventaId: true }
    });

    if (!reservaActual) {
      const err: any = new Error('La reserva no existe');
      err.status = 404;
      throw err;
    }

    // BLOQUEO CRÍTICO: Si la reserva está consumida por una venta, no se puede modificar el estado
    if (reservaActual.ventaId != null && body.estado !== undefined) {
      const err: any = new Error('Esta reserva ya fue consumida por una venta y no se puede modificar su estado');
      err.status = 400;
      throw err;
    }

    // VALIDACIÓN DE TRANSICIONES DE ESTADO
    if (body.estado !== undefined && body.estado !== reservaActual.estado) {
      const estadoActual = reservaActual.estado as string;
      const nuevoEstado = body.estado as string;
      
      // Definir transiciones permitidas por estado
      const transicionesPermitidas: Record<string, string[]> = {
        'CANCELADA': ['ACTIVA'],
        'ACEPTADA': ['RECHAZADA', 'CANCELADA'],
        'ACTIVA': ['CANCELADA'],
        'RECHAZADA': ['ACTIVA'],
        'CONTRAOFERTA': [], // No se puede cambiar manualmente
        'EXPIRADA': ['ACTIVA']
      };
      
      const permitidas = transicionesPermitidas[estadoActual] || [];
      
      if (!permitidas.includes(nuevoEstado)) {
        const err: any = new Error(
          `No se puede cambiar el estado de ${estadoActual} a ${nuevoEstado}. Transiciones permitidas: ${permitidas.join(', ') || 'ninguna (solo via negociaciones)'}`
        );
        err.status = 400;
        throw err;
      }
      
      // Si está reactivando a ACTIVA, validar estado del lote
      if (nuevoEstado === 'ACTIVA' && ['CANCELADA', 'RECHAZADA', 'EXPIRADA'].includes(estadoActual)) {
        const lote = await prisma.lote.findUnique({
          where: { id: reservaActual.loteId },
          select: { estado: true }
        });
        
        if (!lote) {
          const err: any = new Error('No se encontró el lote asociado a la reserva');
          err.status = 404;
          throw err;
        }
        
        const estadosPermitidos = [EstadoLote.DISPONIBLE, EstadoLote.EN_PROMOCION];
        if (!estadosPermitidos.includes(lote.estado as any)) {
          const err: any = new Error(
            `No se puede reactivar la reserva. El lote debe estar en estado DISPONIBLE o EN PROMOCIÓN (actualmente: ${lote.estado})`
          );
          err.status = 400;
          throw err;
        }
      }
    }

    // Validar expiración: solo puede aplicarse si la reserva estaba ACTIVA, ACEPTADA o CONTRAOFERTA
    if (body.estado !== undefined && body.estado === EstadoReserva.EXPIRADA) {
      if (reservaActual.estado !== EstadoReserva.ACTIVA && reservaActual.estado !== EstadoReserva.ACEPTADA && reservaActual.estado !== EstadoReserva.CONTRAOFERTA) {
        const err: any = new Error('Solo se puede marcar como EXPIRADA una reserva que está ACTIVA, ACEPTADA o en CONTRAOFERTA');
        err.status = 400;
        throw err;
      }
    }

    // Validar rechazo: solo puede aplicarse desde ACTIVA o ACEPTADA
    if (body.estado !== undefined && body.estado === EstadoReserva.RECHAZADA) {
      if (reservaActual.estado !== EstadoReserva.ACTIVA && reservaActual.estado !== EstadoReserva.ACEPTADA) {
        const err: any = new Error('Solo se puede rechazar una reserva que está ACTIVA o ACEPTADA');
        err.status = 400;
        throw err;
      }
    }

    // Validar reactivación: desde CANCELADA o RECHAZADA solo se puede volver a ACTIVA
    if (body.estado !== undefined && (reservaActual.estado === EstadoReserva.CANCELADA || reservaActual.estado === EstadoReserva.RECHAZADA)) {
      // Solo permitir cambio a ACTIVA
      if (body.estado !== EstadoReserva.ACTIVA) {
        const err: any = new Error('Desde CANCELADA o RECHAZADA solo se puede volver a ACTIVA');
        err.status = 400;
        throw err;
      }

      // Validar que no exista otra reserva vigente en el lote
      const otraReservaVigente = await prisma.reserva.findFirst({
        where: {
          loteId: reservaActual.loteId,
          id: { not: id }, // Excluir la reserva actual
          estado: { in: [EstadoReserva.ACTIVA, EstadoReserva.ACEPTADA] },
        },
      });

      if (otraReservaVigente) {
        const err: any = new Error('No se puede reactivar la reserva porque el lote ya tiene otra reserva vigente');
        err.status = 409;
        throw err;
      }

      // Validar que no exista prioridad activa en el lote
      const prioridadActiva = await prisma.prioridad.findFirst({
        where: {
          loteId: reservaActual.loteId,
          estado: EstadoPrioridad.ACTIVA,
        },
      });

      if (prioridadActiva) {
        const err: any = new Error('No se puede reactivar la reserva porque el lote tiene una prioridad activa');
        err.status = 409;
        throw err;
      }
    }

    // Validar permisos y restricciones para INMOBILIARIA
    if (user?.role === 'INMOBILIARIA') {
      assertReservaOwnership(user, reservaActual, 'No puedes modificar esta reserva');

      // Validar cambio de estado: solo puede cambiar a CANCELADA y solo si está ACTIVA
      if (body.estado !== undefined) {
        if (reservaActual.estado === EstadoReserva.CANCELADA) {
          const err: any = new Error('No se puede cambiar el estado de una reserva cancelada');
          err.status = 400;
          throw err;
        }
        // INMOBILIARIA solo puede cancelar si la reserva está ACTIVA (no ACEPTADA)
        if (reservaActual.estado !== EstadoReserva.ACTIVA) {
          const err: any = new Error('Solo puedes cancelar una reserva que está ACTIVA. Las reservas ACEPTADAS solo pueden ser gestionadas por Administradores o Gestores');
          err.status = 403;
          throw err;
        }
        if (body.estado !== EstadoReserva.CANCELADA) {
          const err: any = new Error('Solo se puede cambiar el estado a "Cancelada"');
          err.status = 400;
          throw err;
        }
      }

      // Filtrar campos permitidos para INMOBILIARIA (similar a TECNICO en updatedLote)
      const allowedFields = ['fechaReserva', 'clienteId', 'sena', 'estado', 'fechaFinReserva'];
      const filtered: Record<string, any> = {};
      Object.keys(body || {}).forEach((field) => {
        if (allowedFields.includes(field)) {
          filtered[field] = body[field as keyof typeof body];
        }
      });
      body = filtered as typeof body;
    }

    // Impedir cambiar loteId para evitar restaurar lote equivocado
    if (body.loteId !== undefined && body.loteId !== reservaActual.loteId) {
      const err: any = new Error('No se puede cambiar el loteId de una reserva');
      err.status = 400;
      throw err;
    }

    // Impedir cambiar inmobiliariaId una vez creada la reserva
    if (body.inmobiliariaId !== undefined && body.inmobiliariaId !== reservaActual.inmobiliariaId) {
      const err: any = new Error('No se puede cambiar la inmobiliaria de una reserva ya creada');
      err.status = 400;
      throw err;
    }

    // Impedir que INMOBILIARIA cambie fechas de reserva
    if (user?.role === 'INMOBILIARIA') {
      if (body.fechaReserva !== undefined) {
        const err: any = new Error('El rol INMOBILIARIA no puede modificar la fecha de reserva');
        err.status = 403;
        throw err;
      }
      if (body.fechaFinReserva !== undefined) {
        const err: any = new Error('El rol INMOBILIARIA no puede modificar el plazo de reserva');
        err.status = 403;
        throw err;
      }
    }

    // Construir dataToUpdate
    const dataToUpdate: any = {};
    if (body.fechaReserva !== undefined) {
      dataToUpdate.fechaReserva = new Date(body.fechaReserva);
    }
    if (body.clienteId !== undefined) {
      dataToUpdate.clienteId = body.clienteId;
    }
    if (body.inmobiliariaId !== undefined) {
      dataToUpdate.inmobiliariaId = body.inmobiliariaId;
    }
    if (body.sena !== undefined) {
      dataToUpdate.sena = body.sena;
    }
    if (body.estado !== undefined) {
      dataToUpdate.estado = body.estado;
    }
    if (body.numero !== undefined) {
      dataToUpdate.numero = body.numero;
    }
    if (body.fechaFinReserva !== undefined) {
      dataToUpdate.fechaFinReserva = new Date(body.fechaFinReserva);
    }

    const row = await prisma.reserva.update({
      where: { id },
      data: dataToUpdate,
      include: {
        cliente: {
          select: { id: true, nombre: true, apellido: true, razonSocial: true },
        },
        inmobiliaria: {
          select: { id: true, nombre: true },
        },
        lote: { select: { id: true, precio: true, mapId: true, numero: true, fraccion: { select: { numero: true } } } },
      },
    });

    // Sincronizar estado del lote con el estado de la reserva
    if (body.estado !== undefined) {
      if (body.estado === EstadoReserva.CANCELADA || body.estado === EstadoReserva.RECHAZADA || body.estado === EstadoReserva.EXPIRADA) {
        // Si la reserva termina, restauramos el estado original usando regla centralizada
        const estadoARestaurar = await computeRestoreStateFromReserva(reservaActual.loteEstadoAlCrear, row.loteId);
        await updateLoteState(row.loteId, estadoARestaurar); 
      } else if (body.estado === EstadoReserva.ACTIVA) {
        // Si la reserva se establece como ACTIVA, cambiar el estado del lote a "RESERVADO"
        await updateLoteState(row.loteId, ESTADO_LOTE_OP.RESERVADO);
      }
      // Si es ACEPTADA, no cambiamos automáticamente el estado del lote
      // porque podría estar VENDIDO (la reserva aceptada puede derivar en venta)
    }
    return row;
  } catch (e) {
    throw mapPrismaError(e);
  }
}

// ==============================
// Eliminar reserva (hard delete)
// ==============================
export async function deleteReserva(id: number): Promise<void> {
  try {
    const reserva = await prisma.reserva.findUnique({
      where: { id },
      select: { estado: true, loteId: true, loteEstadoAlCrear: true },
    });

    if (!reserva) {
      const err: any = new Error('La reserva no existe');
      err.status = 404;
      throw err;
    }

    await prisma.reserva.delete({ where: { id } });

    // Si la reserva estaba activa, restauramos el estado original del lote usando regla centralizada
    if (reserva.estado === EstadoReserva.ACTIVA && reserva.loteId) {
      const estadoARestaurar = await computeRestoreStateFromReserva(reserva.loteEstadoAlCrear, reserva.loteId);
      await updateLoteState(reserva.loteId, estadoARestaurar);
    }
  } catch (e) {
    throw mapPrismaError(e);
  }
}
// ==============================
// Eliminar reserva (Soft Delete - estadoOperativo)
// ==============================
// Solo permite eliminar reservas en estados: CANCELADA, EXPIRADA, RECHAZADA
// NO modifica el lote ni el estado comercial de la reserva
export async function eliminarReserva(
  id: number,
  user?: { role: string; inmobiliariaId?: number | null }
): Promise<any> {
  try {
    const reserva = await prisma.reserva.findUnique({
      where: { id },
      include: {
        cliente: {
          select: { id: true, nombre: true, apellido: true, razonSocial: true },
        },
        inmobiliaria: {
          select: { id: true, nombre: true },
        },
        lote: {
          select: { 
            id: true, 
            precio: true, 
            mapId: true,
            numero: true,
            fraccion: {
              select: { numero: true }
            }
          },
        },
      },
    });

    if (!reserva) {
      const err: any = new Error('La reserva no existe');
      err.statusCode = 404;
      throw err;
    }

    if (user?.role === 'INMOBILIARIA') {
      assertReservaOwnership(user, reserva, 'No tienes permiso para eliminar esta reserva');
    }

    // Validar que no esté ya eliminada
    if (reserva.estadoOperativo === 'ELIMINADO') {
      const err: any = new Error('La reserva ya está eliminada.');
      err.statusCode = 409;
      throw err;
    }

    // Validar que el estado permita eliminación lógica
    // Solo se puede eliminar si está en: CANCELADA, EXPIRADA, RECHAZADA
    const estadosPermitidos: EstadoReserva[] = [EstadoReserva.CANCELADA, EstadoReserva.EXPIRADA, EstadoReserva.RECHAZADA];
    if (!estadosPermitidos.includes(reserva.estado)) {
      const err: any = new Error(`No se puede eliminar una reserva en estado ${reserva.estado}. Solo se pueden eliminar reservas en estado CANCELADA, EXPIRADA o RECHAZADA.`);
      err.statusCode = 409;
      throw err;
    }

    // Eliminar lógicamente: solo cambia estadoOperativo a ELIMINADO
    // NO modifica el estado comercial ni el lote
    const row = await prisma.reserva.update({
      where: { id },
      data: {
        estadoOperativo: 'ELIMINADO',
      },
      include: {
        cliente: {
          select: { id: true, nombre: true, apellido: true, razonSocial: true },
        },
        inmobiliaria: {
          select: { id: true, nombre: true },
        },
        lote: {
          select: { 
            id: true, 
            precio: true, 
            mapId: true,
            numero: true,
            fraccion: {
              select: { numero: true }
            }
          },
        },
      },
    });

    return row;
  } catch (e: any) {
    if (e.statusCode) {
      throw e;
    }
    throw mapPrismaError(e);
  }
}

// ==============================
// Reactivar reserva (estadoOperativo)
// ==============================
export async function reactivarReserva(
  id: number,
  user?: { role: string; inmobiliariaId?: number | null }
): Promise<any> {
  try {
    const reserva = await prisma.reserva.findUnique({
      where: { id },
      include: {
        cliente: {
          select: { id: true, nombre: true, apellido: true, razonSocial: true },
        },
        inmobiliaria: {
          select: { id: true, nombre: true },
        },
        lote: {
          select: { 
            id: true, 
            precio: true, 
            mapId: true,
            numero: true,
            fraccion: {
              select: { numero: true }
            }
          },
        },
      },
    });

    if (!reserva) {
      const err: any = new Error('La reserva no existe');
      err.statusCode = 404;
      throw err;
    }

    if (user?.role === 'INMOBILIARIA') {
      assertReservaOwnership(user, reserva, 'No tienes permiso para reactivar esta reserva');
    }

    // Validar que no esté ya operativa
    if (reserva.estadoOperativo === 'OPERATIVO') {
      const err: any = new Error('La reserva ya está operativa.');
      err.statusCode = 409;
      throw err;
    }

    // Reactivar: solo cambia estadoOperativo a OPERATIVO (no valida lote disponible, plazos, etc.)
    const updated = await prisma.reserva.update({
      where: { id },
      data: {
        estadoOperativo: 'OPERATIVO',
      },
      include: {
        cliente: {
          select: { id: true, nombre: true, apellido: true, razonSocial: true },
        },
        inmobiliaria: {
          select: { id: true, nombre: true },
        },
        lote: {
          select: { 
            id: true, 
            precio: true, 
            mapId: true,
            numero: true,
            fraccion: {
              select: { numero: true }
            }
          },
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
// Obtener historial de ofertas de una reserva
// ==============================
export async function getOfertasByReservaId(reservaId: number, user: ReservaActor | undefined) {
  const actor = requireReservaActor(user);
  const reserva = await prisma.reserva.findUnique({
    where: { id: reservaId },
    select: { id: true, inmobiliariaId: true },
  });
  if (!reserva) {
    const err: any = new Error('La reserva no existe');
    err.status = 404;
    throw err;
  }
  if (actor.role === 'INMOBILIARIA') {
    assertReservaOwnership(actor, reserva, 'No puedes ver esta reserva');
  }
  return prisma.ofertaReserva.findMany({
    where: { reservaId },
    orderBy: { createdAt: 'desc' },
  });
}

// ==============================
// Crear una oferta (contraoferta/aceptación/rechazo)
// ==============================
export async function createOfertaReserva(reservaId: number, data: any, user: any) {
  // data: { monto, motivo, action: 'CONTRAOFERTAR' | 'ACEPTAR' | 'RECHAZAR' }
  const reserva = await prisma.reserva.findUnique({ 
      where: { id: reservaId },
      include: {
          inmobiliaria: {
              select: { id: true, nombre: true }
          }
      } 
  });
  if (!reserva) throw new Error("Reserva no encontrada");

  if (user?.role === 'INMOBILIARIA') {
    assertReservaOwnership(user, reserva, 'No tienes permiso para operar esta reserva');
  }

  // Determine owner details
  let nombreEfector = "Desconocido";
  let efectorId = null;
  const isInmobiliaria = user.role === 'INMOBILIARIA';
  // Use existing enum OwnerPrioridad to distinguish actions
  const ownerType = isInmobiliaria ? OwnerPrioridad.INMOBILIARIA : OwnerPrioridad.CCLF;

  if (isInmobiliaria) {
      // Per user request: Inherit from the reservation because that is the agency negotiating.
      if (reserva.inmobiliaria) {
          nombreEfector = reserva.inmobiliaria.nombre;
          efectorId = reserva.inmobiliaria.id;
      } else {
          // Fallback if for some reason it's missing (though it should exist for INMO reservations)
           // Or maybe the user is an external agent? But the logic implies the res belongs to an inmo.
           // If user has inmoId, use that as fallback
          if (user.inmobiliariaId) {
             efectorId = user.inmobiliariaId;
             const inmo = await prisma.inmobiliaria.findUnique({where: {id: efectorId}, select: {nombre: true}});
             nombreEfector = inmo?.nombre || "Inmobiliaria";
          } else {
             nombreEfector = "Inmobiliaria";
          }
      }
  } else {
      // Para admin/gestor
      nombreEfector =  "La Federala"; 
  }



  // Transaction
  return prisma.$transaction(async (tx) => {
    // 1. Crear registro de oferta
    // Nota: Si es rechazo, igual creamos el registro para historial explicando el motivo
    const oferta = await tx.ofertaReserva.create({
      data: {
        reservaId,
        monto: data.monto, // Puede ser el mismo monto anterior si solo rechaza o acepta, o nuevo si contraoferta
        motivo: data.motivo,
        nombreEfector,
        efectorId,
        ownerType,
      }
    });

    // 2. Actualizar reserva
    const updateData: any = {
      ofertaActual: data.monto,
    };

    if (data.action === 'ACEPTAR') {
        updateData.estado = EstadoReserva.ACEPTADA;
    } else if (data.action === 'RECHAZAR') {
        updateData.estado = EstadoReserva.RECHAZADA;
    } else {
        // Default -> CONTRAOFERTA (se asume que si no es aceptar/rechazar es nueva oferta)
        updateData.estado = EstadoReserva.CONTRAOFERTA;
    }



    const reservaUpdated = await tx.reserva.update({
        where: { id: reservaId },
        data: updateData
    });

    return { oferta, reserva: reservaUpdated };
  });
}
