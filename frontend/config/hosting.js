// Preparar un artefacto no confirma que la URL esté aprobada por C2.
export function validateHostingEnv(env) {
  let url;
  try {
    url = new URL(env.VITE_API_BASE_URL);
  } catch {
    throw new Error("Hosting requiere VITE_API_BASE_URL absoluta HTTPS con /api, aprobada por C2.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      !/^\/api\/?$/.test(url.pathname) ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("Hosting requiere una base HTTPS remota con /api, sin credenciales, query ni fragmento.");
  }
  for (const flag of ["VITE_REPORTES_MOCK", "VITE_AUTH_USE_MOCK", "VITE_RBAC_DISABLE_UI"]) {
    if (env[flag] && env[flag] !== "false") {
      throw new Error(`Hosting requiere ${flag} ausente o false.`);
    }
  }
}
