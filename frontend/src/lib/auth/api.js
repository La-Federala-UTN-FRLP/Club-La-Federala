// Adapter de autenticación REAL contra el backend.
// Mantengo nombres en un solo lugar para que el Provider quede simple.

import { buildApiUrl as absUrl } from "../http/http";
import { setAccessToken } from "./token";

export const LOGIN_PATH = "/auth/login";

// Normalizo campos para no acoplar el front al formato exacto del back
function normalizeAuthResponse(json) {
  if (!json || typeof json !== "object") return {};
  const accessToken =
    json.accessToken || json.access || json.token || json.jwt || null;
  const user = json.user || json.usuario || null;
  return { accessToken, user };
}

// Login real: guarda tokens y devuelve el user
export async function apiLogin({ email, password }) {
  // Para login no usamos http(): un 401 acá es "credenciales inválidas" y lo informa el Provider,
  // no una sesión vencida que deba redirigir a /login.
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

  const { accessToken, user } = normalizeAuthResponse(payload);
  if (!accessToken) throw new Error("Respuesta de login inválida (sin accessToken)");

  // Guardo tokens (http.js los usará para Authorization)
  setAccessToken(accessToken);

  // Devuelvo el usuario (si el back no lo manda, devolvemos {} y lo tratamos en el Provider)
  return user || {};
}
