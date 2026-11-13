// D1 (escritura) — una inmobiliaria ELIMINADO no participa en operaciones nuevas.
// App real, services reales, Prisma mockeado con estado (la "DB" de inmobiliarias cambia entre requests).
//
// Regla: al ASOCIAR una inmobiliaria (alta, o update que cambia inmobiliariaId) debe estar OPERATIVO;
// si está ELIMINADO → 409 { code: 'CONFLICT', message: 'La inmobiliaria seleccionada no está disponible para operar.' }.
// Los registros históricos que ya la referencian no se tocan: un update que no cambia la inmobiliaria
// (o que reenvía la misma) sigue funcionando. Al reactivarla vuelve a ser asignable.
//
// Cubre Reserva (alta), Prioridad (alta y reasignación), Persona (alta, reasignación y miembro familiar,
// que hereda la inmobiliaria del titular). Venta: tests/unit/services/venta.service.test.ts.
// Reserva no admite cambiar la inmobiliaria en el update (400 previo): no hay reasignación que cubrir.
jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: {
        lote: { findUnique: jest.fn(), update: jest.fn() },
        reserva: { findFirst: jest.fn(), count: jest.fn(), groupBy: jest.fn() },
        persona: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
        prioridad: { findUnique: jest.fn(), findFirst: jest.fn(), count: jest.fn(), update: jest.fn(), groupBy: jest.fn() },
        venta: { count: jest.fn(), groupBy: jest.fn() },
        inmobiliaria: { findUnique: jest.fn(), update: jest.fn() },
        $transaction: jest.fn(),
    },
}));

jest.mock('../../../src/services/lote.service', () => ({
    ...jest.requireActual('../../../src/services/lote.service'),
    updateLoteState: jest.fn(async () => undefined),
}));

import request from 'supertest';
import app from '../../../src/app';
import prismaReal from '../../../src/config/prisma';
import { authHeader, useTestWebEnv } from '../../support/http';

type Mock = jest.Mock;
const prisma = prismaReal as unknown as {
    lote: { findUnique: Mock; update: Mock };
    reserva: { findFirst: Mock; count: Mock; groupBy: Mock };
    persona: { findUnique: Mock; create: Mock; update: Mock };
    prioridad: { findUnique: Mock; findFirst: Mock; count: Mock; update: Mock; groupBy: Mock };
    venta: { count: Mock; groupBy: Mock };
    inmobiliaria: { findUnique: Mock; update: Mock };
    $transaction: Mock;
};

useTestWebEnv();

const ADMIN = authHeader('ADMINISTRADOR');
const BAJA = 7;       // inmobiliaria que se da de baja en cada caso
const OPERATIVA = 8;  // otra inmobiliaria siempre OPERATIVO
const NO_DISPONIBLE = { success: false, code: 'CONFLICT', message: 'La inmobiliaria seleccionada no está disponible para operar.' };

type Estado = 'OPERATIVO' | 'ELIMINADO';
let estados: Record<number, Estado>;

function inmobiliariaRow(id: number) {
    return {
        id, nombre: `Inmobiliaria ${id}`, razonSocial: `Inmobiliaria ${id} SA`, contacto: null, comxventa: null,
        maxPrioridadesActivas: 5, estadoOperativo: estados[id], fechaBaja: null,
        createdAt: new Date('2026-01-01T00:00:00Z'), updateAt: null, userId: null,
    };
}

function personaRow(overrides: Record<string, unknown> = {}) {
    return {
        id: 5, nombre: 'Ana', apellido: 'Paz', razonSocial: null, identificadorTipo: 'DNI', identificadorValor: '12345678',
        contacto: null, categoria: 'CLIENTE', estadoOperativo: 'OPERATIVO', inmobiliariaId: BAJA, jefeDeFamiliaId: null,
        createdAt: new Date('2026-01-01T00:00:00Z'), updateAt: null, fechaBaja: null, user: null,
        inmobiliaria: { id: BAJA, nombre: 'Inmobiliaria 7' }, jefeDeFamilia: null, miembrosFamilia: [], alquileres: [],
        _count: { lotesPropios: 1, lotesAlquilados: 0, alquileres: 0, Reserva: 0, Venta: 0 },
        ...overrides,
    };
}

let consoleError: jest.SpyInstance;
beforeEach(() => {
    jest.clearAllMocks();
    estados = { [BAJA]: 'OPERATIVO', [OPERATIVA]: 'OPERATIVO' };
    prisma.inmobiliaria.findUnique.mockImplementation(async ({ where }: { where: { id: number } }) =>
        estados[where.id] ? inmobiliariaRow(where.id) : null,
    );
    prisma.inmobiliaria.update.mockImplementation(async ({ where, data }: { where: { id: number }; data: { estadoOperativo?: Estado } }) => {
        if (data.estadoOperativo) estados[where.id] = data.estadoOperativo;
        return inmobiliariaRow(where.id);
    });
    for (const d of [prisma.venta, prisma.reserva, prisma.prioridad]) {
        d.count.mockResolvedValue(0);
        d.groupBy.mockResolvedValue([]);
    }
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => consoleError.mockRestore());

// ---------------------------------------------------------------- Reserva
describe('Reserva — alta con inmobiliaria', () => {
    const body = {
        fechaReserva: '2026-12-01T00:00:00.000Z', fechaFinReserva: '2026-12-31T00:00:00.000Z',
        loteId: 10, clienteId: 20, numero: 'R-0001', ofertaInicial: 1000, inmobiliariaId: BAJA,
    };
    let tx: { reserva: { create: Mock }; ofertaReserva: { create: Mock } };

    beforeEach(() => {
        prisma.lote.findUnique.mockResolvedValue({ id: 10, estado: 'DISPONIBLE' });
        prisma.reserva.findFirst.mockResolvedValue(null);
        prisma.persona.findUnique.mockResolvedValue({ id: 20, estadoOperativo: 'OPERATIVO' });
        tx = {
            reserva: { create: jest.fn(async ({ data }) => ({ id: 1, ...data })) },
            ofertaReserva: { create: jest.fn(async () => ({ id: 1 })) },
        };
        prisma.$transaction.mockImplementation((fn: (t: unknown) => unknown) => fn(tx));
    });

    test('OPERATIVO → 201 y la reserva queda con esa inmobiliaria', async () => {
        const res = await request(app).post('/api/reservas').set(ADMIN).send(body);

        expect(res.status).toBe(201);
        expect(tx.reserva.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ inmobiliariaId: BAJA }) }));
    });

    test('ELIMINADO → 409 sin crear nada', async () => {
        estados[BAJA] = 'ELIMINADO';

        const res = await request(app).post('/api/reservas').set(ADMIN).send(body);

        expect(res.status).toBe(409);
        expect(res.body).toEqual(NO_DISPONIBLE);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    test('reactivada → vuelve a ser asignable', async () => {
        estados[BAJA] = 'ELIMINADO';
        expect((await request(app).post('/api/reservas').set(ADMIN).send(body)).status).toBe(409);

        estados[BAJA] = 'OPERATIVO';
        expect((await request(app).post('/api/reservas').set(ADMIN).send(body)).status).toBe(201);
    });

    test('sin inmobiliaria (La Federala) no consulta inmobiliarias', async () => {
        const { inmobiliariaId: _omit, ...sinInmobiliaria } = body;

        const res = await request(app).post('/api/reservas').set(ADMIN).send(sinInmobiliaria);

        expect(res.status).toBe(201);
        expect(prisma.inmobiliaria.findUnique).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------- Prioridad
describe('Prioridad — alta con inmobiliaria', () => {
    const body = {
        numero: 'P-0001', loteId: 10, fechaInicio: '2026-01-01T00:00:00.000Z', fechaFin: '2099-01-01T00:00:00.000Z',
        ownerType: 'INMOBILIARIA', inmobiliariaId: BAJA,
    };
    let tx: { prioridad: { create: Mock }; lote: { updateMany: Mock } };

    beforeEach(() => {
        prisma.lote.findUnique.mockResolvedValue({ id: 10, estado: 'DISPONIBLE' });
        prisma.prioridad.findUnique.mockResolvedValue(null);
        prisma.prioridad.findFirst.mockResolvedValue(null);
        tx = {
            prioridad: { create: jest.fn(async ({ data }) => ({ id: 1, ...data })) },
            lote: { updateMany: jest.fn(async () => ({ count: 1 })) },
        };
        prisma.$transaction.mockImplementation((fn: (t: unknown) => unknown) => fn(tx));
    });

    test('OPERATIVO → 201 con esa inmobiliaria', async () => {
        const res = await request(app).post('/api/prioridades').set(ADMIN).send(body);

        expect(res.status).toBe(201);
        expect(tx.prioridad.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ inmobiliariaId: BAJA }) }));
    });

    test('ELIMINADO → 409 sin crear nada', async () => {
        estados[BAJA] = 'ELIMINADO';

        const res = await request(app).post('/api/prioridades').set(ADMIN).send(body);

        expect(res.status).toBe(409);
        expect(res.body).toEqual(NO_DISPONIBLE);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
});

describe('Prioridad — update (histórico y reasignación)', () => {
    const prioridadHistorica = {
        id: 40, numero: 'P-0040', estado: 'ACTIVA', ownerType: 'INMOBILIARIA', inmobiliariaId: BAJA,
        fechaInicio: new Date('2026-01-01T00:00:00Z'), fechaFin: new Date('2099-01-01T00:00:00Z'),
    };

    beforeEach(() => {
        // Por id → la prioridad; por numero → libre.
        prisma.prioridad.findUnique.mockImplementation(async ({ where }: { where: { id?: number } }) =>
            where.id === 40 ? prioridadHistorica : null,
        );
        prisma.prioridad.update.mockImplementation(async ({ data }) => ({ ...prioridadHistorica, ...data }));
        estados[BAJA] = 'ELIMINADO'; // la inmobiliaria actual de la prioridad se dio de baja
    });

    test('update que no toca la inmobiliaria (numero) → 200, sin consultar inmobiliarias', async () => {
        const res = await request(app).patch('/api/prioridades/40').set(ADMIN).send({ numero: 'P-0041' });

        expect(res.status).toBe(200);
        expect(prisma.prioridad.update).toHaveBeenCalledWith(expect.objectContaining({ data: { numero: 'P-0041' } }));
        expect(prisma.inmobiliaria.findUnique).not.toHaveBeenCalled();
    });

    test('reenviar la misma inmobiliaria (ELIMINADO) → 200', async () => {
        const res = await request(app).patch('/api/prioridades/40').set(ADMIN).send({ inmobiliariaId: BAJA });

        expect(res.status).toBe(200);
    });

    test('reasignar a una OPERATIVO → 200', async () => {
        const res = await request(app).patch('/api/prioridades/40').set(ADMIN).send({ inmobiliariaId: OPERATIVA });

        expect(res.status).toBe(200);
        expect(prisma.prioridad.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ inmobiliariaId: OPERATIVA }) }));
    });

    test('reasignar a una ELIMINADO → 409 sin actualizar', async () => {
        prisma.prioridad.findUnique.mockImplementation(async ({ where }: { where: { id?: number } }) =>
            where.id === 40 ? { ...prioridadHistorica, inmobiliariaId: OPERATIVA } : null,
        );

        const res = await request(app).patch('/api/prioridades/40').set(ADMIN).send({ inmobiliariaId: BAJA });

        expect(res.status).toBe(409);
        expect(res.body).toEqual(NO_DISPONIBLE);
        expect(prisma.prioridad.update).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------- Persona
describe('Persona — alta con inmobiliaria', () => {
    const body = { identificadorTipo: 'DNI', identificadorValor: '30111222', nombre: 'Ana', apellido: 'Paz', inmobiliariaId: BAJA };

    beforeEach(() => {
        // Chequeo previo por identificador → no existe; relectura por id → la persona creada.
        prisma.persona.findUnique.mockImplementation(async ({ where }: { where: { id?: number } }) =>
            where.id ? personaRow() : null,
        );
        prisma.persona.create.mockResolvedValue({ id: 5 });
    });

    test('OPERATIVO → 201 con esa inmobiliaria', async () => {
        const res = await request(app).post('/api/personas').set(ADMIN).send(body);

        expect(res.status).toBe(201);
        expect(prisma.persona.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ inmobiliariaId: BAJA }) }));
    });

    test('ELIMINADO → 409 sin crear', async () => {
        estados[BAJA] = 'ELIMINADO';

        const res = await request(app).post('/api/personas').set(ADMIN).send(body);

        expect(res.status).toBe(409);
        expect(res.body).toEqual(NO_DISPONIBLE);
        expect(prisma.persona.create).not.toHaveBeenCalled();
    });

    test('reactivada por PATCH /api/inmobiliarias/:id/reactivar → vuelve a ser asignable', async () => {
        estados[BAJA] = 'ELIMINADO';
        expect((await request(app).post('/api/personas').set(ADMIN).send(body)).status).toBe(409);

        await request(app).patch(`/api/inmobiliarias/${BAJA}/reactivar`).set(ADMIN).expect(200);

        expect(estados[BAJA]).toBe('OPERATIVO');
        expect((await request(app).post('/api/personas').set(ADMIN).send(body)).status).toBe(201);
    });
});

describe('Persona — update (histórico y reasignación)', () => {
    beforeEach(() => {
        // Cliente histórico de la inmobiliaria BAJA, que ahora está ELIMINADO.
        estados[BAJA] = 'ELIMINADO';
        prisma.persona.findUnique.mockResolvedValue(personaRow());
        prisma.persona.update.mockImplementation(async ({ data }) => personaRow(data));
    });

    test('update que no toca la inmobiliaria → 200, sin consultar inmobiliarias', async () => {
        const res = await request(app).put('/api/personas/5').set(ADMIN).send({ nombre: 'Ana María' });

        expect(res.status).toBe(200);
        expect(prisma.persona.update).toHaveBeenCalled();
        expect(prisma.inmobiliaria.findUnique).not.toHaveBeenCalled();
    });

    test('reenviar la misma inmobiliaria (ELIMINADO) → 200', async () => {
        const res = await request(app).put('/api/personas/5').set(ADMIN).send({ nombre: 'Ana María', inmobiliariaId: BAJA });

        expect(res.status).toBe(200);
        expect(prisma.inmobiliaria.findUnique).not.toHaveBeenCalled();
    });

    test('reasignar a una OPERATIVO → 200', async () => {
        const res = await request(app).put('/api/personas/5').set(ADMIN).send({ inmobiliariaId: OPERATIVA });

        expect(res.status).toBe(200);
        expect(prisma.persona.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ inmobiliariaId: OPERATIVA }) }));
    });

    test('reasignar a una ELIMINADO → 409 sin actualizar', async () => {
        prisma.persona.findUnique.mockResolvedValue(personaRow({ inmobiliariaId: OPERATIVA }));

        const res = await request(app).put('/api/personas/5').set(ADMIN).send({ inmobiliariaId: BAJA });

        expect(res.status).toBe(409);
        expect(res.body).toEqual(NO_DISPONIBLE);
        expect(prisma.persona.update).not.toHaveBeenCalled();
    });
});

describe('Persona — miembro familiar (hereda la inmobiliaria del titular)', () => {
    const body = { nombre: 'Leo', apellido: 'Paz', identificadorTipo: 'DNI', identificadorValor: '40111222' };

    beforeEach(() => {
        // Titular (por id) propietario; identificador del miembro libre.
        prisma.persona.findUnique.mockImplementation(async ({ where }: { where: { id?: number } }) =>
            where.id === 5 ? personaRow() : null,
        );
        prisma.persona.create.mockResolvedValue({ id: 6, nombre: 'Leo', apellido: 'Paz', identificadorTipo: 'DNI', identificadorValor: '40111222' });
    });

    test('titular de una inmobiliaria OPERATIVO → 201, el miembro la hereda', async () => {
        const res = await request(app).post('/api/personas/5/grupo-familiar/miembros').set(ADMIN).send(body);

        expect(res.status).toBe(201);
        expect(prisma.persona.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ inmobiliariaId: BAJA }) }));
    });

    test('titular de una inmobiliaria ELIMINADO → 409 sin crear el miembro', async () => {
        estados[BAJA] = 'ELIMINADO';

        const res = await request(app).post('/api/personas/5/grupo-familiar/miembros').set(ADMIN).send(body);

        expect(res.status).toBe(409);
        expect(res.body).toEqual(NO_DISPONIBLE);
        expect(prisma.persona.create).not.toHaveBeenCalled();
    });
});
