// src/jobs/expirePrioridades.ts
// Job para expirar prioridades vencidas automáticamente
import { expirePrioridadesVencidas } from '../services/prioridad.service';

/**
 * Expira prioridades vencidas (D3).
 * Delega en expirePrioridadesVencidas, la misma operación que usa el endpoint manual
 * POST /api/prioridades/jobs/expire: prioridad ACTIVA vencida → EXPIRADA y lote restaurado,
 * de forma transaccional y sin pisar prioridades que ya no estén ACTIVA.
 *
 * @returns {Promise<number>} Cantidad de prioridades expiradas
 */
export async function expirePrioridades(): Promise<number> {
  const now = new Date();
  console.log(`[expirePrioridades] Iniciando expiración de prioridades - ${now.toISOString()}`);

  const { expired } = await expirePrioridadesVencidas(now);

  console.log(`[expirePrioridades] Prioridades expiradas: ${expired}`);
  return expired;
}
