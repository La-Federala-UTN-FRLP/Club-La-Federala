import { Prisma } from '../generated/prisma';

/**
 * Representación segura de un error para el log del servidor.
 *
 * El objeto error completo no se imprime: un PrismaClientValidationError incluye en su mensaje los
 * argumentos de la query (datos de negocio, hashes), y un error de conexión puede citar la DSN.
 *
 * - Errores de Prisma: nombre, código, clientVersion, metadata de identificadores (modelo, campos,
 *   constraint) y solo los frames del stack. Nunca el mensaje (puede traer la query y sus argumentos).
 * - Otros Error: nombre, código, mensaje y stack con credenciales/tokens redactados.
 * - Valores que no son Error: solo el tipo (y las claves si es un objeto), nunca los valores.
 */
export type SafeErrorLog = {
    name: string;
    code?: string;
    clientVersion?: string;
    meta?: Record<string, unknown>;
    message?: string;
    stack?: string;
    type?: string;
    keys?: string[];
};

const PRISMA_ERROR_CLASSES = [
    Prisma.PrismaClientKnownRequestError,
    Prisma.PrismaClientUnknownRequestError,
    Prisma.PrismaClientValidationError,
    Prisma.PrismaClientInitializationError,
    Prisma.PrismaClientRustPanicError,
];

// Metadata de Prisma que identifica estructura (no valores de negocio).
const PRISMA_META_KEYS = ['modelName', 'target', 'field_name', 'constraint'];

const REDACTIONS: ReadonlyArray<[RegExp, string]> = [
    // Credenciales embebidas en URLs/DSN: postgres://user:pass@host → postgres://***:***@host
    [/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]*@/gi, '$1***:***@'],
    // Header Authorization
    [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer ***'],
    // JWT sueltos (header.payload.signature en base64url)
    [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '***jwt***'],
];

export function redactSecrets(text: string): string {
    return REDACTIONS.reduce((acc, [re, replacement]) => acc.replace(re, replacement), text);
}

/** Solo las líneas "at ..." del stack: sin la primera línea, que repite el mensaje. */
function stackFrames(stack: unknown): string | undefined {
    if (typeof stack !== 'string') return undefined;
    const frames = stack.split('\n').filter((line) => /^\s+at\s/.test(line));
    return frames.length > 0 ? redactSecrets(frames.join('\n')) : undefined;
}

function isPrismaError(err: unknown): boolean {
    return PRISMA_ERROR_CLASSES.some((cls) => err instanceof cls);
}

export function safeErrorForLog(err: unknown): SafeErrorLog {
    if (isPrismaError(err)) {
        const e = err as Error & { code?: unknown; errorCode?: unknown; clientVersion?: unknown; meta?: Record<string, unknown> };
        const code = typeof e.code === 'string' ? e.code : typeof e.errorCode === 'string' ? e.errorCode : undefined;
        const meta = e.meta
            ? Object.fromEntries(PRISMA_META_KEYS.filter((k) => k in e.meta!).map((k) => [k, e.meta![k]]))
            : undefined;
        return {
            name: e.name,
            ...(code && { code }),
            ...(typeof e.clientVersion === 'string' && { clientVersion: e.clientVersion }),
            ...(meta && Object.keys(meta).length > 0 && { meta }),
            ...(stackFrames(e.stack) && { stack: stackFrames(e.stack) }),
        };
    }

    if (err instanceof Error) {
        const code = (err as Error & { code?: unknown }).code;
        return {
            name: err.name,
            ...(typeof code === 'string' && { code }),
            message: redactSecrets(err.message),
            ...(stackFrames(err.stack) && { stack: stackFrames(err.stack) }),
        };
    }

    if (err !== null && typeof err === 'object') {
        return { name: 'NonError', type: 'object', keys: Object.keys(err).slice(0, 20) };
    }
    return { name: 'NonError', type: typeof err };
}
