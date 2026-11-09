// src/lib/http/http.js
// Cliente HTTP con Authorization + refresh automático.
// - Si el access vence (401 o body "Token expirado"), llama /auth/refresh.
// - El refresh viaja en el body (sin cookies: la auth es Bearer en Authorization).
// - Reintenta UNA vez la request original con el nuevo access.
// - Comentarios concisos para mantenimiento.

import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
} from "../auth/token";

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

const LOGIN_PATH   = import.meta.env.VITE_AUTH_LOGIN_PATH || "/auth/login";
const REFRESH_PATH = import.meta.env.VITE_AUTH_REFRESH_PATH || "/auth/refresh";

// Evita múltiples refresh en paralelo
let refreshingPromise = null;

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

// --- llama refresh y guarda tokens (acepta ruta absoluta o relativa)
async function refreshTokens() {
  // 1) si ya hay un refresh en curso, lo esperamos
  if (refreshingPromise) return refreshingPromise;

  // 2) validamos que exista refresh token (cookie o local)
  const refresh = getRefreshToken();
  if (!refresh) {
    clearTokens();
    window.location.href = '/login';
    throw new Error("NoRefreshToken");
  }

  const refreshUrl = absUrl(REFRESH_PATH);
  refreshingPromise = (async () => {
    const res = await fetch(refreshUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });

    if (!res.ok) {
      clearTokens();
      window.location.href = '/login';
      throw new Error(`RefreshFail ${res.status}`);
    }
    const json = await res.json().catch(() => ({}));
    if (!json?.access && !json?.token) {
      clearTokens();
      window.location.href = '/login';
      throw new Error("RefreshMissingAccess");
    }

    // normalizamos por si el back devuelve "token" en vez de "access"
    setTokens({ access: json.access || json.token, refresh: json.refresh || refresh });
    return json;
  })();

  try {
    const result = await refreshingPromise;
    return result;
  } finally {
    refreshingPromise = null;
  }
}

// ---------------------------------------------------------------------
// http() → devuelve el Response. Maneja 401/refresh y reintenta UNA vez.
// ---------------------------------------------------------------------
export async function http(path, opts = {}) {
  const url = absUrl(path);
  let access = getAccessToken();

  // 1) primer intento
  let res = await doFetch(url, { ...opts, access });

  // 2) si cayó por 401/expirado, intento de refresh + retry UNA sola vez
  const needsRefresh =
    res.status === 401 ||
    (res.headers.get("content-type")?.includes("application/json") &&
      (await res.clone().json().catch(() => null))?.message?.toLowerCase?.().includes("expir"));

  if (needsRefresh) {
    try {
      await refreshTokens();
      access = getAccessToken();
      res = await doFetch(url, { ...opts, access });
    } catch (e) {
      // refresh falló → limpiamos tokens y redirigimos al login
      clearTokens();
      window.location.href = '/login';
      throw e;
    }
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
