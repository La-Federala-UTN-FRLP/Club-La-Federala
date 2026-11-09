/**
 * Helpers para tests de contrato HTTP (supertest sobre la app real).
 *
 * Los services se mockean en cada suite; acá se resuelve el entorno web mínimo, el header
 * Bearer firmado con el secreto de test y la "DB" de identidades que lee authenticate.
 *
 * authenticate relee el usuario vigente en cada request (findAuthIdentity). Por defecto,
 * useTestWebEnv() reemplaza esa lectura por un registro en memoria: cada authHeader(...) firma
 * un token Y registra al usuario correspondiente, así el token de test representa a un usuario
 * que existe con ese rol/tenant. Para controlar la DB explícitamente:
 *  - signTestToken(...) firma sin registrar (usuario inexistente / claims viejos);
 *  - setTestIdentity(sub, identidad | null) cambia o elimina al usuario del registro;
 *  - useTestWebEnv({ authIdentity: 'db' }) usa la consulta real (la suite mockea Prisma).
 */
import jwt from 'jsonwebtoken';
import { initWebEnv, resetWebEnvForTests } from '../../src/config/env';
import * as authIdentityService from '../../src/services/authIdentity.service';
import type { AuthIdentity } from '../../src/services/authIdentity.service';

const JWT_SECRET = 'unit-test-jwt-secret';
const TEST_EMAIL = 'test@example.com';

/**
 * IDs de path que la política común (positiveIntString) rechaza con 400.
 * Al armar la URL pasarlos por encodeURIComponent: " 12" viaja como %2012.
 */
export const INVALID_PATH_IDS = ['abc', '5abc', '1.5', '-1', '0', '1e2', '10e-1', '0x10', '007', '+5', ' 12', '2147483648'];

type TestWebEnvOptions = {
    /** 'db': authenticate resuelve la identidad con la consulta real (la suite mockea Prisma). */
    authIdentity?: 'registry' | 'db';
};

// "DB" de usuarios de test (por archivo de test: Jest aísla los módulos de cada suite).
const identities = new Map<number, AuthIdentity>();
// Sub estable por (rol, tenant) cuando el test no fija uno: cada combinación es un usuario distinto.
const subPorUsuario = new Map<string, number>();

/** Registra beforeAll/afterAll que inicializan y limpian el entorno web de test. */
export function useTestWebEnv(options: TestWebEnvOptions = {}): void {
    beforeAll(() => {
        initWebEnv({
            NODE_ENV: 'test',
            DATABASE_URL: 'postgresql://user:pass@localhost:5432/federala',
            JWT_SECRET,
            SUPABASE_URL: 'https://example.supabase.co',
            SUPABASE_SERVICE_KEY: 'unit-test-service-key',
        });
    });

    if (options.authIdentity !== 'db') {
        // En beforeEach: sobrevive a restoreAllMocks/resetAllMocks que hagan las suites.
        beforeEach(() => {
            jest.spyOn(authIdentityService, 'findAuthIdentity').mockImplementation(async (id: number) => identities.get(id) ?? null);
        });
    }

    afterAll(() => {
        resetWebEnvForTests();
    });
}

/** Firma un JWT válido con los claims dados, sin registrar identidad en la "DB" de test. */
export function signTestToken(claims: Record<string, unknown>, options: jwt.SignOptions = {}): string {
    return jwt.sign(claims, JWT_SECRET, options);
}

export function bearer(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
}

/** Cambia (o con null elimina) el usuario vigente de un sub en la "DB" de test. */
export function setTestIdentity(sub: number, identity: Omit<AuthIdentity, 'id'> | null): void {
    if (identity == null) identities.delete(sub);
    else identities.set(sub, { id: sub, ...identity });
}

/**
 * Header Bearer de un usuario vigente con ese rol/tenant: firma el token y lo registra en la
 * "DB" de test. Sin sub explícito, cada combinación rol+tenant recibe un id propio y estable.
 */
export function authHeader(role: string, inmobiliariaId?: number, sub?: number): { Authorization: string } {
    const clave = `${role}|${inmobiliariaId ?? ''}`;
    let id = sub ?? subPorUsuario.get(clave);
    if (id == null) {
        id = 1000 + subPorUsuario.size;
        subPorUsuario.set(clave, id);
    }
    setTestIdentity(id, { email: TEST_EMAIL, role: role as AuthIdentity['role'], inmobiliariaId: inmobiliariaId ?? null });
    const token = signTestToken({ sub: id, email: TEST_EMAIL, role, ...(inmobiliariaId != null && { inmobiliariaId }) });
    return bearer(token);
}
