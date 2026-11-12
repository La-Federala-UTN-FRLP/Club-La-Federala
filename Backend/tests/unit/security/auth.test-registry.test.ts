// El registro de identidades del helper HTTP representa la DB que lee authenticate:
// las suites pueden eliminar un usuario o cambiarle el rol/tenant sin tocar Prisma.
jest.mock('../../../src/services/usuario.service', () => ({
    getAllUsers: jest.fn().mockResolvedValue([]),
}));

import request from 'supertest';
import app from '../../../src/app';
import { authHeader, setTestIdentity, signTestToken, bearer, useTestWebEnv } from '../../support/http';

useTestWebEnv();

describe('registro de identidades de test', () => {
    test('authHeader representa a un usuario vigente con ese rol', async () => {
        const res = await request(app).get('/api/usuarios').set(authHeader('GESTOR', undefined, 41));
        expect(res.status).toBe(200);
    });

    test('usuario eliminado del registro → 401 con el mismo token', async () => {
        const headers = authHeader('GESTOR', undefined, 42);
        setTestIdentity(42, null);
        const res = await request(app).get('/api/usuarios').set(headers);
        expect(res.status).toBe(401);
    });

    test('rol cambiado en el registro → rige el rol nuevo', async () => {
        const headers = authHeader('GESTOR', undefined, 43);
        setTestIdentity(43, { email: 'test@example.com', role: 'TECNICO', inmobiliariaId: null });
        const res = await request(app).get('/api/usuarios').set(headers);
        expect(res.status).toBe(403);
    });

    test('signTestToken no registra: token válido de un usuario inexistente → 401', async () => {
        const res = await request(app).get('/api/usuarios').set(bearer(signTestToken({ sub: 44, role: 'ADMINISTRADOR' })));
        expect(res.status).toBe(401);
    });

    test('sin sub explícito, roles distintos son usuarios distintos', async () => {
        const gestor = authHeader('GESTOR');
        const tecnico = authHeader('TECNICO');
        expect((await request(app).get('/api/usuarios').set(gestor)).status).toBe(200);
        expect((await request(app).get('/api/usuarios').set(tecnico)).status).toBe(403);
    });
});
