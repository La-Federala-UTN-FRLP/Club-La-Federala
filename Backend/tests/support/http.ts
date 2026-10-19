/**
 * Helpers para tests de contrato HTTP (supertest sobre la app real).
 *
 * Los services se mockean en cada suite; acá solo se resuelve el entorno web
 * mínimo y el header Bearer firmado con el secreto de test.
 */
import jwt from 'jsonwebtoken';
import { initWebEnv, resetWebEnvForTests } from '../../src/config/env';

const JWT_SECRET = 'unit-test-jwt-secret';

/**
 * IDs de path que la política común (positiveIntString) rechaza con 400.
 * Al armar la URL pasarlos por encodeURIComponent: " 12" viaja como %2012.
 */
export const INVALID_PATH_IDS = ['abc', '5abc', '1.5', '-1', '0', '1e2', '10e-1', '0x10', '007', '+5', ' 12', '2147483648'];

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
