// domain/loteState/loteState.effects.ts
// Side effects centralizados para cambios de estado de lote

import prisma from '../../config/prisma';
import { EstadoVenta, EstadoReserva, EstadoPrioridad } from '../../generated/prisma';

/**
 * Cancela todas las operaciones activas cuando un lote pasa a NO_DISPONIBLE
 * - Ventas no finalizadas (INICIADA, CON_BOLETO) → CANCELADA
 * - Reservas ACTIVA → CANCELADA
 * - Prioridades ACTIVA → CANCELADA
 * No toca reservas ACEPTADA ni ventas finalizadas (ESCRITURADO)
 */
export async function cancelActivesOnNoDisponible(loteId: number): Promise<void> {
  // Cancelar ventas no finalizadas
  await prisma.venta.updateMany({
    where: {
      loteId: loteId,
      estado: { in: [EstadoVenta.INICIADA, EstadoVenta.CON_BOLETO] },
    },
    data: { estado: EstadoVenta.CANCELADA },
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
 * Finaliza la prioridad activa del lote cuando se crea una reserva (reserva consume prioridad)
 */
export async function cancelPrioridadActivaOnReserva(loteId: number): Promise<void> {
  // Escritura condicionada: si otra transición ya cerró la prioridad (p. ej. expiró), no se pisa.
  await prisma.prioridad.updateMany({
    where: { loteId: loteId, estado: EstadoPrioridad.ACTIVA },
    data: { estado: EstadoPrioridad.FINALIZADA },
  });
}

