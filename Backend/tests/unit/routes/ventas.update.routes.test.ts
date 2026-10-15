// Contrato de PUT /api/ventas/:id: params y body validados antes del controller.
// Regresión: la ruta aplicaba el schema del body a req.params, así que el id no se
// validaba (parseInt("5abc") === 5) y el body llegaba crudo al service.
jest.mock('../../../src/services/venta.service', () => ({
    updateVenta: jest.fn(),
}));

import request from 'supertest';
import app from '../../../src/app';
import { updateVenta } from '../../../src/services/venta.service';
import { authHeader, useTestWebEnv } from '../../support/http';

const updateVentaMock = updateVenta as jest.Mock;

useTestWebEnv();

beforeEach(() => {
    updateVentaMock.mockReset().mockResolvedValue({ id: 5 });
});

describe('PUT /api/ventas/:id — params', () => {
    test.each([['abc'], ['5abc'], ['0'], ['-5'], ['2.5']])(
        'id inválido (%s) responde 400 sin llamar al service',
        async (id) => {
            const res = await request(app)
                .put(`/api/ventas/${id}`)
                .set(authHeader('ADMINISTRADOR'))
                .send({ monto: 10 });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(updateVentaMock).not.toHaveBeenCalled();
        },
    );

    test('id válido llega como número al service', async () => {
        const res = await request(app)
            .put('/api/ventas/5')
            .set(authHeader('GESTOR'))
            .send({ monto: 10 });

        expect(res.status).toBe(200);
        expect(updateVentaMock).toHaveBeenCalledWith(5, { monto: 10 });
    });
});

describe('PUT /api/ventas/:id — body', () => {
    test.each([
        ['monto negativo', { monto: -1 }],
        ['estado fuera del enum', { estado: 'FOO' }],
        ['fechaVenta inválida', { fechaVenta: 'no-es-fecha' }],
        ['compradores vacío', { compradores: [] }],
        ['fechaEscrituraReal inválida', { estado: 'ESCRITURADO', fechaEscrituraReal: 'no-es-fecha' }],
        ['motivoCancelacion vacío', { estado: 'CANCELADA', motivoCancelacion: '   ' }],
    ])('%s responde 400 sin llamar al service', async (_label, body) => {
        const res = await request(app)
            .put('/api/ventas/5')
            .set(authHeader('ADMINISTRADOR'))
            .send(body);

        expect(res.status).toBe(400);
        expect(res.body.message).toBe('Datos inválidos');
        expect(updateVentaMock).not.toHaveBeenCalled();
    });

    test.each([
        ['ESCRITURADO sin fechaEscrituraReal', { estado: 'ESCRITURADO' }],
        ['CANCELADA sin fecha ni motivo', { estado: 'CANCELADA' }],
    ])('%s llega al service: los campos obligatorios por estado se validan contra lo persistido', async (_label, body) => {
        const res = await request(app).put('/api/ventas/5').set(authHeader('ADMINISTRADOR')).send(body);
        expect(res.status).toBe(200);
        expect(updateVentaMock).toHaveBeenCalledWith(5, body);
    });

    test('campos fuera del contrato no llegan al service', async () => {
        const res = await request(app)
            .put('/api/ventas/5')
            .set(authHeader('ADMINISTRADOR'))
            .send({
                monto: 10,
                id: 999,
                estadoOperativo: 'ELIMINADO',
                fechaBaja: '2026-01-01',
                estadoPrevio: 'INICIADA',
                reservaId: 3,
                planPagos: { deleteMany: {} },
                pagosRegistrados: { deleteMany: {} },
                archivos: { deleteMany: {} },
                reservaConsumo: { disconnect: true },
            });

        expect(res.status).toBe(200);
        expect(updateVentaMock).toHaveBeenCalledWith(5, { monto: 10 });
    });

    test('aplica las coerciones y normalizaciones del schema', async () => {
        await request(app)
            .put('/api/ventas/5')
            .set(authHeader('ADMINISTRADOR'))
            .send({
                monto: '10',
                loteId: '7',
                numero: '  V-0001  ',
                compradores: [{ personaId: '3' }],
            });

        expect(updateVentaMock).toHaveBeenCalledWith(5, {
            monto: 10,
            loteId: 7,
            numero: 'V-0001',
            compradores: [{ personaId: 3 }],
        });
    });

    // z.coerce.number() convertía null/""/false/[] en 0 y true en 1: { monto: null } persistía 0.
    test.each([
        ['null', null],
        ['string vacío', ''],
        ['solo espacios', '   '],
        ['false', false],
        ['true', true],
        ['array vacío', []],
        ['objeto', {}],
        ['texto no numérico', 'abc'],
    ])('monto %s responde 400 sin llamar al service', async (_label, monto) => {
        const res = await request(app).put('/api/ventas/5').set(authHeader('ADMINISTRADOR')).send({ monto });
        expect(res.status).toBe(400);
        expect(res.body.errors).toEqual([expect.objectContaining({ field: 'monto' })]);
        expect(updateVentaMock).not.toHaveBeenCalled();
    });

    test('monto "10" llega al service como 10', async () => {
        const res = await request(app).put('/api/ventas/5').set(authHeader('ADMINISTRADOR')).send({ monto: '10' });
        expect(res.status).toBe(200);
        expect(updateVentaMock).toHaveBeenCalledWith(5, { monto: 10 });
    });

    test.each([
        ['loteId: true', { loteId: true }, 'loteId'],
        ['compradorId: [5]', { compradorId: [5] }, 'compradorId'],
        ['inmobiliariaId: ""', { inmobiliariaId: '' }, 'inmobiliariaId'],
        ['compradores[].personaId: false', { compradores: [{ personaId: false }] }, 'compradores.0.personaId'],
    ])('id del body inválido (%s) responde 400 sin llamar al service', async (_label, body, field) => {
        const res = await request(app).put('/api/ventas/5').set(authHeader('ADMINISTRADOR')).send(body);
        expect(res.status).toBe(400);
        expect(res.body.errors).toEqual([expect.objectContaining({ field })]);
        expect(updateVentaMock).not.toHaveBeenCalled();
    });

    test('ids del body como string numérico llegan como número', async () => {
        await request(app)
            .put('/api/ventas/5')
            .set(authHeader('ADMINISTRADOR'))
            .send({ loteId: '5', compradorId: '6', inmobiliariaId: '7', compradores: [{ personaId: '8' }] });
        expect(updateVentaMock).toHaveBeenCalledWith(5, { loteId: 5, compradorId: 6, inmobiliariaId: 7, compradores: [{ personaId: 8 }] });
    });

    // Lifecycle: un null explícito no puede borrar la fecha obligatoria de ESCRITURADO.
    test('estado ESCRITURADO con fechaEscrituraReal: null responde 400 antes de modificar la venta', async () => {
        const res = await request(app)
            .put('/api/ventas/5')
            .set(authHeader('ADMINISTRADOR'))
            .send({ estado: 'ESCRITURADO', fechaEscrituraReal: null });
        expect(res.status).toBe(400);
        expect(res.body.errors).toEqual([expect.objectContaining({ field: 'fechaEscrituraReal' })]);
        expect(updateVentaMock).not.toHaveBeenCalled();
    });

    test('RBAC sin cambios: sin token 401, INMOBILIARIA y TECNICO 403', async () => {
        expect((await request(app).put('/api/ventas/5').send({ monto: 10 })).status).toBe(401);
        for (const role of ['INMOBILIARIA', 'TECNICO']) {
            const res = await request(app).put('/api/ventas/5').set(authHeader(role, 5)).send({ monto: 10 });
            expect(res.status).toBe(403);
        }
        expect(updateVentaMock).not.toHaveBeenCalled();
    });
});
