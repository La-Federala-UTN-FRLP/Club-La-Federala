// src/utils/loteStates.js
// Estados de lote desde los que se puede crear una reserva.
// Debe coincidir con Backend/src/services/reserva.service.ts (createReserva).
export const ESTADOS_LOTE_RESERVABLES = ["DISPONIBLE", "EN_PROMOCION", "CON_PRIORIDAD"];

const normalizeEstado = (estado) =>
  String(estado ?? "").trim().toUpperCase().replace(/\s+/g, "_");

/**
 * @param {string|null|undefined} estado - Estado del lote
 * @returns {boolean} true si el lote admite crear una reserva
 */
export function isLoteReservable(estado) {
  return ESTADOS_LOTE_RESERVABLES.includes(normalizeEstado(estado));
}
