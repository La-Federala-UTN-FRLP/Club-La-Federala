// src/lib/fechas.js
// Formateo de las fechas de calendario (YYYY-MM-DD) que devuelve el backend.
// También la aritmética de días de negocio que usan los filtros de período de los reportes.

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

/**
 * Zona de negocio del club. El backend calcula el día de corte en esta zona
 * (`ZONA_NEGOCIO` de reporte.service.ts), así que el frontend usa la misma para que "hoy"
 * signifique lo mismo en los dos lados.
 */
const ZONA_NEGOCIO = "America/Argentina/Buenos_Aires";

const MS_POR_DIA = 86_400_000;

/**
 * Hoy en Buenos Aires, YYYY-MM-DD: el mismo día que el backend informa como `corte`.
 *
 * `en-CA` formatea como YYYY-MM-DD, igual que `fechaCorte()` del backend.
 *
 * @returns {string} YYYY-MM-DD
 */
export function hoyNegocio() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_NEGOCIO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Suma (o resta, con un número negativo) días a una fecha de calendario.
 *
 * `Date.parse` de un "YYYY-MM-DD" da medianoche UTC y `toISOString` vuelve a UTC, así que la
 * cuenta no pasa por la zona local y el día no se corre.
 *
 * @param {string} ymd - Fecha YYYY-MM-DD
 * @param {number} dias - Días a sumar
 * @returns {string} YYYY-MM-DD
 */
export function sumarDias(ymd, dias) {
  return new Date(Date.parse(ymd) + dias * MS_POR_DIA).toISOString().slice(0, 10);
}

/**
 * Días de calendario entre dos fechas, con los dos extremos incluidos: de un día a sí mismo
 * da 1. Es la misma cuenta que `diasInclusivos` del backend, de la que dependen el máximo del
 * período y la duración del tramo anterior.
 *
 * @param {string} desde - YYYY-MM-DD
 * @param {string} hasta - YYYY-MM-DD
 * @returns {number}
 */
export function diasInclusivos(desde, hasta) {
  return Math.round((Date.parse(hasta) - Date.parse(desde)) / MS_POR_DIA) + 1;
}

/**
 * ¿Es un día de calendario válido y existente?
 *
 * No alcanza con el formato: "2026-02-30" lo cumple, pero no existe. `Date` lo normalizaría al
 * 2 de marzo, así que se compara lo que sale con lo que entró.
 *
 * @param {string} ymd
 * @returns {boolean}
 */
export function esFechaCalendario(ymd) {
  if (typeof ymd !== "string") return false;
  const limpio = ymd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(limpio)) return false;
  const instante = Date.parse(`${limpio}T00:00:00Z`);
  if (Number.isNaN(instante)) return false;
  return new Date(instante).toISOString().slice(0, 10) === limpio;
}
