import {
    EnvValidationError,
    parseJobEnv,
    parseWebEnv,
    resetWebEnvForTests,
} from '../../../src/config/env';

const baseWeb = (overrides: Record<string, string | undefined> = {}) => ({
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/federala',
    JWT_SECRET: 'unit-test-jwt-secret',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_KEY: 'unit-test-service-key',
    ...overrides,
});

describe('parseWebEnv', () => {
    afterEach(() => {
        resetWebEnvForTests();
    });

    test('parse correcto con defaults', () => {
        const env = parseWebEnv(baseWeb());

        expect(env.port).toBe(3000);
        expect(env.jwtExpiresIn).toBe('2h');
        expect(env.storageProvider).toBe('supabase');
        expect(env.supabaseBucket).toBe('lotes-files');
        expect(env.gcsBucket).toBe('');
        expect(env.nodeEnv).toBe('development');
    });

    test('falta DATABASE_URL', () => {
        expect(() => parseWebEnv(baseWeb({ DATABASE_URL: undefined }))).toThrow(
            EnvValidationError,
        );
        try {
            parseWebEnv(baseWeb({ DATABASE_URL: '' }));
        } catch (error) {
            expect(error).toBeInstanceOf(EnvValidationError);
            expect((error as EnvValidationError).issues.join(' ')).toMatch(/DATABASE_URL/);
        }
    });

    test('faltan secretos requeridos', () => {
        for (const key of ['JWT_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'] as const) {
            expect(() => parseWebEnv(baseWeb({ [key]: undefined }))).toThrow(EnvValidationError);
        }
    });

    test('NODE_ENV inválido', () => {
        expect(() => parseWebEnv(baseWeb({ NODE_ENV: 'staging' }))).toThrow(EnvValidationError);
    });

    test('production sin FRONTEND_URL', () => {
        expect(() =>
            parseWebEnv(baseWeb({ NODE_ENV: 'production', FRONTEND_URL: undefined })),
        ).toThrow(EnvValidationError);
    });

    test('development sin FRONTEND_URL permitido', () => {
        const env = parseWebEnv(baseWeb({ FRONTEND_URL: undefined }));
        expect(env.frontendUrl).toBeUndefined();
    });

    test('test sin FRONTEND_URL permitido', () => {
        const env = parseWebEnv(baseWeb({ NODE_ENV: 'test', FRONTEND_URL: undefined }));
        expect(env.frontendUrl).toBeUndefined();
    });

    test.each(['abc', '0', '70000'])('PORT inválido: %s', (port) => {
        expect(() => parseWebEnv(baseWeb({ PORT: port }))).toThrow(EnvValidationError);
    });

    test('errores no incluyen valores secretos', () => {
        const secret = 'super-secret-jwt-value-xyz';
        try {
            parseWebEnv(
                baseWeb({
                    JWT_SECRET: secret,
                    DATABASE_URL: '',
                }),
            );
        } catch (error) {
            const message = (error as EnvValidationError).issues.join(' ');
            expect(message).not.toContain(secret);
            expect(message).toMatch(/DATABASE_URL/);
        }
    });

    test.each([
        ['DATABASE_URL', '   '],
        ['JWT_SECRET', '   '],
        ['SUPABASE_SERVICE_KEY', '   '],
    ] as const)('%s solo whitespace es inválido', (key, value) => {
        expect(() => parseWebEnv(baseWeb({ [key]: value }))).toThrow(EnvValidationError);
    });

    test('secret válido conserva el input exacto sin trim', () => {
        const databaseUrl = '  postgresql://user:pass@localhost:5432/federala  ';
        const jwtSecret = '  unit-test-jwt-secret  ';
        const serviceKey = '  unit-test-service-key  ';

        const env = parseWebEnv(
            baseWeb({
                DATABASE_URL: databaseUrl,
                JWT_SECRET: jwtSecret,
                SUPABASE_SERVICE_KEY: serviceKey,
            }),
        );

        expect(env.databaseUrl).toBe(databaseUrl);
        expect(env.jwtSecret).toBe(jwtSecret);
        expect(env.supabaseServiceKey).toBe(serviceKey);
    });
});

describe('parseJobEnv', () => {
    test('válido con solo DATABASE_URL', () => {
        const env = parseJobEnv({
            DATABASE_URL: 'postgresql://user:pass@localhost:5432/federala',
        });
        expect(env.databaseUrl).toContain('postgresql://');
    });

    test('DATABASE_URL ausente', () => {
        expect(() => parseJobEnv({})).toThrow(EnvValidationError);
    });

    test('DATABASE_URL solo whitespace es inválido', () => {
        expect(() => parseJobEnv({ DATABASE_URL: '   ' })).toThrow(EnvValidationError);
    });

    test('no exige configuración web', () => {
        expect(() =>
            parseJobEnv({
                DATABASE_URL: 'postgresql://user:pass@localhost:5432/federala',
            }),
        ).not.toThrow();
    });

    test('ignora STORAGE_PROVIDER, GCS_BUCKET y SUPABASE_*', () => {
        const databaseUrl = 'postgresql://user:pass@localhost:5432/federala';
        expect(
            parseJobEnv({
                DATABASE_URL: databaseUrl,
                STORAGE_PROVIDER: 'no-es-un-proveedor',
                GCS_BUCKET: 'gs://invalido',
                SUPABASE_URL: undefined,
                SUPABASE_SERVICE_KEY: undefined,
            }),
        ).toEqual({ databaseUrl });
    });
});

describe('parseWebEnv — JWT_SECRET en production', () => {
    const prod = (overrides: Record<string, string | undefined> = {}) =>
        baseWeb({ NODE_ENV: 'production', FRONTEND_URL: 'https://app.example.com', ...overrides });

    test('menos de 32 caracteres → falla al arrancar', () => {
        try {
            parseWebEnv(prod({ JWT_SECRET: 'x'.repeat(31) }));
            throw new Error('debía fallar');
        } catch (error) {
            expect(error).toBeInstanceOf(EnvValidationError);
            expect((error as EnvValidationError).issues).toEqual([
                'JWT_SECRET: JWT_SECRET must be at least 32 characters when NODE_ENV is production',
            ]);
        }
    });

    test('32 caracteres o más → válido', () => {
        expect(parseWebEnv(prod({ JWT_SECRET: 'x'.repeat(32) })).jwtSecret).toHaveLength(32);
    });

    test('los espacios no cuentan para el mínimo', () => {
        expect(() => parseWebEnv(prod({ JWT_SECRET: `  ${'x'.repeat(30)}  ` }))).toThrow(EnvValidationError);
    });

    test.each(['development', 'test'])('%s: un secreto corto sigue siendo válido (compatibilidad local)', (NODE_ENV) => {
        expect(() => parseWebEnv(baseWeb({ NODE_ENV, JWT_SECRET: 'corto' }))).not.toThrow();
    });
});

describe('parseWebEnv — JWT_EXPIRES_IN', () => {
    test.each(['2h', '30m', '1d', '7 days', '1.5h'])('%s → válido', (JWT_EXPIRES_IN) => {
        expect(parseWebEnv(baseWeb({ JWT_EXPIRES_IN })).jwtExpiresIn).toBe(JWT_EXPIRES_IN);
    });

    test.each([
        ['abc', /not a valid duration/],
        ['10x', /not a valid duration/],
        ['3600', /must include a time unit/],
        ['-1h', /must be a positive duration/],
        ['0s', /must be a positive duration/],
    ])('%s → falla al arrancar', (JWT_EXPIRES_IN, motivo) => {
        try {
            parseWebEnv(baseWeb({ JWT_EXPIRES_IN }));
            throw new Error('debía fallar');
        } catch (error) {
            expect(error).toBeInstanceOf(EnvValidationError);
            expect((error as EnvValidationError).issues.join(' ')).toMatch(motivo);
        }
    });

    test('ausente → default 2h', () => {
        expect(parseWebEnv(baseWeb({ JWT_EXPIRES_IN: undefined })).jwtExpiresIn).toBe('2h');
    });
});

const STAGING_BUCKET = 'federala-staging-files-28822223940';

const gcsBase = (overrides: Record<string, string | undefined> = {}) => ({
    ...baseWeb(),
    STORAGE_PROVIDER: 'gcs',
    GCS_BUCKET: STAGING_BUCKET,
    SUPABASE_URL: undefined,
    SUPABASE_SERVICE_KEY: undefined,
    SUPABASE_BUCKET: undefined,
    ...overrides,
});

describe('parseWebEnv — STORAGE_PROVIDER', () => {
    test('ausente, vacío o en blanco conserva supabase (Render)', () => {
        const absent = parseWebEnv(baseWeb());
        expect(parseWebEnv(baseWeb({ STORAGE_PROVIDER: undefined }))).toEqual(absent);
        expect(parseWebEnv(baseWeb({ STORAGE_PROVIDER: '' }))).toEqual(absent);
        expect(parseWebEnv(baseWeb({ STORAGE_PROVIDER: '   ' }))).toEqual(absent);
        expect(parseWebEnv(baseWeb({ STORAGE_PROVIDER: 'supabase' }))).toEqual(absent);
    });

    test('supabase sigue exigiendo URL válida y service key', () => {
        try {
            parseWebEnv(baseWeb({ SUPABASE_URL: 'not-a-url' }));
            throw new Error('debía fallar');
        } catch (error) {
            expect(error).toBeInstanceOf(EnvValidationError);
            expect((error as EnvValidationError).issues).toEqual([
                'SUPABASE_URL: SUPABASE_URL must be a valid URL',
            ]);
        }
    });

    test('un GCS_BUCKET inválido no afecta al proveedor supabase', () => {
        const env = parseWebEnv(baseWeb({ GCS_BUCKET: 'gs://no-se-usa' }));
        expect(env.storageProvider).toBe('supabase');
        expect(env.supabaseBucket).toBe('lotes-files');
        expect(env.gcsBucket).toBe('');
    });

    test('un error de base no oculta el storage faltante', () => {
        try {
            parseWebEnv(baseWeb({ DATABASE_URL: undefined, SUPABASE_URL: undefined }));
            throw new Error('debía fallar');
        } catch (error) {
            expect(error).toBeInstanceOf(EnvValidationError);
            const issues = (error as EnvValidationError).issues.join(' ');
            expect(issues).toMatch(/DATABASE_URL/);
            expect(issues).toMatch(/SUPABASE_URL is required/);
        }
    });

    test('gcs válido, sin credenciales de Supabase', () => {
        const env = parseWebEnv(gcsBase());
        expect(env.storageProvider).toBe('gcs');
        expect(env.gcsBucket).toBe(STAGING_BUCKET);
        expect(env.supabaseUrl).toBe('');
        expect(env.supabaseServiceKey).toBe('');
        expect(env.supabaseBucket).toBe('');
        expect(env.databaseUrl).toContain('postgresql://');
        expect(env.port).toBe(3000);
    });

    test('gcs conserva credenciales Supabase si están presentes, sin validarlas', () => {
        const env = parseWebEnv(
            gcsBase({
                SUPABASE_URL: 'not-a-url',
                SUPABASE_SERVICE_KEY: '  kept-exactly  ',
                SUPABASE_BUCKET: 'custom-bucket',
            }),
        );
        expect(env.storageProvider).toBe('gcs');
        expect(env.gcsBucket).toBe(STAGING_BUCKET);
        expect(env.supabaseUrl).toBe('not-a-url');
        expect(env.supabaseServiceKey).toBe('  kept-exactly  ');
        expect(env.supabaseBucket).toBe('custom-bucket');
    });

    test('gcs trata en blanco las credenciales Supabase vacías', () => {
        const env = parseWebEnv(
            gcsBase({
                SUPABASE_URL: '   ',
                SUPABASE_SERVICE_KEY: '   ',
                SUPABASE_BUCKET: '   ',
            }),
        );
        expect(env.supabaseUrl).toBe('');
        expect(env.supabaseServiceKey).toBe('');
        expect(env.supabaseBucket).toBe('');
    });

    test('gcs acepta nombres con punto o guion bajo', () => {
        expect(parseWebEnv(gcsBase({ GCS_BUCKET: 'files.federala.dev' })).gcsBucket).toBe(
            'files.federala.dev',
        );
        expect(parseWebEnv(gcsBase({ GCS_BUCKET: 'federala_files_01' })).gcsBucket).toBe(
            'federala_files_01',
        );
    });

    test('gcs en production sigue exigiendo FRONTEND_URL y el largo de JWT_SECRET', () => {
        const jwtSecret = 'x'.repeat(32);
        expect(() =>
            parseWebEnv(
                gcsBase({
                    NODE_ENV: 'production',
                    FRONTEND_URL: undefined,
                    JWT_SECRET: jwtSecret,
                }),
            ),
        ).toThrow(EnvValidationError);

        const env = parseWebEnv(
            gcsBase({
                NODE_ENV: 'production',
                FRONTEND_URL: 'https://app.example.com',
                JWT_SECRET: jwtSecret,
            }),
        );
        expect(env.storageProvider).toBe('gcs');
        expect(env.frontendUrl).toBe('https://app.example.com');
        expect(env.jwtSecret).toBe(jwtSecret);
    });

    test.each([
        [undefined, 'GCS_BUCKET: GCS_BUCKET is required'],
        ['', 'GCS_BUCKET: GCS_BUCKET is required'],
        ['   ', 'GCS_BUCKET: GCS_BUCKET is required'],
        ['gs://federala-staging-files-28822223940', 'GCS_BUCKET: GCS_BUCKET must be a bucket name, not a URI'],
        [
            'federala-staging-files-28822223940/plano.pdf',
            'GCS_BUCKET: GCS_BUCKET must not contain path separators',
        ],
        ['federala\\files', 'GCS_BUCKET: GCS_BUCKET must not contain path separators'],
        [
            'Federala-files',
            'GCS_BUCKET: GCS_BUCKET must contain only lowercase letters, numbers, dots, hyphens and underscores, and must start and end with a letter or number',
        ],
        ['ab', 'GCS_BUCKET: GCS_BUCKET must be between 3 and 63 characters, or up to 222 when it contains dots'],
        ['-invalid-name', 'GCS_BUCKET: GCS_BUCKET must contain only lowercase letters, numbers, dots, hyphens and underscores, and must start and end with a letter or number'],
        ['invalid-name-', 'GCS_BUCKET: GCS_BUCKET must contain only lowercase letters, numbers, dots, hyphens and underscores, and must start and end with a letter or number'],
        ['192.168.0.1', 'GCS_BUCKET: GCS_BUCKET must not be an IP address'],
        ['goog-files', 'GCS_BUCKET: GCS_BUCKET must not start with "goog"'],
        ['my-google-files', 'GCS_BUCKET: GCS_BUCKET must not contain "google"'],
        ['files-g00gle-1', 'GCS_BUCKET: GCS_BUCKET must not contain "google"'],
        ['a..b', 'GCS_BUCKET: GCS_BUCKET must not contain consecutive dots, and each dot-separated label must start and end with a letter or number'],
    ] as const)('GCS_BUCKET inválido %s', (bucket, message) => {
        try {
            parseWebEnv(gcsBase({ GCS_BUCKET: bucket }));
            throw new Error('debía fallar');
        } catch (error) {
            expect(error).toBeInstanceOf(EnvValidationError);
            expect((error as EnvValidationError).issues).toEqual([message]);
        }
    });

    test.each(['GCS', 'Supabase', 's3', ' gcs', 'gcs '])('proveedor desconocido: %s', (provider) => {
        try {
            parseWebEnv(baseWeb({ STORAGE_PROVIDER: provider }));
            throw new Error('debía fallar');
        } catch (error) {
            expect(error).toBeInstanceOf(EnvValidationError);
            expect((error as EnvValidationError).issues).toEqual([
                'STORAGE_PROVIDER: STORAGE_PROVIDER must be "supabase" or "gcs"',
            ]);
        }
    });

    test('los errores de storage no incluyen secretos ni el valor rechazado', () => {
        const jwtSecret = 'super-secret-jwt-value-xyz';
        const serviceKey = 'super-secret-service-key-xyz';
        const bucket = 'gs://federala-staging-files-28822223940';
        try {
            parseWebEnv(
                gcsBase({
                    JWT_SECRET: jwtSecret,
                    SUPABASE_SERVICE_KEY: serviceKey,
                    GCS_BUCKET: bucket,
                }),
            );
            throw new Error('debía fallar');
        } catch (error) {
            expect(error).toBeInstanceOf(EnvValidationError);
            const message = (error as EnvValidationError).issues.join(' ');
            expect(message).not.toContain(jwtSecret);
            expect(message).not.toContain(serviceKey);
            expect(message).not.toContain(bucket);
            expect(message).toMatch(/GCS_BUCKET/);
        }
    });
});
