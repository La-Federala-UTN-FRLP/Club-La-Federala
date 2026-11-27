import type { Request } from 'express';
import { isIP } from 'node:net';
import { rateLimit, ipKeyGenerator, type Options } from 'express-rate-limit';
import { cloudRunDirectIpCandidate } from '../utils/loginClientIp';

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiting de POST /api/auth/login (solo esa ruta; no es un limiter global).
//
// Identidad del cliente (sin tocar el `trust proxy` global de Express):
//
//  · RENDER=true (Render lo define en sus servicios) → header CF-Connecting-IP.
//    Todo el tráfico público de un web service de Render pasa por Cloudflare, que escribe
//    CF-Connecting-IP en cada request y SOBRESCRIBE lo que mande el cliente.
//    X-Forwarded-For NO se usa: Cloudflare agrega entradas en lugar de reemplazarlo, así que
//    su lado izquierdo lo controla quien llama (rotarlo abriría buckets nuevos = bypass).
//    Este contrato es específico de Render: si el backend se muda (p. ej. Cloud Run),
//    hay que revalidar de dónde sale la IP del cliente antes de reutilizarlo.
//
//  · Header ausente o inválido, o fuera de Render → req.ip (dirección del socket, porque
//    trust proxy sigue en false). En Render eso es la IP del proxy: un bucket compartido,
//    más restrictivo, pero nunca una key elegida por el cliente.
//
// LOGIN_CLIENT_IP_MODE=cloud-run-direct es experimental y exige aceptar/verificar H1;
// no se activa por K_SERVICE ni por estar en Cloud Run. Legacy sigue siendo el default.
// Store: MemoryStore por proceso. Pierde contadores al reiniciar y los separa entre
// procesos/revisiones. Un máximo nominal de una instancia no garantiza persistencia
// ni una cuota agregada estricta. C1 sigue bloqueado hasta validación y aprobación.
// ─────────────────────────────────────────────────────────────────────────────

const RENDER_CLIENT_IP_HEADER = 'cf-connecting-ip';
// Último recurso si el request no trae ninguna dirección: bucket compartido, no aleatorio.
const UNKNOWN_CLIENT = 'unknown-client';
// Fuera del namespace de candidatos válidos; no acredita identidad ni cumplimiento C1.
export const UNVERIFIED_LOGIN_CLIENT_KEY = 'unverified';

type Env = Record<string, string | undefined>;

/** IP del header de Render solo si es exactamente una dirección IP válida. */
function renderClientIp(req: Request): string | null {
    const raw = req.headers[RENDER_CLIENT_IP_HEADER];
    if (typeof raw !== 'string') return null; // ausente o repetido (array)
    const ip = raw.trim();
    return isIP(ip) ? ip : null;
}

/**
 * Key del rate limit de login para este request. Determinista para el entorno dado: no depende de JWT,
 * req.user ni del email. ipKeyGenerator normaliza IPv4-mapped a IPv4 y agrupa IPv6 por /56.
 */
export function loginClientKey(req: Request, env: Env = process.env): string {
    const mode = env.LOGIN_CLIENT_IP_MODE || 'legacy';
    if (mode !== 'legacy') {
        // parseWebEnv rechaza estos estados al arrancar. Degradación constante si
        // un llamador directo omite la validación; nunca confiar en otro header.
        if (mode !== 'cloud-run-direct' || env.RENDER === 'true') return UNVERIFIED_LOGIN_CLIENT_KEY;
        const candidate = cloudRunDirectIpCandidate(req);
        return candidate.kind === 'candidate'
            ? `cloud-run-direct:${ipKeyGenerator(candidate.ip, 56)}`
            : UNVERIFIED_LOGIN_CLIENT_KEY;
    }
    if (env.RENDER === 'true') {
        const ip = renderClientIp(req);
        if (ip) return ipKeyGenerator(ip);
    }
    const local = req.ip || req.socket?.remoteAddress;
    return local ? ipKeyGenerator(local) : UNKNOWN_CLIENT;
}

export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_RATE_LIMIT_MAX_FAILED = 10;

/** Limiter de login. Overrides solo para tests que necesiten otra política. */
export function createLoginRateLimiter(overrides: Partial<Options> = {}) {
    return rateLimit({
        windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
        limit: LOGIN_RATE_LIMIT_MAX_FAILED,
        // Solo cuentan los intentos fallidos (status >= 400): un login correcto se descuenta.
        skipSuccessfulRequests: true,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        keyGenerator: (req) => loginClientKey(req),
        handler: (req, res, _next, options) => {
            // Ruta fija: nunca IP/subred/key, método/URL manipulables, body ni headers.
            console.warn(`[RATE_LIMIT] ${options.statusCode} POST /api/auth/login`);
            res.status(options.statusCode).json({
                success: false,
                code: 'TOO_MANY_REQUESTS',
                message: 'Demasiados intentos de inicio de sesión. Intentá nuevamente más tarde.',
            });
        },
        ...overrides,
    });
}

export const loginRateLimiter = createLoginRateLimiter();
