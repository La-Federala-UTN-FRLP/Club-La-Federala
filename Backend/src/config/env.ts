import { z } from 'zod';

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
        if (data.NODE_ENV === 'production') {
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
