// Contrato de PUT /api/lotes/:id: un update parcial solo lleva al service lo enviado.
// Regresión: el default numPartido=62 del schema de creación sobrevivía al .partial()
// y pisaba el valor guardado en cada update que no lo incluía.
jest.mock('../../../src/services/lote.service', () => ({
    updatedLote: jest.fn(),
}));

import request from 'supertest';
import app from '../../../src/app';
import { updatedLote } from '../../../src/services/lote.service';
import { authHeader, useTestWebEnv } from '../../support/http';

const updatedLoteMock = updatedLote as jest.Mock;

useTestWebEnv();

beforeEach(() => {
    updatedLoteMock.mockReset().mockResolvedValue({ id: 1 });
});

describe('PUT /api/lotes/:id', () => {
    test('update parcial sin numPartido no lo envía al service', async () => {
        const res = await request(app).put('/api/lotes/1').set(authHeader('ADMINISTRADOR')).send({ precio: 10 });
        expect(res.status).toBe(200);
        expect(updatedLoteMock).toHaveBeenCalledWith(1, { precio: 10 }, 'ADMINISTRADOR');
    });

    test('deuda como string responde 400 sin llamar al service', async () => {
        const res = await request(app).put('/api/lotes/1').set(authHeader('GESTOR')).send({ deuda: 'false' });
        expect(res.status).toBe(400);
        expect(updatedLoteMock).not.toHaveBeenCalled();
    });

    test('deuda boolean llega intacta', async () => {
        await request(app).put('/api/lotes/1').set(authHeader('GESTOR')).send({ deuda: false });
        expect(updatedLoteMock).toHaveBeenCalledWith(1, { deuda: false }, 'GESTOR');
    });
});
