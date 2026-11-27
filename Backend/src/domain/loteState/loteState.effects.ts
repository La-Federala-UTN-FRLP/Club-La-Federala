// domain/loteState/loteState.effects.ts
// Side effects centralizados para cambios de estado de lote

import prisma from '../../config/prisma';
import { EstadoVenta, EstadoReserva, EstadoPrioridad, type Prisma } from '../../generated/prisma';

/**
 * Cancela todas las operaciones activas cuando un lote pasa a NO_DISPONIBLE
 * - Ventas no finalizadas (INICIADA, CON_BOLETO) → CANCELADA
 * - Reservas ACTIVA → CANCELADA
 * - Prioridades ACTIVA → CANCELADA
 * No toca reservas ACEPTADA ni ventas finalizadas (ESCRITURADO)
 *
 * Una venta en curso OPERATIVA bloquea antes el pase a No Disponible (updatedLote, bug QA 24), así
 * que acá solo llegan ventas en curso dadas de baja. Si se cancela alguna, queda con fecha y motivo.
 */
export const MOTIVO_CANCELACION_LOTE_NO_DISPONIBLE = 'Lote pasado a No Disponible';

export async function cancelActivesOnNoDisponible(loteId: number): Promise<void> {
  // Cancelar ventas no finalizadas
  await prisma.venta.updateMany({
    where: {
      loteId: loteId,
      estado: { in: [EstadoVenta.INICIADA, EstadoVenta.CON_BOLETO] },
    },
    data: {
      estado: EstadoVenta.CANCELADA,
      fechaCancelacion: new Date(),
      motivoCancelacion: MOTIVO_CANCELACION_LOTE_NO_DISPONIBLE,
    },
  });

  // Cancelar reservas ACTIVA
  await prisma.reserva.updateMany({
    where: {
      loteId: loteId,
      estado: EstadoReserva.ACTIVA,
    },
    data: { estado: EstadoReserva.CANCELADA },
  });

  // Cancelar prioridades ACTIVA
  await prisma.prioridad.updateMany({
    where: {
      loteId: loteId,
      estado: EstadoPrioridad.ACTIVA,
    },
    data: { estado: EstadoPrioridad.CANCELADA },
  });
}

/**
 * Finaliza la prioridad activa del lote cuando se crea una venta
 */
export async function finalizePrioridadActivaOnVenta(loteId: number): Promise<void> {
  // Escritura condicionada: si otra transición ya cerró la prioridad (p. ej. expiró), no se pisa.
  await prisma.prioridad.updateMany({
    where: { loteId: loteId, estado: EstadoPrioridad.ACTIVA },
    data: { estado: EstadoPrioridad.FINALIZADA },
  });
}

/**
 * Finaliza la prioridad activa del lote cuando se crea una reserva (reserva consume prioridad).
 * Recibe la transacción de createReserva: la prioridad queda FINALIZADA de forma atómica con la
 * reserva (si algo falla, no queda una reserva creada con la prioridad activa).
 */
export async function cancelPrioridadActivaOnReserva(
  loteId: number,
  tx: Prisma.TransactionClient,
): Promise<void> {
  // Escritura condicionada: si otra transición ya cerró la prioridad (p. ej. expiró), no se pisa.
  await tx.prioridad.updateMany({
    where: { loteId: loteId, estado: EstadoPrioridad.ACTIVA },
    data: { estado: EstadoPrioridad.FINALIZADA },
  });
}

