// src/lib/fechas.js
// Formateo de las fechas de calendario (YYYY-MM-DD) que devuelve el backend.

/**
 * Formatea una fecha de calendario como dd/mm/aaaa.
 *
 * Parte el string en lugar de usar `new Date`: `new Date("2026-11-23")` se interpreta como
 * medianoche UTC y en Buenos Aires (UTC-3) cae el día anterior, así que mostraría el 22.
 *
 * @param {string} ymd - Fecha YYYY-MM-DD (p. ej. el `corte` de un reporte)
 * @returns {string} dd/mm/aaaa, o "—" si no es una fecha de calendario válida
 */
export function fmtFechaCalendario(ymd) {
  if (typeof ymd !== "string") return "—";
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!partes) return "—";
  const [, anio, mes, dia] = partes;
  return `${dia}/${mes}/${anio}`;
}
