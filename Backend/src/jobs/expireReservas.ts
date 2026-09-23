// src/jobs/expireReservas.ts
// Job para expirar reservas vencidas automáticamente
import prisma from '../config/prisma';
import { EstadoOperativo, EstadoReserva } from '../generated/prisma';
import { updateReserva } from '../services/reserva.service';

/**
 * Expira reservas vencidas
 * Busca reservas ACTIVA cuya fecha de fin haya pasado y las marca como EXPIRADA.
 * Utiliza updateReserva para garantizar que se disparen los efectos secundarios (restaurar lote).
 * 
 * @returns {Promise<number>} Cantidad de reservas expiradas
 */
export async function expireReservas(): Promise<number> {
  const now = new Date();
  
  console.log(`[expireReservas] Iniciando expiración de reservas - ${now.toISOString()}`);
  
  // Buscar reservas ACTIVA, ACEPTADA o CONTRAOFERTA vencidas y NO consumidas por venta
  const reservasVencidas = await prisma.reserva.findMany({
    where: {
      estado: { in: [EstadoReserva.ACTIVA, EstadoReserva.ACEPTADA, EstadoReserva.CONTRAOFERTA] },
      fechaFinReserva: {
        lte: now,
      },
      ventaId: null, // Asegurar que no esté consumida
      estadoOperativo: EstadoOperativo.OPERATIVO,
    },
    select: { id: true, loteId: true, estado: true }
  });

  console.log(`[expireReservas] Encontradas ${reservasVencidas.length} reservas vencidas`);

  if (reservasVencidas.length === 0) {
    console.log(`[expireReservas] No hay reservas vencidas. Finalizando.`);
    return 0;
  }

  let expiradas = 0;

  // Procesar cada reserva vencida
  // No usamos transacción global porque updateReserva ya maneja su lógica y queremos que si una falla, las otras sigan
  for (const reserva of reservasVencidas) {
    try {
      // Usamos el servicio updateReserva para aprovechar la validación y restauración de lote
      await updateReserva(reserva.id, { 
        estado: EstadoReserva.EXPIRADA 
      });

      expiradas++;
      console.log(`[expireReservas] Reserva ${reserva.id} expirada (Lote ${reserva.loteId})`);
    } catch (error) {
      console.error(`[expireReservas] Error al expirar reserva ${reserva.id}:`, error);
      // Continuar con las siguientes
    }
  }

  console.log(`[expireReservas] Finalizando. ${expiradas} reservas expiradas exitosamente`);
  return expiradas;
}
