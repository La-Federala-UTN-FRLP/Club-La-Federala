// src/services/promocion.service.ts
import prisma from '../config/prisma';
import { EstadoLote, Prisma } from '../generated/prisma';
import { updateLoteState } from './lote.service';
import { ESTADO_LOTE_OP } from '../domain/loteState/loteState.types';

// ==============================
// Aplicar promoción a un lote
// ==============================
export async function aplicarPromocion(
  loteId: number,
  body: {
    precioPromocional: number;
    fin?: Date | null;
    explicacion?: string | null;
  }
) {
  // Verificar que el lote existe
  const lote = await prisma.lote.findUnique({
    where: { id: loteId },
  });

  if (!lote) {
    const err: any = new Error('Lote no encontrado');
    err.statusCode = 404;
    throw err;
  }

  // Solo permitir si el lote está DISPONIBLE
  if (lote.estado !== EstadoLote.DISPONIBLE) {
    const err: any = new Error('Solo se puede aplicar promoción a lotes en estado DISPONIBLE');
    err.statusCode = 400;
    throw err;
  }

  // Verificar que NO exista una promoción activa para ese lote
  const promocionActiva = await prisma.promocion.findFirst({
    where: {
      loteId,
      activa: true,
    },
  });

  if (promocionActiva) {
    const err: any = new Error('El lote ya tiene una promoción activa');
    err.statusCode = 409;
    throw err;
  }

  // Validar que el lote tenga precio
  if (lote.precio === null) {
    const err: any = new Error('El lote debe tener un precio para aplicar promoción');
    err.statusCode = 400;
    throw err;
  }

  // El precio promocional debe ser estrictamente menor al actual (bug QA 20).
  // Se compara en Decimal, el mismo tipo de la columna, para no perder precisión.
  if (new Prisma.Decimal(body.precioPromocional).gte(lote.precio)) {
    const err: any = new Error('El precio promocional debe ser menor al precio actual del lote');
    err.statusCode = 400;
    throw err;
  }

  const precioAnterior = lote.precio;

  // Ejecutar en transacción
  const resultado = await prisma.$transaction(async (tx) => {
    // Pasar el lote a EN_PROMOCION solo si sigue DISPONIBLE: de dos promociones concurrentes sobre
    // el mismo lote, la segunda espera el lock de la fila, afecta 0 filas y se revierte con 409 sin
    // crear la promoción. Mismo patrón que createPrioridad y createReserva.
    const { count } = await tx.lote.updateMany({
      where: { id: loteId, estado: EstadoLote.DISPONIBLE },
      data: {
        estado: EstadoLote.EN_PROMOCION,
        precio: body.precioPromocional,
      },
    });
    if (count !== 1) {
      const err: any = new Error('El lote ya no está disponible para aplicar la promoción: otra operación lo modificó. Volvé a intentarlo.');
      err.statusCode = 409;
      throw err;
    }

    // Crear promoción
    const promocion = await tx.promocion.create({
      data: {
        loteId,
        precioAnterior,
        precioPromocional: body.precioPromocional,
        estadoAnterior: lote.estado,
        inicio: new Date(),
        fin: body.fin ? (typeof body.fin === 'string' ? new Date(body.fin) : body.fin) : null,
        activa: true,
        explicacion: body.explicacion || null,
      },
    });

    return promocion;
  });

  return resultado;
}

// ==============================
// Quitar promoción de un lote
// ==============================
export async function quitarPromocion(loteId: number) {
  // Buscar promoción activa del lote
  const promocion = await prisma.promocion.findFirst({
    where: {
      loteId,
      activa: true,
    },
  });

  if (!promocion) {
    const err: any = new Error('No existe una promoción activa para este lote');
    err.statusCode = 404;
    throw err;
  }

  // Ejecutar en transacción
  const resultado = await prisma.$transaction(async (tx) => {
    // Revertir lote: estado y precio anteriores
    await tx.lote.update({
      where: { id: loteId },
      data: {
        estado: promocion.estadoAnterior,
        precio: promocion.precioAnterior,
      },
    });

    // Marcar promoción como inactiva
    await tx.promocion.update({
      where: { id: promocion.id },
      data: {
        activa: false,
      },
    });

    return promocion;
  });

  return resultado;
}

// ==============================
// Obtener promoción activa de un lote
// ==============================
export async function getPromocionActiva(loteId: number, role?: string) {
  const promocion = await prisma.promocion.findFirst({
    where: {
      loteId,
      activa: true,
    },
    include: {
      lote: {
        select: {
          id: true,
          estado: true,
          precio: true,
        },
      },
    },
  });

  // Para INMOBILIARIA un lote NO_DISPONIBLE responde como sin promoción, igual que un lote
  // inexistente: no revela que el lote existe.
  if (role === 'INMOBILIARIA' && promocion?.lote.estado === EstadoLote.NO_DISPONIBLE) {
    return null;
  }
  return promocion;
}








