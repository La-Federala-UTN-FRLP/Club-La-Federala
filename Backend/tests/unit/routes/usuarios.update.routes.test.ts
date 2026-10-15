// Contrato de PUT /api/usuarios/:id: params y body validados antes del controller.
// Regresión: la ruta validaba un schema combinado (id + body) contra req.params, así que
// el id se validaba pero el body llegaba crudo al service.
jest.mock('../../../src/services/usuario.service', () => ({
    updateUser: jest.fn(),
}));

import request from 'supertest';
import app from '../../../src/app';
import { updateUser } from '../../../src/services/usuario.service';
import { authHeader, useTestWebEnv } from '../../support/http';

const updateUserMock = updateUser as jest.Mock;

useTestWebEnv();

beforeEach(() => {
    updateUserMock.mockReset().mockResolvedValue({ user: { id: 7 }, message: 'ok' });
});

function put(id: string, body: Record<string, unknown>, role = 'ADMINISTRADOR') {
    return request(app).put(`/api/usuarios/${id}`).set(authHeader(role)).send(body);
}

describe('PUT /api/usuarios/:id — params', () => {
    test.each([['abc'], ['7abc'], ['0'], ['-1']])('id inválido (%s) responde 400 sin llamar al service', async (id) => {
        const res = await put(id, { username: 'nuevo' });
        expect(res.status).toBe(400);
        expect(updateUserMock).not.toHaveBeenCalled();
    });
});

describe('PUT /api/usuarios/:id — body', () => {
    test.each([
        ['password corta', { password: 'a' }],
        ['email inválido', { email: 'no-es-email' }],
        ['username vacío tras normalizar', { username: '   ' }],
        ['rol fuera del enum', { rol: 'SUPERADMIN' }],
    ])('%s responde 400 sin llamar al service', async (_label, body) => {
        const res = await put('7', body);
        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Datos inválidos');
        expect(updateUserMock).not.toHaveBeenCalled();
    });

    test('campos fuera del contrato no llegan al service', async () => {
        const res = await put('7', {
            username: 'nuevo',
            id: 1,
            role: 'ADMINISTRADOR',
            createdAt: '2020-01-01',
            uplodedFiles: { deleteMany: {} },
            inmobiliaria: { disconnect: true },
        });
        expect(res.status).toBe(200);
        expect(updateUserMock).toHaveBeenCalledWith(7, { username: 'nuevo' });
    });

    test('normaliza username y email antes de validar', async () => {
        const res = await put('7', { username: '  juan  ', email: '  Usuario@Mail.COM ' });
        expect(res.status).toBe(200);
        expect(updateUserMock).toHaveBeenCalledWith(7, { username: 'juan', email: 'usuario@mail.com' });
    });

    test('la password se conserva exacta (sin trim)', async () => {
        const res = await put('7', { password: '  clave segura  ' });
        expect(res.status).toBe(200);
        const [, body] = updateUserMock.mock.calls[0];
        // Comparación sin volcar el valor en el mensaje de fallo.
        expect(body.password === '  clave segura  ').toBe(true);
    });

    test('rol del contrato público llega al service', async () => {
        await put('7', { rol: 'GESTOR' });
        expect(updateUserMock).toHaveBeenCalledWith(7, { rol: 'GESTOR' });
    });

    test('RBAC sin cambios: sin token 401, INMOBILIARIA y TECNICO 403', async () => {
        expect((await request(app).put('/api/usuarios/7').send({ username: 'x' })).status).toBe(401);
        for (const role of ['INMOBILIARIA', 'TECNICO']) {
            expect((await put('7', { username: 'x' }, role)).status).toBe(403);
        }
        expect(updateUserMock).not.toHaveBeenCalled();
    });
});
