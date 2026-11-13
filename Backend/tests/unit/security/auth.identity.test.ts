// authenticate: el JWT prueba identidad, la DB decide la autorización vigente.
// (app real, authenticate real con su consulta real, Prisma mockeado.)
//
// Un token bien firmado y no expirado ya no alcanza: si el usuario fue eliminado → 401;
// rol y tenant salen de la DB, no de los claims (que pueden haber quedado viejos).
jest.mock('../../../src/config/prisma', () => ({
    user: { findUnique: jest.fn() },
    prioridad: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
}));

jest.mock('../../../src/services/lote.service', () => ({
    getAllLotes: jest.fn(),
}));

jest.mock('../../../src/services/usuario.service', () => ({
    getAllUsers: jest.fn(),
    deleteUser: jest.fn(),
}));

import request from 'supertest';
import app from '../../../src/app';
import prismaReal from '../../../src/config/prisma';
import { getAllLotes } from '../../../src/services/lote.service';
import { getAllUsers, deleteUser } from '../../../src/services/usuario.service';
import { bearer, signTestToken, useTestWebEnv } from '../../support/http';

const prisma = prismaReal as unknown as {
    user: { findUnique: jest.Mock };
    prioridad: { findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
};
const getAllLotesMock = getAllLotes as jest.Mock;
const getAllUsersMock = getAllUsers as jest.Mock;
const deleteUserMock = deleteUser as jest.Mock;

useTestWebEnv({ authIdentity: 'db' });

let consoleSpies: jest.SpyInstance[] = [];

beforeEach(() => {
    getAllLotesMock.mockResolvedValue({ lotes: [], total: 0 });
    getAllUsersMock.mockResolvedValue([]);
    deleteUserMock.mockResolvedValue({ message: 'ok' });
    consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
        jest.spyOn(console, m).mockImplementation(() => undefined),
    );
});

afterEach(() => {
    jest.resetAllMocks();
    consoleSpies.forEach((s) => s.mockRestore());
});

/** Fila que devuelve la consulta de identidad (forma del select de User + relación inmobiliaria). */
function dbUser(id: number, role: string, inmobiliariaId: number | null = null) {
    return { id, email: `user${id}@mail.com`, role, inmobiliaria: inmobiliariaId == null ? null : { id: inmobiliariaId } };
}

function token(claims: { sub?: unknown; role: string; inmobiliariaId?: number }) {
    return signTestToken({ email: 'viejo@mail.com', ...claims });
}

function consoleOutput(): string {
    return consoleSpies.flatMap((s) => s.mock.calls).map((args) => args.join(' ')).join('\n');
}

describe('JWT válido de un usuario que ya no existe', () => {
    test('GET /api/lotes → 401 genérico y el controller/service no se ejecuta', async () => {
        prisma.user.findUnique.mockResolvedValue(null);
        const jwt = token({ sub: 999, role: 'ADMINISTRADOR' });

        const res = await request(app).get('/api/lotes').set(bearer(jwt));

        expect(res.status).toBe(401);
        // Mismo cuerpo que un token inválido: no revela que la cuenta fue eliminada.
        expect(res.body).toEqual({ success: false, code: 'UNAUTHORIZED', message: 'Token inválido', error: 'Token inválido' });
        expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 999 } }));
        expect(getAllLotesMock).not.toHaveBeenCalled();
        expect(consoleOutput()).not.toContain(jwt);
    });
});

describe('consulta de identidad', () => {
    test('busca por el sub del token, sin leer la password', async () => {
        prisma.user.findUnique.mockResolvedValue(dbUser(7, 'ADMINISTRADOR'));

        await request(app).get('/api/lotes').set(bearer(token({ sub: 7, role: 'ADMINISTRADOR' })));

        expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
        const args = prisma.user.findUnique.mock.calls[0][0];
        expect(args.where).toEqual({ id: 7 });
        expect(args.select).toBeDefined();
        expect(args.select).not.toHaveProperty('password');
        expect(args).not.toHaveProperty('include');
    });

    test.each([
        ['sin sub', {}],
        ['sub no numérico', { sub: 'abc' }],
        ['sub cero', { sub: 0 }],
        ['sub negativo', { sub: -3 }],
        ['sub decimal', { sub: 1.5 }],
    ])('token %s → 401 sin consultar la DB', async (_caso, claims) => {
        const res = await request(app).get('/api/lotes').set(bearer(token({ ...claims, role: 'ADMINISTRADOR' })));
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ success: false, code: 'UNAUTHORIZED', message: 'Token inválido', error: 'Token inválido' });
        expect(prisma.user.findUnique).not.toHaveBeenCalled();
        expect(getAllLotesMock).not.toHaveBeenCalled();
    });

    test('si la DB falla no se responde 401 ni se deja pasar el request', async () => {
        prisma.user.findUnique.mockRejectedValue(new Error('db caída'));
        const res = await request(app).get('/api/lotes').set(bearer(token({ sub: 7, role: 'ADMINISTRADOR' })));
        expect(res.status).toBe(500);
        expect(getAllLotesMock).not.toHaveBeenCalled();
    });
});

describe('rol vigente desde la DB', () => {
    test('JWT dice GESTOR, la DB dice TECNICO → GET /api/usuarios 403', async () => {
        prisma.user.findUnique.mockResolvedValue(dbUser(7, 'TECNICO'));
        const res = await request(app).get('/api/usuarios').set(bearer(token({ sub: 7, role: 'GESTOR' })));
        expect(res.status).toBe(403);
        expect(getAllUsersMock).not.toHaveBeenCalled();
    });

    test('JWT dice ADMINISTRADOR, la DB dice GESTOR → DELETE /api/usuarios/3 403', async () => {
        prisma.user.findUnique.mockResolvedValue(dbUser(7, 'GESTOR'));
        const res = await request(app).delete('/api/usuarios/3').set(bearer(token({ sub: 7, role: 'ADMINISTRADOR' })));
        expect(res.status).toBe(403);
        expect(deleteUserMock).not.toHaveBeenCalled();
    });

    test('JWT dice TECNICO, la DB dice GESTOR → GET /api/usuarios 200 (rige la DB)', async () => {
        prisma.user.findUnique.mockResolvedValue(dbUser(7, 'GESTOR'));
        const res = await request(app).get('/api/usuarios').set(bearer(token({ sub: 7, role: 'TECNICO' })));
        expect(res.status).toBe(200);
        expect(getAllUsersMock).toHaveBeenCalledTimes(1);
    });
});

describe('tenant vigente desde la DB (Prioridades, service real)', () => {
    const JWT_TENANT_5 = () => token({ sub: 20, role: 'INMOBILIARIA', inmobiliariaId: 5 });

    function prioridad(inmobiliariaId: number) {
        return { id: 77, estado: 'CANCELADA', estadoOperativo: 'OPERATIVO', ownerType: 'INMOBILIARIA', inmobiliariaId };
    }

    test('JWT tenant 5, DB tenant 8 → el listado filtra por 8', async () => {
        prisma.user.findUnique.mockResolvedValue(dbUser(20, 'INMOBILIARIA', 8));
        prisma.prioridad.findMany.mockResolvedValue([]);

        const res = await request(app).get('/api/prioridades').set(bearer(JWT_TENANT_5()));

        expect(res.status).toBe(200);
        expect(prisma.prioridad.findMany.mock.calls[0][0].where.inmobiliariaId).toBe(8);
    });

    test('JWT tenant 5, DB tenant 8 → eliminar prioridad del tenant 5 → 403 sin update', async () => {
        prisma.user.findUnique.mockResolvedValue(dbUser(20, 'INMOBILIARIA', 8));
        prisma.prioridad.findUnique.mockResolvedValue(prioridad(5));

        const res = await request(app).patch('/api/prioridades/77/eliminar').set(bearer(JWT_TENANT_5()));

        expect(res.status).toBe(403);
        expect(prisma.prioridad.update).not.toHaveBeenCalled();
    });

    test('JWT tenant 5, DB tenant 8 → eliminar prioridad del tenant 8 → 200', async () => {
        prisma.user.findUnique.mockResolvedValue(dbUser(20, 'INMOBILIARIA', 8));
        prisma.prioridad.findUnique.mockResolvedValue(prioridad(8));
        prisma.prioridad.update.mockResolvedValue(prioridad(8));

        const res = await request(app).patch('/api/prioridades/77/eliminar').set(bearer(JWT_TENANT_5()));

        expect(res.status).toBe(200);
        expect(prisma.prioridad.update).toHaveBeenCalledTimes(1);
    });

    test('JWT tenant 5, DB sin inmobiliaria → el token no conserva el tenant: 403 (regla de Prioridades)', async () => {
        prisma.user.findUnique.mockResolvedValue(dbUser(20, 'INMOBILIARIA', null));

        const res = await request(app).get('/api/prioridades').set(bearer(JWT_TENANT_5()));

        expect(res.status).toBe(403);
        expect(prisma.prioridad.findMany).not.toHaveBeenCalled();
    });
});
