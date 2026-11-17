// Usuario INMOBILIARIA cuya inmobiliaria está ELIMINADO (app real, login, authenticate y services
// de inmobiliarias reales; Prisma mockeado).
//
// Decisión de producto D1: una inmobiliaria ELIMINADO no puede loguearse ni operar y no aparece en
// superficies operativas; queda persistida para historial y recupera acceso y visibilidad al
// reactivarse.
//
// Contrato:
// - login → 401 con el mismo body que unas credenciales inválidas (anti-enumeración), sin token,
//   y la comparación bcrypt se hace igual;
// - token emitido antes de la baja → 401 "Token inválido" genérico (authenticate relee la identidad
//   de la DB en cada request: sin blacklist ni revocaciones);
// - reactivar → el mismo usuario y el mismo token vuelven a funcionar;
// - GET /api/inmobiliarias sin filtro (lo usan los selects operativos) → solo OPERATIVO;
//   la administración la encuentra con ?estadoOperativo=ELIMINADO o por id, y la reactiva.
// Los casos OPERATIVO son el control: no deben bloquearse.
jest.mock('../../../src/config/prisma', () => ({
    __esModule: true,
    default: {
        user: { findUnique: jest.fn() },
        inmobiliaria: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
        venta: { groupBy: jest.fn(), count: jest.fn() },
        reserva: { groupBy: jest.fn(), count: jest.fn() },
        prioridad: { groupBy: jest.fn(), count: jest.fn() },
    },
}));

jest.mock('../../../src/services/lote.service', () => ({
    getAllLotes: jest.fn(),
}));

import bcrypt from 'bcrypt';
import request from 'supertest';
import app from '../../../src/app';
import prismaReal from '../../../src/config/prisma';
import { getAllLotes } from '../../../src/services/lote.service';
import { bearer, signTestToken, useTestWebEnv } from '../../support/http';

type Mock = jest.Mock;
const prisma = prismaReal as unknown as {
    user: { findUnique: Mock };
    inmobiliaria: { findMany: Mock; count: Mock; findUnique: Mock; update: Mock };
    venta: { groupBy: Mock; count: Mock };
    reserva: { groupBy: Mock; count: Mock };
    prioridad: { groupBy: Mock; count: Mock };
};
const getAllLotesMock = getAllLotes as Mock;

useTestWebEnv({ authIdentity: 'db' });

const USER_ID = 50;
const ADMIN_ID = 1;
const TENANT = 7;
const OTRA_INMOBILIARIA = 8;
const EMAIL = 'inmo@example.com';
const PASSWORD = 'Secreta123';
const CREDENCIALES_INVALIDAS = { success: false, code: 'UNAUTHORIZED', message: 'Credenciales inválidas' };
const TOKEN_INVALIDO = { success: false, code: 'UNAUTHORIZED', message: 'Token inválido', error: 'Token inválido' };

type EstadoOperativo = 'OPERATIVO' | 'ELIMINADO';

let passwordHash: string;
beforeAll(() => {
    passwordHash = bcrypt.hashSync(PASSWORD, 4);
});

// "DB" de la suite: el estado de la inmobiliaria del usuario cambia entre requests.
let estadoInmobiliaria: EstadoOperativo;

function inmobiliariaRow(id: number, estadoOperativo: EstadoOperativo) {
    return {
        id,
        nombre: `Inmobiliaria ${id}`,
        razonSocial: `Inmobiliaria ${id} SA`,
        contacto: null,
        comxventa: null,
        maxPrioridadesActivas: 5,
        estadoOperativo,
        fechaBaja: estadoOperativo === 'ELIMINADO' ? new Date('2026-05-01T00:00:00Z') : null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updateAt: null,
        userId: id === TENANT ? USER_ID : null,
    };
}

/** Fila User como la devuelve Prisma (el mock ignora el select: trae lo que necesite cada camino). */
function usuarioInmobiliaria() {
    return {
        id: USER_ID,
        username: 'inmo',
        email: EMAIL,
        password: passwordHash,
        role: 'INMOBILIARIA',
        inmobiliaria: inmobiliariaRow(TENANT, estadoInmobiliaria),
    };
}

const ADMIN_USER = { id: ADMIN_ID, email: 'admin@example.com', role: 'ADMINISTRADOR', inmobiliaria: null };

let consoleSpies: jest.SpyInstance[] = [];
beforeEach(() => {
    jest.clearAllMocks();
    estadoInmobiliaria = 'OPERATIVO';
    getAllLotesMock.mockResolvedValue({ lotes: [], total: 0 });

    // login busca por email; authenticate busca por id.
    prisma.user.findUnique.mockImplementation(async ({ where }: { where: { id?: number; email?: string } }) => {
        if (where.email === EMAIL || where.id === USER_ID) return usuarioInmobiliaria();
        if (where.id === ADMIN_ID) return ADMIN_USER;
        return null;
    });

    // Inmobiliarias: el mock filtra por estadoOperativo como lo haría la DB.
    const tabla = () => [inmobiliariaRow(TENANT, estadoInmobiliaria), inmobiliariaRow(OTRA_INMOBILIARIA, 'OPERATIVO')];
    prisma.inmobiliaria.findMany.mockImplementation(async ({ where }: { where?: { estadoOperativo?: string } }) =>
        tabla().filter((r) => !where?.estadoOperativo || r.estadoOperativo === where.estadoOperativo),
    );
    prisma.inmobiliaria.count.mockImplementation(async () => tabla().length);
    prisma.inmobiliaria.findUnique.mockImplementation(async ({ where }: { where: { id: number } }) =>
        tabla().find((r) => r.id === where.id) ?? null,
    );
    prisma.inmobiliaria.update.mockImplementation(async ({ where, data }: { where: { id: number }; data: { estadoOperativo?: EstadoOperativo } }) => {
        if (where.id === TENANT && data.estadoOperativo) estadoInmobiliaria = data.estadoOperativo;
        return inmobiliariaRow(where.id, where.id === TENANT ? estadoInmobiliaria : 'OPERATIVO');
    });
    for (const delegate of [prisma.venta, prisma.reserva, prisma.prioridad]) {
        delegate.groupBy.mockResolvedValue([]);
        delegate.count.mockResolvedValue(0);
    }

    consoleSpies = [
        jest.spyOn(console, 'warn').mockImplementation(() => undefined),
        jest.spyOn(console, 'error').mockImplementation(() => undefined),
    ];
});
afterEach(() => {
    consoleSpies.forEach((s) => s.mockRestore());
    jest.restoreAllMocks();
});

const login = (password = PASSWORD, email = EMAIL) => request(app).post('/api/auth/login').send({ email, password });
const TOKEN_PREVIO = bearer(signTestToken({ sub: USER_ID, email: EMAIL, role: 'INMOBILIARIA', inmobiliariaId: TENANT }));
const ADMIN = bearer(signTestToken({ sub: ADMIN_ID, email: ADMIN_USER.email, role: 'ADMINISTRADOR' }));

describe('POST /api/auth/login', () => {
    test('inmobiliaria ELIMINADO: rechazo sin token', async () => {
        estadoInmobiliaria = 'ELIMINADO';

        const res = await login();

        expect(res.status).toBe(401);
        expect(res.body?.data?.token).toBeUndefined();
        expect(res.body?.token).toBeUndefined();
    });

    test('inmobiliaria ELIMINADO: mismo body que password incorrecta o usuario inexistente', async () => {
        estadoInmobiliaria = 'ELIMINADO';
        const baja = await login();
        estadoInmobiliaria = 'OPERATIVO';
        const passwordMala = await login('OtraClave99');
        const inexistente = await login(PASSWORD, 'nadie@example.com');

        for (const res of [baja, passwordMala, inexistente]) {
            expect(res.status).toBe(401);
            expect(res.body).toEqual(CREDENCIALES_INVALIDAS);
        }
    });

    test('inmobiliaria ELIMINADO: la comparación bcrypt se hace igual (sin atajo por el estado)', async () => {
        estadoInmobiliaria = 'ELIMINADO';
        const compare = jest.spyOn(bcrypt, 'compare');

        await login();

        expect(compare).toHaveBeenCalledTimes(1);
        expect(compare).toHaveBeenCalledWith(PASSWORD, passwordHash);
    });

    test('control — inmobiliaria OPERATIVO: 200 con token', async () => {
        const res = await login();

        expect(res.status).toBe(200);
        expect(typeof res.body.data.token).toBe('string');
    });

    test('reactivada: el mismo usuario vuelve a entrar', async () => {
        estadoInmobiliaria = 'ELIMINADO';
        expect((await login()).status).toBe(401);

        await request(app).patch(`/api/inmobiliarias/${TENANT}/reactivar`).set(ADMIN).expect(200);

        const res = await login();
        expect(res.status).toBe(200);
        expect(typeof res.body.data.token).toBe('string');
    });
});

describe('request autenticado con un token emitido antes de la baja', () => {
    test('inmobiliaria ELIMINADO: GET /api/lotes rechazado y sin llegar al service', async () => {
        estadoInmobiliaria = 'ELIMINADO';

        const res = await request(app).get('/api/lotes').set(TOKEN_PREVIO);

        expect(res.status).toBe(401);
        expect(res.body).toEqual(TOKEN_INVALIDO);
        expect(getAllLotesMock).not.toHaveBeenCalled();
    });

    test('control — inmobiliaria OPERATIVO: GET /api/lotes 200', async () => {
        const res = await request(app).get('/api/lotes').set(TOKEN_PREVIO);

        expect(res.status).toBe(200);
        expect(getAllLotesMock).toHaveBeenCalledTimes(1);
    });

    test('mismo token: OPERATIVO → baja → reactivación (la DB decide en cada request)', async () => {
        expect((await request(app).get('/api/lotes').set(TOKEN_PREVIO)).status).toBe(200);

        await request(app).patch(`/api/inmobiliarias/${TENANT}/eliminar`).set(ADMIN).expect(200);
        expect(estadoInmobiliaria).toBe('ELIMINADO');
        expect((await request(app).get('/api/lotes').set(TOKEN_PREVIO)).status).toBe(401);

        await request(app).patch(`/api/inmobiliarias/${TENANT}/reactivar`).set(ADMIN).expect(200);
        expect(estadoInmobiliaria).toBe('OPERATIVO');
        expect((await request(app).get('/api/lotes').set(TOKEN_PREVIO)).status).toBe(200);
    });
});

describe('visibilidad: operación vs administración', () => {
    const ids = (res: request.Response) => res.body.data.inmobiliarias.map((i: { idInmobiliaria: number }) => i.idInmobiliaria);

    test('listado sin filtro (selects operativos): la ELIMINADO no aparece', async () => {
        estadoInmobiliaria = 'ELIMINADO';

        // Los selects mandan {} o ?estado=OPERATIVO (parámetro que el listado ignora).
        for (const url of ['/api/inmobiliarias', '/api/inmobiliarias?estado=OPERATIVO']) {
            const res = await request(app).get(url).set(ADMIN);
            expect(res.status).toBe(200);
            expect(ids(res)).toEqual([OTRA_INMOBILIARIA]);
        }
    });

    test('administración: la encuentra con ?estadoOperativo=ELIMINADO y por id', async () => {
        estadoInmobiliaria = 'ELIMINADO';

        const listado = await request(app).get('/api/inmobiliarias?estadoOperativo=ELIMINADO').set(ADMIN);
        expect(listado.status).toBe(200);
        expect(ids(listado)).toEqual([TENANT]);

        const detalle = await request(app).get(`/api/inmobiliarias/${TENANT}`).set(ADMIN);
        expect(detalle.status).toBe(200);
        expect(detalle.body.data.inmobiliaria).toEqual(expect.objectContaining({ idInmobiliaria: TENANT, estado: 'ELIMINADO' }));
    });

    test('reactivada: vuelve a aparecer en el listado operativo', async () => {
        estadoInmobiliaria = 'ELIMINADO';

        await request(app).patch(`/api/inmobiliarias/${TENANT}/reactivar`).set(ADMIN).expect(200);

        const res = await request(app).get('/api/inmobiliarias').set(ADMIN);
        expect(ids(res)).toEqual([TENANT, OTRA_INMOBILIARIA]);
    });
});
