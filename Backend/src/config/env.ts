import { z } from 'zod';
import jwt from 'jsonwebtoken';
import type { LoginClientIpMode } from '../utils/loginClientIp';
import { parseLoginObservation, type ObservationConfig } from './loginObservation';

// HS256 (algoritmo por defecto de jsonwebtoken) requiere una clave de al menos 256 bits
// (RFC 7518 §3.2): 32 caracteres. Se exige solo en production para no romper entornos locales.
export const JWT_SECRET_MIN_LENGTH_PRODUCTION = 32;

/**
 * JWT_EXPIRES_IN se valida con la propia librería (jsonwebtoken + ms): se firma un token de prueba y
 * se exige exp > iat. Además se rechazan números sin unidad: llegan como string y jsonwebtoken los
 * interpreta como milisegundos ("3600" = 3,6 s), lo que nunca es la intención.
 * Válidos: "2h", "30m", "1d", "7 days". Inválidos: "abc", "3600", "-1h", "0s".
 */
export function jwtExpiresInIssue(value: string): string | null {
    if (/^\s*-?\d+(\.\d+)?\s*$/.test(value)) {
        return 'JWT_EXPIRES_IN must include a time unit (e.g. 2h, 30m, 1d)';
    }
    try {
        const token = jwt.sign({}, 'jwt-expires-in-probe', { expiresIn: value as jwt.SignOptions['expiresIn'] });
        const decoded = jwt.decode(token) as { iat?: number; exp?: number } | null;
        if (!decoded?.exp || !decoded.iat || decoded.exp <= decoded.iat) {
            return 'JWT_EXPIRES_IN must be a positive duration';
        }
        return null;
    } catch {
        return 'JWT_EXPIRES_IN is not a valid duration (e.g. 2h, 30m, 1d)';
    }
}

const nodeEnvSchema = z.enum(['development', 'test', 'production']);

function requiredNonWhitespaceString(message: string) {
    return z.string().superRefine((value, ctx) => {
        if (value.trim().length === 0) {
            ctx.addIssue({
                code: 'custom',
                message,
            });
        }
    });
}

const STORAGE_PROVIDERS = ['supabase', 'gcs'] as const;
export type StorageProvider = (typeof STORAGE_PROVIDERS)[number];

const GCS_BUCKET_NAME = /^[a-z0-9][a-z0-9._-]*[a-z0-9]$/;
const GCS_BUCKET_LABEL = /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/;
const GCS_BUCKET_IP = /^(?:\d{1,3}\.){3}\d{1,3}$/;

/**
 * Nombre de bucket de GCS, sin red ni cliente. Reglas sintácticas de Cloud Storage:
 * minúsculas, números, puntos, guiones y guiones bajos; 3–63 caracteres (hasta 222 si hay
 * puntos); sin gs://, sin separadores de ruta, sin IP, sin prefijo "goog" ni "google".
 * Devuelve el mensaje de error, o null si el nombre es válido.
 */
function gcsBucketNameIssue(value: string | undefined): string | null {
    if (value === undefined || value.trim().length === 0) {
        return 'GCS_BUCKET is required';
    }
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
        return 'GCS_BUCKET must be a bucket name, not a URI';
    }
    if (value.includes('/') || value.includes('\\')) {
        return 'GCS_BUCKET must not contain path separators';
    }
    const maxLength = value.includes('.') ? 222 : 63;
    if (value.length < 3 || value.length > maxLength) {
        return 'GCS_BUCKET must be between 3 and 63 characters, or up to 222 when it contains dots';
    }
    if (!GCS_BUCKET_NAME.test(value)) {
        return 'GCS_BUCKET must contain only lowercase letters, numbers, dots, hyphens and underscores, and must start and end with a letter or number';
    }
    if (value.split('.').some((label) => !GCS_BUCKET_LABEL.test(label) || label.length > 63)) {
        return 'GCS_BUCKET must not contain consecutive dots, and each dot-separated label must start and end with a letter or number';
    }
    if (GCS_BUCKET_IP.test(value)) {
        return 'GCS_BUCKET must not be an IP address';
    }
    if (value.startsWith('goog')) {
        return 'GCS_BUCKET must not start with "goog"';
    }
    if (value.includes('google') || value.includes('g00gle')) {
        return 'GCS_BUCKET must not contain "google"';
    }
    return null;
}

function supabaseUrlIssue(value: string | undefined): string | null {
    if (value === undefined || value.trim().length === 0) {
        return 'SUPABASE_URL is required';
    }
    if (!z.string().url().safeParse(value).success) {
        return 'SUPABASE_URL must be a valid URL';
    }
    return null;
}

function isStorageProvider(value: string): value is StorageProvider {
    return (STORAGE_PROVIDERS as readonly string[]).includes(value);
}

function storageConfigIssues(input: {
    STORAGE_PROVIDER: string;
    SUPABASE_URL: string | undefined;
    SUPABASE_SERVICE_KEY: string | undefined;
    GCS_BUCKET: string | undefined;
}): string[] {
    if (!isStorageProvider(input.STORAGE_PROVIDER)) {
        return ['STORAGE_PROVIDER: STORAGE_PROVIDER must be "supabase" or "gcs"'];
    }
    if (input.STORAGE_PROVIDER === 'supabase') {
        const issues: string[] = [];
        const urlIssue = supabaseUrlIssue(input.SUPABASE_URL);
        if (urlIssue) issues.push(`SUPABASE_URL: ${urlIssue}`);
        if (input.SUPABASE_SERVICE_KEY === undefined || input.SUPABASE_SERVICE_KEY.trim().length === 0) {
            issues.push('SUPABASE_SERVICE_KEY: SUPABASE_SERVICE_KEY is required');
        }
        return issues;
    }
    const bucketIssue = gcsBucketNameIssue(input.GCS_BUCKET);
    return bucketIssue ? [`GCS_BUCKET: ${bucketIssue}`] : [];
}

/** Variable ausente o en blanco: no forma parte de la configuración activa. */
function configuredOrEmpty(value: string | undefined): string {
    if (value === undefined || value.trim().length === 0) {
        return '';
    }
    return value;
}

const portSchema = z
    .union([z.string(), z.number(), z.undefined()])
    .superRefine((value, ctx) => {
        if (value === undefined || value === '') {
            return;
        }
        const raw = typeof value === 'number' ? String(value) : value;
        if (!/^\d+$/.test(raw)) {
            ctx.addIssue({
                code: 'custom',
                message: 'PORT must be an integer between 1 and 65535',
                path: ['PORT'],
            });
            return;
        }
        const n = Number(raw);
        if (n < 1 || n > 65535) {
            ctx.addIssue({
                code: 'custom',
                message: 'PORT must be an integer between 1 and 65535',
                path: ['PORT'],
            });
        }
    })
    .transform((value): number => {
        if (value === undefined || value === '') {
            return 3000;
        }
        const raw = typeof value === 'number' ? String(value) : value;
        return Number(raw);
    });

const webEnvSchema = z
    .object({
        NODE_ENV: nodeEnvSchema,
        DATABASE_URL: requiredNonWhitespaceString('DATABASE_URL is required'),
        JWT_SECRET: requiredNonWhitespaceString('JWT_SECRET is required'),
        FRONTEND_URL: z.string().optional(),
        // Opt-in experimental; ni NODE_ENV ni K_SERVICE seleccionan este modo.
        LOGIN_CLIENT_IP_MODE: z.enum(['legacy', 'cloud-run-direct']).default('legacy'),
        RENDER: z.string().optional(),
        PORT: portSchema,
        JWT_EXPIRES_IN: z
            .string()
            .optional()
            .transform((v) => (v === undefined || v.trim() === '' ? '2h' : v)),
        // Ausente o en blanco conserva el proveedor de Render. Cualquier otro texto se valida después.
        STORAGE_PROVIDER: z
            .string()
            .optional()
            .transform((v) => (v === undefined || v.trim() === '' ? 'supabase' : v)),
        SUPABASE_URL: z.string().optional(),
        SUPABASE_SERVICE_KEY: z.string().optional(),
        SUPABASE_BUCKET: z.string().optional(),
        GCS_BUCKET: z.string().optional(),
    })
    .superRefine((data, ctx) => {
        if (data.LOGIN_CLIENT_IP_MODE === 'cloud-run-direct' && data.RENDER === 'true') {
            ctx.addIssue({
                code: 'custom',
                message: 'LOGIN_CLIENT_IP_MODE cloud-run-direct is incompatible with RENDER=true',
                path: ['LOGIN_CLIENT_IP_MODE'],
            });
        }
        const expiresInIssue = jwtExpiresInIssue(data.JWT_EXPIRES_IN);
        if (expiresInIssue) {
            ctx.addIssue({ code: 'custom', message: expiresInIssue, path: ['JWT_EXPIRES_IN'] });
        }
        if (data.NODE_ENV === 'production') {
            if (data.JWT_SECRET.trim().length < JWT_SECRET_MIN_LENGTH_PRODUCTION) {
                ctx.addIssue({
                    code: 'custom',
                    message: `JWT_SECRET must be at least ${JWT_SECRET_MIN_LENGTH_PRODUCTION} characters when NODE_ENV is production`,
                    path: ['JWT_SECRET'],
                });
            }
            const url = data.FRONTEND_URL?.trim();
            if (!url) {
                ctx.addIssue({
                    code: 'custom',
                    message: 'FRONTEND_URL is required when NODE_ENV is production',
                    path: ['FRONTEND_URL'],
                });
            }
        }
    });

const jobEnvSchema = z.object({
    DATABASE_URL: requiredNonWhitespaceString('DATABASE_URL is required'),
});

export type WebEnv = {
    nodeEnv: z.infer<typeof nodeEnvSchema>;
    databaseUrl: string;
    jwtSecret: string;
    frontendUrl?: string;
    port: number;
    jwtExpiresIn: string;
    loginClientIpMode: LoginClientIpMode;
    loginObservation: ObservationConfig | null;
    storageProvider: StorageProvider;
    // Los lee solo el adaptador de Supabase. Con gcs y la variable ausente quedan en ''.
    // La validación no crea ningún cliente.
    supabaseUrl: string;
    supabaseServiceKey: string;
    supabaseBucket: string;
    // '' cuando el proveedor activo no es gcs. Con gcs, es un nombre de bucket ya validado.
    gcsBucket: string;
};

export type JobEnv = {
    databaseUrl: string;
};

export class EnvValidationError extends Error {
    readonly issues: string[];

    constructor(issues: string[]) {
        super(issues.join('; '));
        this.name = 'EnvValidationError';
        this.issues = issues;
    }
}

function formatZodIssues(error: z.ZodError): string[] {
    return error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : 'env';
        return `${path}: ${issue.message}`;
    });
}

function mapWebEnv(parsed: z.infer<typeof webEnvSchema>): WebEnv {
    const common = {
        nodeEnv: parsed.NODE_ENV,
        databaseUrl: parsed.DATABASE_URL,
        jwtSecret: parsed.JWT_SECRET,
        frontendUrl: parsed.FRONTEND_URL?.trim() || undefined,
        port: parsed.PORT,
        jwtExpiresIn: parsed.JWT_EXPIRES_IN,
        loginClientIpMode: parsed.LOGIN_CLIENT_IP_MODE,
        loginObservation: null,
    };

    if (parsed.STORAGE_PROVIDER === 'gcs') {
        const gcsBucket = parsed.GCS_BUCKET;
        if (gcsBucket === undefined) {
            throw new EnvValidationError(['GCS_BUCKET: GCS_BUCKET is required']);
        }
        return {
            ...common,
            storageProvider: 'gcs',
            supabaseUrl: configuredOrEmpty(parsed.SUPABASE_URL),
            supabaseServiceKey: configuredOrEmpty(parsed.SUPABASE_SERVICE_KEY),
            supabaseBucket: configuredOrEmpty(parsed.SUPABASE_BUCKET),
            gcsBucket,
        };
    }

    if (parsed.STORAGE_PROVIDER !== 'supabase') {
        throw new EnvValidationError(['STORAGE_PROVIDER: STORAGE_PROVIDER must be "supabase" or "gcs"']);
    }

    const supabaseUrl = parsed.SUPABASE_URL;
    const supabaseServiceKey = parsed.SUPABASE_SERVICE_KEY;
    if (supabaseUrl === undefined || supabaseServiceKey === undefined) {
        throw new EnvValidationError(['SUPABASE_URL: SUPABASE_URL is required']);
    }
    const supabaseBucket =
        parsed.SUPABASE_BUCKET === undefined || parsed.SUPABASE_BUCKET.trim() === ''
            ? 'lotes-files'
            : parsed.SUPABASE_BUCKET;

    return {
        ...common,
        storageProvider: 'supabase',
        supabaseUrl,
        supabaseServiceKey,
        supabaseBucket,
        gcsBucket: '',
    };
}

function pickEnv(
    source: NodeJS.ProcessEnv | Record<string, string | undefined>,
    key: string,
): string | undefined {
    const value = source[key];
    if (value === undefined || value === '') {
        return undefined;
    }
    return value;
}

export function parseWebEnv(
    source: NodeJS.ProcessEnv | Record<string, string | undefined>,
): WebEnv {
    const input = {
        NODE_ENV: pickEnv(source, 'NODE_ENV'),
        DATABASE_URL: pickEnv(source, 'DATABASE_URL'),
        JWT_SECRET: pickEnv(source, 'JWT_SECRET'),
        FRONTEND_URL: pickEnv(source, 'FRONTEND_URL'),
        LOGIN_CLIENT_IP_MODE: pickEnv(source, 'LOGIN_CLIENT_IP_MODE'),
        RENDER: pickEnv(source, 'RENDER'),
        PORT: pickEnv(source, 'PORT'),
        JWT_EXPIRES_IN: pickEnv(source, 'JWT_EXPIRES_IN'),
        STORAGE_PROVIDER: pickEnv(source, 'STORAGE_PROVIDER'),
        SUPABASE_URL: pickEnv(source, 'SUPABASE_URL'),
        SUPABASE_SERVICE_KEY: pickEnv(source, 'SUPABASE_SERVICE_KEY'),
        SUPABASE_BUCKET: pickEnv(source, 'SUPABASE_BUCKET'),
        GCS_BUCKET: pickEnv(source, 'GCS_BUCKET'),
    };
    const result = webEnvSchema.safeParse(input);
    // El proveedor se resuelve aparte del object schema: un DATABASE_URL inválido no debe ocultar
    // un GCS_BUCKET o un SUPABASE_URL faltante. No se abre ningún cliente de storage.
    const provider = input.STORAGE_PROVIDER === undefined || input.STORAGE_PROVIDER.trim() === ''
        ? 'supabase'
        : input.STORAGE_PROVIDER;
    const storageIssues = storageConfigIssues({
        STORAGE_PROVIDER: provider,
        SUPABASE_URL: input.SUPABASE_URL,
        SUPABASE_SERVICE_KEY: input.SUPABASE_SERVICE_KEY,
        GCS_BUCKET: input.GCS_BUCKET,
    });

    if (!result.success || storageIssues.length > 0) {
        const issues = result.success ? [] : formatZodIssues(result.error);
        for (const issue of storageIssues) {
            if (!issues.includes(issue)) issues.push(issue);
        }
        throw new EnvValidationError(issues);
    }

    return { ...mapWebEnv(result.data), loginObservation: parseLoginObservation(source) };
}

export function parseJobEnv(
    source: NodeJS.ProcessEnv | Record<string, string | undefined>,
): JobEnv {
    const result = jobEnvSchema.safeParse({
        DATABASE_URL: pickEnv(source, 'DATABASE_URL'),
    });

    if (!result.success) {
        throw new EnvValidationError(formatZodIssues(result.error));
    }

    return { databaseUrl: result.data.DATABASE_URL };
}

let cachedWebEnv: WebEnv | null = null;

export function initWebEnv(source: NodeJS.ProcessEnv | Record<string, string | undefined>): WebEnv {
    cachedWebEnv = parseWebEnv(source);
    return cachedWebEnv;
}

export function getWebEnv(): WebEnv {
    if (!cachedWebEnv) {
        throw new Error('Web environment has not been initialized');
    }
    return cachedWebEnv;
}

export function resetWebEnvForTests(): void {
    cachedWebEnv = null;
}
