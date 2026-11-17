// src/lib/http/http.js
// Cliente HTTP con Authorization Bearer (sin cookies).
// - El backend no tiene refresh de sesión: un 401 significa token ausente, vencido o inválido.
// - Ante un 401 se limpia la sesión y se redirige a /login.
// - Solo el status decide: el texto del body nunca se interpreta como "sesión expirada"
//   (un mensaje de dominio como "…EXPIRADA…" o "Se expiraron…" no cierra la sesión).

import { getAccessToken, clearTokens } from "../auth/token";

// ---------------------------------------------------------------------
// Base de API:
// - En desarrollo, si la env apunta a localhost preferimos '/api' para pasar
//   por el proxy de Vite (evita CORS y puertos hardcodeados).
// - En producción usamos la absoluta si está definida. Si no, caemos a '/api'.
// - Si querés forzar absoluta en dev, poné VITE_API_FORCE_ABSOLUTE=true.
// ---------------------------------------------------------------------
const RAW_BASE  = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || "";
const FORCE_ABS = import.meta.env.VITE_API_FORCE_ABSOLUTE === "true";
const isLocalAbs = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(RAW_BASE);
const API_BASE = (import.meta.env.DEV && isLocalAbs && !FORCE_ABS) ? "/api" : (RAW_BASE || "/api");

// --- arma URL absoluta (acepta path absoluto o relativo)
function absUrl(path) {
  const isAbs = typeof path === "string" && /^https?:\/\//i.test(path);
  return isAbs ? path : `${API_BASE}${path}`;
}

// --- hace fetch con headers JSON + Authorization opcional
async function doFetch(url, { method, headers, body, access, ...rest }) {
  const baseHeaders = {
    "Content-Type": "application/json",
    ...(headers || {}),
    ...(access ? { Authorization: `Bearer ${access}` } : {}),
  };
  return fetch(url, {
    method,
    headers: baseHeaders,
    body: body != null ? JSON.stringify(body) : undefined,
    ...rest,
  });
}

// ---------------------------------------------------------------------
// http() → devuelve el Response. Un 401 cierra la sesión (limpia tokens y va a /login).
// ---------------------------------------------------------------------
export async function http(path, opts = {}) {
  const url = absUrl(path);
  const res = await doFetch(url, { ...opts, access: getAccessToken() });

  if (res.status === 401) {
    clearTokens();
    window.location.href = '/login';
    const err = new Error("Sesión expirada o inválida. Iniciá sesión de nuevo.");
    err.status = 401;
    throw err;
  }

  return res;
}

// ---------------------------------------------------------------------
// httpJson() → te da el JSON (objeto). No asume shape concreto.
// ---------------------------------------------------------------------
export async function httpJson(path, opts = {}) {
  const res = await http(path, opts);
  // si el back devolvió 204 o no-json, devolvemos objeto vacío
  const text = await res.text();
  try { return text ? JSON.parse(text) : {}; }
  catch { return {}; }
}

// ---------------------------------------------------------------------
// Helpers genéricos (reutilizables por cualquier módulo de API)
// ---------------------------------------------------------------------

// Devuelve SIEMPRE un array, normalizando respuestas tipo {data: []} o [].
export function normalizeApiListResponse(json) {
  if (Array.isArray(json)) return json;
  if (json?.data && Array.isArray(json.data)) return json.data;
  if (json?.items && Array.isArray(json.items)) return json.items;
  return [];
}

// Obtiene "listas" de cualquier endpoint con httpJson() y normaliza a array
export async function getList(path, opts) {
  const json = await httpJson(path, opts);
  return normalizeApiListResponse(json);
}

// Export util por si algún módulo necesita construir rutas absolutas
export const buildApiUrl = absUrl;
