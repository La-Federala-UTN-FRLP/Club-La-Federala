// Centralizo el manejo de tokens. Uso localStorage por simpleza.
// Claves configurables vía .env o valores por defecto.

const ACCESS_KEY  = import.meta.env.VITE_AUTH_TOKEN_KEY || "lf_token";

// === Lectura ===
// Leo el access token para la cabecera Authorization
export function getAccessToken() {
  return localStorage.getItem(ACCESS_KEY);
}

// === Escritura (exports que esperaba api.js) ===
// Guardo SOLO el access token
export function setAccessToken(token) {
  if (typeof token === "string") localStorage.setItem(ACCESS_KEY, token);
}

// === Limpieza ===
// Borro el token (logout)
export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
}
