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

// Si la pantalla está con datos simulados. Lo necesita el botón de exportar, que no puede
// inventar un .xlsx. Se borra junto con el mock en 39.6.
export const REPORTES_EN_MOCK = USE_MOCK;

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
 * Error de una respuesta que no es 2xx, con la forma que esperan `parseApiError` y las vistas:
 * el mensaje del backend si vino uno, y el status y el cuerpo colgados del Error.
 *
 * @param {object} data - Cuerpo ya parseado, o `{}` si no era JSON
 * @param {number} status
 * @param {string} fallbackMsg - Mensaje cuando el cuerpo no trae `message`
 */
function errorDeRespuesta(data, status, fallbackMsg) {
  const err = new Error(data?.message || fallbackMsg);
  err.statusCode = status;
  err.response = data;
  return err;
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

  if (!res.ok) throw errorDeRespuesta(data, res.status, fallbackMsg);

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
 *     porFraccion: Array<{fraccionId: number, fraccion: number, cantidad: number, ofrecibles: number}>,
 *     porSubestado: Array<{subestado: string, cantidad: number}>,
 *     ofrecibles: number
 *   },
 *   filas: Array<{
 *     loteId: number, numero: number|null, fraccionId: number, fraccion: number, estado: string,
 *     subestado: string, precio: string|null, enlace: string
 *   }>
 * }>} `fraccionId` es el id (el que se usa para filtrar); `fraccion`, el número visible.
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
 *
 * Cada tarjeta cuenta la venta por su propia fecha, así que una venta puede sumar en hasta
 * tres: `iniciadas` por la fecha de alta, en cualquier estado; `escrituradas` por la fecha de
 * escritura real y solo si la venta está ESCRITURADO; `canceladas` por la fecha de cancelación
 * y solo si está CANCELADA. `periodoAnterior` es el tramo de la misma cantidad de días que
 * termina el día anterior a `desde`.
 *
 * `tarjetas` cuenta únicamente las ventas en USD; si no hay ninguna, vienen en cero, no
 * ausentes. Cada moneda distinta de USD con movimiento en alguno de los dos períodos va en
 * `otrasMonedas`, con sus propias tres tarjetas, sin convertir ni sumar a USD. `filas` trae
 * las ventas de cualquier moneda que sumen en alguna tarjeta del período elegido.
 *
 * @param {object} filtros
 * @param {string} filtros.desde - YYYY-MM-DD
 * @param {string} filtros.hasta - YYYY-MM-DD
 * @param {number|string} [filtros.fraccion] - Id de fracción (no el número visible)
 * @returns {Promise<{
 *   corte: string,
 *   periodo: {desde: string, hasta: string},
 *   periodoAnterior: {desde: string, hasta: string},
 *   tarjetas: {
 *     iniciadas: TarjetaVentas, escrituradas: TarjetaVentas, canceladas: TarjetaVentas
 *   },
 *   otrasMonedas: Array<{
 *     moneda: "ARS"|"USD",
 *     iniciadas: TarjetaOtraMoneda,
 *     escrituradas: TarjetaOtraMoneda,
 *     canceladas: TarjetaOtraMoneda
 *   }>,
 *   filas: Array<{
 *     ventaId: number, numero: string, loteId: number, loteNumero: number|null,
 *     fraccionId: number, fraccion: number, estado: string, fechaAlta: string,
 *     fechaEscritura: string|null, fechaCancelacion: string|null, moneda: "ARS"|"USD",
 *     monto: string, enlace: string
 *   }>
 * }>} `monto` está en `moneda`, la del plan de pagos de la venta (USD si no tiene plan): no
 *   hay un total que mezcle monedas. `fraccionId` es el id; `fraccion`, el número visible.
 * @typedef {{cantidad: number, montoUSD: string, cantidadAnterior: number, montoUSDAnterior: string}} TarjetaVentas
 * @typedef {{cantidad: number, monto: string, cantidadAnterior: number, montoAnterior: string}} TarjetaOtraMoneda
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
 *     cuotaId: number, ventaId: number, ventaNumero: string, loteId: number,
 *     loteNumero: number|null, fraccion: number, numeroCuota: number, cantidadCuotas: number, fechaVencimiento: string,
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

// Lo que tiene que decir el `Content-Type` de un .xlsx. Se busca por fragmento y no por igualdad
// porque la cabecera puede venir con charset o con otros parámetros pegados.
const TIPO_XLSX = "spreadsheetml.sheet";

// El backend valida el nombre contra /^[A-Za-z0-9._-]+\.xlsx$/ antes de escribir la cabecera, así
// que no hay comillas internas, ni espacios, ni `filename*=`: esta regex alcanza y, por estricta,
// no se queda con nada que no sea un nombre de archivo esperable.
const NOMBRE_EN_DISPOSITION = /filename="?([A-Za-z0-9._-]+\.xlsx)"?/;

/**
 * Exporta un reporte a Excel. Mismos parámetros, validaciones y roles que su gemelo JSON: el
 * backend arma el archivo con el mismo service, así que las filas coinciden con las de la vista.
 *
 * Con el mock no se exporta nada: simular un .xlsx necesitaría una librería nueva, y un archivo
 * inventado por el frontend no probaría que coincide con la pantalla.
 *
 * @param {"inventario"|"ventas"|"cuotas-vencidas"} ruta
 * @param {object} filtros - Los filtros aplicados, tal cual; `buildQuery` saltea los vacíos
 * @returns {Promise<{blob: Blob, nombre: string|null}>} `nombre` es el del backend, o null si la
 *   cabecera no llegó o no se pudo leer: quien llama pone el suyo.
 */
export async function exportarReporte(ruta, filtros = {}) {
  if (USE_MOCK) throw new Error("La exportación no está disponible con datos simulados");

  const res = await http(`${BASE}/${ruta}.xlsx${buildQuery(filtros)}`, { method: "GET" });

  // Un error nunca viene en binario: ante validación fallida, sin token o sin rol, el backend
  // responde el JSON de error. Por eso se mira `res.ok` antes de tocar el cuerpo como archivo.
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw errorDeRespuesta(data, res.status, "Error al exportar el reporte");
  }

  // Un 200 que no es un libro de Excel (un proxy devolviendo HTML, por ejemplo) no se baja como
  // si lo fuera: se abriría roto y parecería un archivo corrupto en lugar de un problema de red.
  if (!(res.headers.get("Content-Type") ?? "").includes(TIPO_XLSX)) {
    throw new Error("La respuesta no es un archivo de Excel");
  }

  const nombre = NOMBRE_EN_DISPOSITION.exec(res.headers.get("Content-Disposition") ?? "")?.[1];

  return { blob: await res.blob(), nombre: nombre ?? null };
}

/**
 * Catálogo de fracciones para los filtros de los reportes, ordenado por número visible.
 *
 * `id` es lo que esperan los endpoints en su parámetro `fraccion`; `numero` es lo que se
 * muestra. No son lo mismo y no deben intercambiarse.
 *
 * Pega a GET /fracciones con el mismo patrón que los reportes en lugar de reusar el adaptador
 * `lib/api/fracciones.js`: ese atrapa todo y devuelve una lista vacía con `success: true`, así
 * que un 403 o un 500 se vería en la pantalla como "no hay fracciones" en vez de como un error.
 *
 * @returns {Promise<Array<{id: number, numero: number}>>}
 */
export async function getFraccionesReporte() {
  if (USE_MOCK) {
    const mock = await import("./reportes.mock");
    return mock.getFracciones();
  }

  const res = await http("/fracciones", { method: "GET" });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data?.message || "Error al obtener las fracciones");
    err.statusCode = res.status;
    err.response = data;
    throw err;
  }

  // El endpoint responde { success, message, fracciones, total }: la lista va plana, no en `data`.
  // El backend mapea Fraccion.id a `idFraccion`; se tolera `id` por si eso cambia.
  const lista = data?.fracciones ?? data?.data?.fracciones ?? [];
  return lista
    .map((f) => ({ id: Number(f.idFraccion ?? f.id), numero: Number(f.numero) }))
    .filter((f) => Number.isFinite(f.id) && Number.isFinite(f.numero))
    .sort((a, b) => a.numero - b.numero);
}
