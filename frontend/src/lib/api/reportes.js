// src/lib/api/reportes.js
// API del módulo Reportes (contrato CCLF-37). Solo staff (ADMINISTRADOR y GESTOR).
//
// Con VITE_REPORTES_MOCK=true las tres funciones responden con datos simulados de
// ./reportes.mock.js (mismas formas y mismos errores 400 que la API). Cualquier otro valor,
// o la variable ausente, usa la API real: el mock no puede activarse por omisión.
//
// Todos los montos son string decimal con 2 cifras ("85000.00") y las fechas YYYY-MM-DD.
// La interfaz nunca recalcula cifras: muestra lo que devuelve el backend.

import { http } from "../http/http";

const BASE = "/reportes";

// import.meta.env se reemplaza al compilar: sin la variable, el import dinámico del mock
// queda como código muerto y no entra al bundle.
const USE_MOCK = import.meta.env.VITE_REPORTES_MOCK === "true";

/** Arma "?a=1&b=2" omitiendo los parámetros undefined, null o vacíos. */
function buildQuery(params = {}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/**
 * GET de un reporte. Devuelve el objeto `data` interno (no el sobre `{ success, data }`).
 * Si la respuesta no es 2xx lanza un Error con `statusCode` y `response` (el body del error).
 * @param {string} path - Ruta bajo /reportes (ej. "/ventas")
 * @param {object} params - Query params; los vacíos no se mandan
 * @param {"getInventario"|"getVentas"|"getCuotasVencidas"} mockFn - Función equivalente del mock
 * @param {string} fallbackMsg - Mensaje si el body de error no trae `message`
 */
async function getReporte(path, params, mockFn, fallbackMsg) {
  if (USE_MOCK) {
    const mock = await import("./reportes.mock");
    return mock[mockFn](params);
  }

  const res = await http(`${BASE}${path}${buildQuery(params)}`, { method: "GET" });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data?.message || fallbackMsg);
    err.statusCode = res.status;
    err.response = data;
    throw err;
  }

  return data?.data ?? data;
}

/**
 * Inventario de lotes (solo LOTE_VENTA) al día de corte.
 * @param {object} [filtros]
 * @param {number|string} [filtros.fraccion] - Id de fracción
 * @param {string} [filtros.estado] - EstadoLote (DISPONIBLE, EN_PROMOCION, RESERVADO, VENDIDO, ...)
 * @param {string} [filtros.subestado] - CONSTRUIDO | NO_CONSTRUIDO | EN_CONSTRUCCION
 * @returns {Promise<{
 *   corte: string,
 *   totales: {
 *     porEstado: Array<{estado: string, cantidad: number}>,
 *     porFraccion: Array<{fraccion: number, cantidad: number}>,
 *     porSubestado: Array<{subestado: string, cantidad: number}>,
 *     ofrecibles: number
 *   },
 *   filas: Array<{
 *     loteId: number, numero: string|null, fraccion: number, estado: string,
 *     subestado: string, precio: string|null, enlace: string
 *   }>
 * }>}
 */
export function getInventario({ fraccion, estado, subestado } = {}) {
  return getReporte(
    "/inventario",
    { fraccion, estado, subestado },
    "getInventario",
    "Error al obtener el reporte de inventario"
  );
}

/**
 * Ventas por período. `desde` y `hasta` son obligatorios (desde <= hasta, máximo 366 días).
 * @param {object} filtros
 * @param {string} filtros.desde - YYYY-MM-DD
 * @param {string} filtros.hasta - YYYY-MM-DD
 * @param {number|string} [filtros.fraccion] - Id de fracción
 * @returns {Promise<{
 *   corte: string,
 *   periodo: {desde: string, hasta: string},
 *   periodoAnterior: {desde: string, hasta: string},
 *   tarjetas: {
 *     iniciadas: TarjetaVentas, escrituradas: TarjetaVentas, canceladas: TarjetaVentas
 *   },
 *   otrasMonedas: Array<object>,
 *   filas: Array<{
 *     ventaId: number, numero: string, loteId: number, lote: string, fraccion: number,
 *     fechaAlta: string, fechaEscritura: string|null, fechaCancelacion: string|null,
 *     estado: string, montoUSD: string, enlace: string
 *   }>
 * }>}
 * @typedef {{cantidad: number, montoUSD: string, cantidadAnterior: number, montoUSDAnterior: string}} TarjetaVentas
 */
export function getVentas({ desde, hasta, fraccion } = {}) {
  return getReporte(
    "/ventas",
    { desde, hasta, fraccion },
    "getVentas",
    "Error al obtener el reporte de ventas"
  );
}

/**
 * Cuotas vencidas en una sola moneda (ARS y USD nunca se mezclan). `moneda` es obligatoria.
 * `diasAtraso` y `tramo` los calcula el backend.
 * @param {object} filtros
 * @param {"ARS"|"USD"} filtros.moneda
 * @param {number|string} [filtros.fraccion] - Id de fracción
 * @returns {Promise<{
 *   corte: string,
 *   moneda: "ARS"|"USD",
 *   saldoVencido: string,
 *   cuotas: number,
 *   ventas: number,
 *   tramos: Array<{tramo: "1-30"|"31-60"|"+60", cuotas: number, saldo: string}>,
 *   filas: Array<{
 *     cuotaId: number, ventaId: number, ventaNumero: string, loteId: number, lote: string,
 *     fraccion: number, numeroCuota: number, cantidadCuotas: number, fechaVencimiento: string,
 *     diasAtraso: number, tramo: "1-30"|"31-60"|"+60", saldoPendiente: string, enlace: string
 *   }>
 * }>}
 */
export function getCuotasVencidas({ moneda, fraccion } = {}) {
  return getReporte(
    "/cuotas-vencidas",
    { moneda, fraccion },
    "getCuotasVencidas",
    "Error al obtener el reporte de cuotas vencidas"
  );
}
