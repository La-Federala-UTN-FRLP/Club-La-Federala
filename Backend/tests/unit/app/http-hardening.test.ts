// Hardening HTTP de la app (app real).
//
// - Sin X-Powered-By: la API no anuncia el framework.
// - express.json con tope de 1 MB: el JSON de la API es chico (los archivos van por multipart);
//   un body mayor → 413 con el contrato de error, sin llegar a la ruta.
jest.mock('../../../src/services/auth.service', () => ({
    login: jest.fn(),
}));

import request from 'supertest';
import app from '../../../src/app';
import { login } from '../../../src/services/auth.service';
import { useTestWebEnv } from '../../support/http';

const loginMock = login as jest.Mock;

useTestWebEnv();

beforeEach(() => {
    loginMock.mockReset().mockResolvedValue({ user: { id: 1 }, token: 'jwt' });
});

describe('X-Powered-By', () => {
    test.each(['/health', '/api/ruta-inexistente'])('GET %s no lo envía', async (url) => {
        const res = await request(app).get(url);

        expect(res.headers['x-powered-by']).toBeUndefined();
    });
});

describe('tope del body JSON (1 MB)', () => {
    test('payload normal → llega a la ruta', async () => {
        const res = await request(app).post('/api/auth/login').send({ email: 'ana@example.com', password: 'clave-segura' });

        expect(res.status).toBe(200);
        expect(loginMock).toHaveBeenCalledTimes(1);
    });

    test('payload de ~900 KB (debajo del tope) → no es 413', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'ana@example.com', password: 'clave-segura', relleno: 'x'.repeat(900 * 1024) });

        expect(res.status).not.toBe(413);
    });

    test('payload de ~1,2 MB → 413 con el contrato de error, sin llegar a la ruta', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'ana@example.com', password: 'clave-segura', relleno: 'x'.repeat(1200 * 1024) });

        expect(res.status).toBe(413);
        expect(res.body).toEqual({
            success: false,
            code: 'PAYLOAD_TOO_LARGE',
            message: 'El cuerpo de la solicitud supera el tamaño máximo permitido (1mb).',
        });
        expect(loginMock).not.toHaveBeenCalled();
    });
});
