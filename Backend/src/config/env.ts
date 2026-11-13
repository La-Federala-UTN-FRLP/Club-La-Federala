import { z } from 'zod';
import jwt from 'jsonwebtoken';

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

const supabaseUrlSchema = z.string().superRefine((value, ctx) => {
    if (value.trim().length === 0) {
        ctx.addIssue({
            code: 'custom',
            message: 'SUPABASE_URL is required',
        });
        return;
    }
    const urlCheck = z.string().url().safeParse(value);
    if (!urlCheck.success) {
        ctx.addIssue({
            code: 'custom',
            message: 'SUPABASE_URL must be a valid URL',
        });
    }
});

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
        SUPABASE_URL: supabaseUrlSchema,
        SUPABASE_SERVICE_KEY: requiredNonWhitespaceString('SUPABASE_SERVICE_KEY is required'),
        FRONTEND_URL: z.string().optional(),
        PORT: portSchema,
        JWT_EXPIRES_IN: z
            .string()
            .optional()
            .transform((v) => (v === undefined || v.trim() === '' ? '2h' : v)),
        SUPABASE_BUCKET: z
            .string()
            .optional()
            .transform((v) => (v === undefined || v.trim() === '' ? 'lotes-files' : v)),
    })
    .superRefine((data, ctx) => {
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
    supabaseUrl: string;
    supabaseServiceKey: string;
    frontendUrl?: string;
    port: number;
    jwtExpiresIn: string;
    supabaseBucket: string;
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
    return {
        nodeEnv: parsed.NODE_ENV,
        databaseUrl: parsed.DATABASE_URL,
        jwtSecret: parsed.JWT_SECRET,
        supabaseUrl: parsed.SUPABASE_URL,
        supabaseServiceKey: parsed.SUPABASE_SERVICE_KEY,
        frontendUrl: parsed.FRONTEND_URL?.trim() || undefined,
        port: parsed.PORT,
        jwtExpiresIn: parsed.JWT_EXPIRES_IN,
        supabaseBucket: parsed.SUPABASE_BUCKET,
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
    const result = webEnvSchema.safeParse({
        NODE_ENV: pickEnv(source, 'NODE_ENV'),
        DATABASE_URL: pickEnv(source, 'DATABASE_URL'),
        JWT_SECRET: pickEnv(source, 'JWT_SECRET'),
        SUPABASE_URL: pickEnv(source, 'SUPABASE_URL'),
        SUPABASE_SERVICE_KEY: pickEnv(source, 'SUPABASE_SERVICE_KEY'),
        FRONTEND_URL: pickEnv(source, 'FRONTEND_URL'),
        PORT: pickEnv(source, 'PORT'),
        JWT_EXPIRES_IN: pickEnv(source, 'JWT_EXPIRES_IN'),
        SUPABASE_BUCKET: pickEnv(source, 'SUPABASE_BUCKET'),
    });

    if (!result.success) {
        throw new EnvValidationError(formatZodIssues(result.error));
    }

    return mapWebEnv(result.data);
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
