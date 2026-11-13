// Aislamiento por tenant en /api/prioridades (app real + service real, Prisma mockeado).
//
// Un usuario INMOBILIARIA sin inmobiliariaId no tiene tenant: cualquier operación que dependa
// del tenant responde 403 y nunca cae en el camino de ADMINISTRADOR/GESTOR (ver todo, operar
// sobre prioridades ajenas). INMOBILIARIA con tenant opera solo sobre lo propio.
jest.mock('../../../src/config/prisma', () => {
    const delegate = () => ({
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
    });
    const tx = { prioridad: delegate(), lote: delegate() };
    return {
        prioridad: delegate(),
        lote: delegate(),
        inmobiliaria: delegate(),
        __tx: tx,
        $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    };
});

import request from 'supertest';
import app from '../../../src/app';
import prismaReal from '../../../src/config/prisma';
import { resetPrismaMock } from '../../support/mocks/prisma';
import { authHeader, useTestWebEnv } from '../../support/http';

type Delegate = Record<'findMany' | 'findUnique' | 'findFirst' | 'count' | 'create' | 'update' | 'updateMany', jest.Mock>;
const prisma = prismaReal as unknown as {
    prioridad: Delegate;
    lote: Delegate;
    inmobiliaria: Delegate;
    __tx: { prioridad: Delegate; lote: Delegate };
    $transaction: jest.Mock;
};

useTestWebEnv();

const TENANT_PROPIO = 5;
const TENANT_AJENO = 9;

function buildPrioridad(overrides: Record<string, unknown> = {}) {
    return {
        id: 77,
        numero: 'P-77',
        estado: 'CANCELADA',
        estadoOperativo: 'OPERATIVO',
        ownerType: 'INMOBILIARIA',
        inmobiliariaId: TENANT_AJENO,
        loteId: 3,
        loteEstadoAlCrear: 'DISPONIBLE',
        fechaInicio: new Date('2026-01-01T00:00:00Z'),
        fechaFin: new Date('2027-01-01T00:00:00Z'),
        ...overrides,
    };
}

afterEach(() => {
    resetPrismaMock(prisma);
});

// Toda escritura posible sobre Prisma, directa o dentro de una transacción.
function expectSinEscrituras() {
    expect(prisma.prioridad.update).not.toHaveBeenCalled();
    expect(prisma.prioridad.create).not.toHaveBeenCalled();
    expect(prisma.lote.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.__tx.prioridad.update).not.toHaveBeenCalled();
    expect(prisma.__tx.prioridad.updateMany).not.toHaveBeenCalled();
    expect(prisma.__tx.prioridad.create).not.toHaveBeenCalled();
    expect(prisma.__tx.lote.update).not.toHaveBeenCalled();
}

const FUTURO = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

// Operaciones de Prioridades que dependen del tenant cuando el actor es INMOBILIARIA.
// (POST /jobs/expire no aplica: la ruta ya excluye a INMOBILIARIA.)
const OPERACIONES: Array<{ op: string; method: 'get' | 'post' | 'patch'; url: string; body?: object }> = [
    { op: 'listar', method: 'get', url: '/api/prioridades' },
    { op: 'ver detalle', method: 'get', url: '/api/prioridades/77' },
    { op: 'crear', method: 'post', url: '/api/prioridades', body: { numero: 'P-NEW', loteId: 3, fechaInicio: new Date().toISOString(), fechaFin: FUTURO } },
    { op: 'editar', method: 'patch', url: '/api/prioridades/77', body: { numero: 'P-78' } },
    { op: 'cancelar', method: 'patch', url: '/api/prioridades/77/cancelar' },
    { op: 'finalizar', method: 'patch', url: '/api/prioridades/77/finalizar' },
    { op: 'eliminar', method: 'patch', url: '/api/prioridades/77/eliminar' },
    { op: 'reactivar', method: 'patch', url: '/api/prioridades/77/reactivar' },
];

function enviar(op: (typeof OPERACIONES)[number], headers: { Authorization: string }) {
    const req = request(app)[op.method](op.url).set(headers);
    return op.body ? req.send(op.body) : req;
}

describe('INMOBILIARIA sin inmobiliariaId → 403 en toda operación de Prioridades', () => {
    const SIN_TENANT = authHeader('INMOBILIARIA');

    beforeEach(() => {
        // Escenario más permisivo posible: si la guarda no corta antes, la operación avanza.
        prisma.prioridad.findMany.mockResolvedValue([buildPrioridad()]);
        prisma.prioridad.findUnique.mockImplementation(({ where }: { where: { id?: number } }) =>
            Promise.resolve(where.id === 77 ? buildPrioridad({ estado: 'ACTIVA', estadoOperativo: 'OPERATIVO' }) : null),
        );
        prisma.prioridad.update.mockResolvedValue(buildPrioridad());
        prisma.lote.findUnique.mockResolvedValue({ id: 3, estado: 'DISPONIBLE' });
    });

    test.each(OPERACIONES)('$op ($method $url) → 403 sin escrituras', async (op) => {
        const res = await enviar(op, SIN_TENANT);

        expect(res.status).toBe(403);
        expect(res.body).toEqual(expect.objectContaining({ success: false }));
        expectSinEscrituras();
    });

    test('listar no consulta prioridades (no hay fallback a vista staff)', async () => {
        await request(app).get('/api/prioridades?inmobiliariaId=9').set(SIN_TENANT);
        expect(prisma.prioridad.findMany).not.toHaveBeenCalled();
    });

    test.each([
        ['eliminar', '/api/prioridades/77/eliminar', { estado: 'CANCELADA', estadoOperativo: 'OPERATIVO' }],
        ['reactivar', '/api/prioridades/77/reactivar', { estado: 'CANCELADA', estadoOperativo: 'ELIMINADO' }],
    ])('%s prioridad ajena en estado válido → 403 y prioridad.update no se ejecuta', async (_op, url, estado) => {
        prisma.prioridad.findUnique.mockResolvedValue(buildPrioridad(estado));
        const res = await request(app).patch(url).set(SIN_TENANT);
        expect(res.status).toBe(403);
        expect(prisma.prioridad.update).not.toHaveBeenCalled();
    });
});

describe('INMOBILIARIA con tenant: solo opera sobre lo propio', () => {
    const PROPIO = authHeader('INMOBILIARIA', TENANT_PROPIO);

    test('listar con ?inmobiliariaId=9 filtra igual por el tenant del token (5)', async () => {
        prisma.prioridad.findMany.mockResolvedValue([]);
        const res = await request(app).get(`/api/prioridades?inmobiliariaId=${TENANT_AJENO}`).set(PROPIO);
        expect(res.status).toBe(200);
        expect(prisma.prioridad.findMany.mock.calls[0][0].where.inmobiliariaId).toBe(TENANT_PROPIO);
    });

    test.each([
        ['ver detalle', 'get', '/api/prioridades/77', {}],
        ['eliminar', 'patch', '/api/prioridades/77/eliminar', { estado: 'CANCELADA', estadoOperativo: 'OPERATIVO' }],
        ['reactivar', 'patch', '/api/prioridades/77/reactivar', { estado: 'CANCELADA', estadoOperativo: 'ELIMINADO' }],
        ['cancelar', 'patch', '/api/prioridades/77/cancelar', { estado: 'ACTIVA' }],
        ['finalizar', 'patch', '/api/prioridades/77/finalizar', { estado: 'ACTIVA' }],
        ['editar', 'patch', '/api/prioridades/77', { estado: 'ACTIVA' }],
    ] as const)('%s prioridad del tenant 9 → 403 sin escrituras', async (_op, method, url, estado) => {
        prisma.prioridad.findUnique.mockResolvedValue(buildPrioridad({ ...estado, inmobiliariaId: TENANT_AJENO }));
        const req = request(app)[method](url).set(PROPIO);
        const res = await (method === 'patch' && url === '/api/prioridades/77' ? req.send({ numero: 'P-78' }) : req);
        expect(res.status).toBe(403);
        expectSinEscrituras();
    });

    test.each([
        ['eliminar', '/api/prioridades/77/eliminar', { estado: 'CANCELADA', estadoOperativo: 'OPERATIVO' }, 'ELIMINADO'],
        ['reactivar', '/api/prioridades/77/reactivar', { estado: 'CANCELADA', estadoOperativo: 'ELIMINADO' }, 'OPERATIVO'],
    ])('%s prioridad propia → 200', async (_op, url, estado, estadoOperativoFinal) => {
        prisma.prioridad.findUnique.mockResolvedValue(buildPrioridad({ ...estado, inmobiliariaId: TENANT_PROPIO }));
        prisma.prioridad.update.mockResolvedValue(buildPrioridad({ inmobiliariaId: TENANT_PROPIO }));
        const res = await request(app).patch(url).set(PROPIO);
        expect(res.status).toBe(200);
        expect(prisma.prioridad.update).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 77 }, data: { estadoOperativo: estadoOperativoFinal } }),
        );
    });
});

describe.each(['ADMINISTRADOR', 'GESTOR'])('%s conserva el comportamiento staff', (role) => {
    const STAFF = authHeader(role);

    test('listar sin filtro no restringe por inmobiliaria', async () => {
        prisma.prioridad.findMany.mockResolvedValue([]);
        const res = await request(app).get('/api/prioridades').set(STAFF);
        expect(res.status).toBe(200);
        expect(prisma.prioridad.findMany.mock.calls[0][0].where).not.toHaveProperty('inmobiliariaId');
    });

    test('listar con ?inmobiliariaId=9 filtra por 9', async () => {
        prisma.prioridad.findMany.mockResolvedValue([]);
        await request(app).get(`/api/prioridades?inmobiliariaId=${TENANT_AJENO}`).set(STAFF);
        expect(prisma.prioridad.findMany.mock.calls[0][0].where.inmobiliariaId).toBe(TENANT_AJENO);
    });

    test.each([
        ['eliminar', '/api/prioridades/77/eliminar', { estado: 'CANCELADA', estadoOperativo: 'OPERATIVO' }],
        ['reactivar', '/api/prioridades/77/reactivar', { estado: 'CANCELADA', estadoOperativo: 'ELIMINADO' }],
    ])('%s prioridad de cualquier inmobiliaria → 200', async (_op, url, estado) => {
        prisma.prioridad.findUnique.mockResolvedValue(buildPrioridad(estado));
        prisma.prioridad.update.mockResolvedValue(buildPrioridad());
        const res = await request(app).patch(url).set(STAFF);
        expect(res.status).toBe(200);
        expect(prisma.prioridad.update).toHaveBeenCalledTimes(1);
    });

    test('ver detalle de prioridad del tenant 9 → 200', async () => {
        prisma.prioridad.findUnique.mockResolvedValue(buildPrioridad());
        const res = await request(app).get('/api/prioridades/77').set(STAFF);
        expect(res.status).toBe(200);
    });
});

// Cancelar/finalizar: la pertenencia se valida ANTES que el estado. Si no, el 400
// ("solo prioridades ACTIVA") frente al 403 delata si una prioridad ajena está activa.
// El dueño legítimo sigue recibiendo el error de negocio específico.
describe.each(['cancelar', 'finalizar'] as const)('PATCH /api/prioridades/:id/%s — pertenencia antes que estado', (op) => {
    const url = `/api/prioridades/77/${op}`;
    const PROPIO = authHeader('INMOBILIARIA', TENANT_PROPIO);
    const NO_ACTIVAS = ['CANCELADA', 'FINALIZADA', 'EXPIRADA'] as const;
    const AJENA = { ownerType: 'INMOBILIARIA', inmobiliariaId: TENANT_AJENO };
    const CCLF = { ownerType: 'CCLF', inmobiliariaId: null };
    const PROPIA = { ownerType: 'INMOBILIARIA', inmobiliariaId: TENANT_PROPIO };

    function stub(prioridad: Record<string, unknown> | null) {
        prisma.prioridad.findUnique.mockResolvedValue(prioridad && buildPrioridad(prioridad));
        // El cierre escribe condicionado a ACTIVA (updateMany) y relee la fila resultante.
        prisma.__tx.prioridad.updateMany.mockResolvedValue({ count: 1 });
        prisma.__tx.prioridad.findUnique.mockResolvedValue(buildPrioridad());
        prisma.__tx.lote.findUnique.mockResolvedValue({ estado: 'DISPONIBLE' });
    }

    test.each([
        ...NO_ACTIVAS.map((estado) => ['ajena', estado, AJENA] as const),
        ['ajena', 'ACTIVA', AJENA] as const,
        ...NO_ACTIVAS.map((estado) => ['CCLF', estado, CCLF] as const),
        ['CCLF', 'ACTIVA', CCLF] as const,
    ])('I tenant 5 → prioridad %s en estado %s → 403 sin escrituras', async (_dueño, estado, owner) => {
        stub({ ...owner, estado });
        const res = await request(app).patch(url).set(PROPIO);
        expect(res.status).toBe(403);
        expectSinEscrituras();
    });

    test.each(NO_ACTIVAS)('I tenant 5 → prioridad propia en estado %s → 400 con el motivo de negocio', async (estado) => {
        stub({ ...PROPIA, estado });
        const res = await request(app).patch(url).set(PROPIO);
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/Solo se pueden .* prioridades ACTIVA/);
        expectSinEscrituras();
    });

    test('I tenant 5 → prioridad propia ACTIVA → 200', async () => {
        stub({ ...PROPIA, estado: 'ACTIVA' });
        const res = await request(app).patch(url).set(PROPIO);
        expect(res.status).toBe(200);
        expect(prisma.__tx.prioridad.updateMany).toHaveBeenCalledTimes(1);
    });

    test('I tenant 5 → prioridad inexistente → 404 sin escrituras', async () => {
        stub(null);
        const res = await request(app).patch(url).set(PROPIO);
        expect(res.status).toBe(404);
        expectSinEscrituras();
    });

    describe.each(['ADMINISTRADOR', 'GESTOR'])('%s (staff)', (role) => {
        test.each(NO_ACTIVAS)('prioridad de otra inmobiliaria en estado %s → 400', async (estado) => {
            stub({ ...AJENA, estado });
            const res = await request(app).patch(url).set(authHeader(role));
            expect(res.status).toBe(400);
            expectSinEscrituras();
        });

        test('prioridad de otra inmobiliaria ACTIVA → 200', async () => {
            stub({ ...AJENA, estado: 'ACTIVA' });
            const res = await request(app).patch(url).set(authHeader(role));
            expect(res.status).toBe(200);
            expect(prisma.__tx.prioridad.updateMany).toHaveBeenCalledTimes(1);
        });
    });
});
