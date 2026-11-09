// Adapter de autenticación REAL contra el backend.
// Mantengo nombres en un solo lugar para que el Provider quede simple.

import { http, buildApiUrl as absUrl } from "../http/http";
import { setAccessToken, setRefreshToken, clearTokens } from "./token";

export const LOGIN_PATH = "/auth/login";
export const REFRESH_PATH = "/auth/refresh";
export const ME_PATH = "/auth/me";

// Normalizo campos para no acoplar el front al formato exacto del back
function normalizeAuthResponse(json) {
  if (!json || typeof json !== "object") return {};
  const accessToken =
    json.accessToken || json.access || json.token || json.jwt || null;
  const refreshToken =
    json.refreshToken || json.refresh || json.refresh_token || null;
  const user = json.user || json.usuario || null;
  return { accessToken, refreshToken, user };
}

// Login real: guarda tokens y devuelve el user
export async function apiLogin({ email, password }) {
  // Para login, no usamos http() porque no queremos que intente refresh automático
  const url = absUrl(LOGIN_PATH);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message || "Credenciales inválidas";
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  const payload = data?.data ?? data;

  const { accessToken, refreshToken, user } = normalizeAuthResponse(payload);
  if (!accessToken) throw new Error("Respuesta de login inválida (sin accessToken)");

  // Guardo tokens (http.js los usará para Authorization)
  setAccessToken(accessToken);
  if (refreshToken) setRefreshToken(refreshToken);

  // Devuelvo el usuario (si el back no lo manda, devolvemos {} y lo tratamos en el Provider)
  return user || {};
}

// Si algún día agregan refresh, esto quedará listo; hoy no se usa.
export async function apiRefresh() {
  const res = await http(REFRESH_PATH, { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    clearTokens();
    const err = new Error(data?.message || "No se pudo refrescar la sesión");
    err.status = res.status;
    throw err;
  }
  const payload = data?.data ?? data;
  const { accessToken } = normalizeAuthResponse(payload);
  if (!accessToken) throw new Error("Refresh inválido (sin accessToken)");
  setAccessToken(accessToken);
  return true;
}

// Tu back no tiene /me; no lo llamamos por ahora
export async function apiMe() {
  throw new Error("GET /auth/me no está disponible en el backend");
  /*
  const res = await http(ME_PATH, { method: "GET" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.message || "No pude obtener el usuario");
    err.status = res.status;
    throw err;
  }
  return data?.user || data */
}
