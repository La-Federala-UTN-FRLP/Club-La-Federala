import type { Request } from 'express';
import { isIP } from 'node:net';
import { rateLimit, ipKeyGenerator, type Options } from 'express-rate-limit';

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
// Store: MemoryStore (por proceso). Alcanza con la única instancia actual del servicio.
// Si el servicio escala a varias instancias, cada una contaría por separado: migrar a un
// store compartido (p. ej. Render Key Value / Redis).
// ─────────────────────────────────────────────────────────────────────────────

const RENDER_CLIENT_IP_HEADER = 'cf-connecting-ip';
// Último recurso si el request no trae ninguna dirección: bucket compartido, no aleatorio.
const UNKNOWN_CLIENT = 'unknown-client';

type Env = Record<string, string | undefined>;

/** IP del header de Render solo si es exactamente una dirección IP válida. */
function renderClientIp(req: Request): string | null {
    const raw = req.headers[RENDER_CLIENT_IP_HEADER];
    if (typeof raw !== 'string') return null; // ausente o repetido (array)
    const ip = raw.trim();
    return isIP(ip) ? ip : null;
}

/**
 * Key del rate limit de login para este request. Pura y determinista: no depende de JWT,
 * req.user ni del email. ipKeyGenerator normaliza IPv4-mapped a IPv4 y agrupa IPv6 por /56.
 */
export function loginClientKey(req: Request, env: Env = process.env): string {
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
            // Solo el evento, la ruta y la key ya calculada (IP o subred /56). Nunca el body
            // (email/password) ni headers (Authorization).
            console.warn(`[RATE_LIMIT] ${options.statusCode} ${req.method} ${req.originalUrl.split('?')[0]} key=${loginClientKey(req)}`);
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
