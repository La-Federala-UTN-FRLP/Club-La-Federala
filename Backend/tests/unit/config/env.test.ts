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
        expect(env.supabaseBucket).toBe('lotes-files');
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
});
