/**
 * Helpers para tests de contrato HTTP (supertest sobre la app real).
 *
 * Los services se mockean en cada suite; acá solo se resuelve el entorno web
 * mínimo y el header Bearer firmado con el secreto de test.
 */
import jwt from 'jsonwebtoken';
import { initWebEnv, resetWebEnvForTests } from '../../src/config/env';

const JWT_SECRET = 'unit-test-jwt-secret';

/** Registra beforeAll/afterAll que inicializan y limpian el entorno web de test. */
export function useTestWebEnv(): void {
    beforeAll(() => {
        initWebEnv({
            NODE_ENV: 'test',
            DATABASE_URL: 'postgresql://user:pass@localhost:5432/federala',
            JWT_SECRET,
            SUPABASE_URL: 'https://example.supabase.co',
            SUPABASE_SERVICE_KEY: 'unit-test-service-key',
        });
    });

    afterAll(() => {
        resetWebEnvForTests();
    });
}

export function authHeader(role: string, inmobiliariaId?: number): { Authorization: string } {
    const token = jwt.sign(
        { sub: 1, email: 'test@example.com', role, ...(inmobiliariaId != null && { inmobiliariaId }) },
        JWT_SECRET,
    );
    return { Authorization: `Bearer ${token}` };
}
