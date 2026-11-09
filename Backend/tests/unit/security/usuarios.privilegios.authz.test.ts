// Administración de usuarios: GESTOR no escala a ADMINISTRADOR ni elimina usuarios
// (app real + service real, Prisma mockeado).
//
// authorize('ADMINISTRADOR', 'GESTOR') no alcanza: dentro de la misma ruta hay operaciones
// permitidas y prohibidas según el actor, el usuario objetivo y el rol pedido.
jest.mock('../../../src/config/prisma', () => ({
    user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    },
}));

jest.mock('bcrypt', () => ({
    hash: jest.fn().mockResolvedValue('hashed'),
}));

import request from 'supertest';
import app from '../../../src/app';
import prismaReal from '../../../src/config/prisma';
import { authHeader, useTestWebEnv } from '../../support/http';

const prisma = prismaReal as unknown as {
    user: Record<'findUnique' | 'create' | 'update' | 'delete', jest.Mock>;
};

useTestWebEnv();

// Usuarios existentes en el escenario (el actor GESTOR es el id 1 del token).
const USUARIOS: Record<number, { id: number; username: string; email: string; role: string }> = {
    1: { id: 1, username: 'gestor', email: 'gestor@mail.com', role: 'GESTOR' },
    2: { id: 2, username: 'admin', email: 'admin@mail.com', role: 'ADMINISTRADOR' },
    3: { id: 3, username: 'tecnico', email: 'tecnico@mail.com', role: 'TECNICO' },
};

beforeEach(() => {
    prisma.user.findUnique.mockImplementation(({ where }: { where: { id?: number; email?: string } }) => {
        if (where.id !== undefined) return Promise.resolve(USUARIOS[where.id] ?? null);
        return Promise.resolve(null); // email libre para altas
    });
    prisma.user.create.mockImplementation(({ data }: { data: object }) => Promise.resolve({ id: 10, ...data }));
    prisma.user.update.mockImplementation(({ where, data }: { where: { id: number }; data: object }) =>
        Promise.resolve({ ...USUARIOS[where.id], ...data }),
    );
    prisma.user.delete.mockResolvedValue({});
});

afterEach(() => {
    jest.clearAllMocks();
});

const ADMIN = authHeader('ADMINISTRADOR', undefined, 2);
const GESTOR = authHeader('GESTOR', undefined, 1);

const alta = (rol: string) => ({ username: `nuevo-${rol.toLowerCase()}`, password: 'clave-segura', email: `${rol.toLowerCase()}@mail.com`, rol });

describe('ADMINISTRADOR administra cualquier usuario', () => {
    test('crear ADMINISTRADOR → 201', async () => {
        const res = await request(app).post('/api/usuarios').set(ADMIN).send(alta('ADMINISTRADOR'));
        expect(res.status).toBe(201);
        expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: 'ADMINISTRADOR' }) }));
    });

    test('editar un ADMINISTRADOR existente → 200', async () => {
        const res = await request(app).put('/api/usuarios/2').set(ADMIN).send({ username: 'admin-2' });
        expect(res.status).toBe(200);
        expect(prisma.user.update).toHaveBeenCalledTimes(1);
    });

    test('promover un usuario a ADMINISTRADOR → 200', async () => {
        const res = await request(app).put('/api/usuarios/3').set(ADMIN).send({ rol: 'ADMINISTRADOR' });
        expect(res.status).toBe(200);
        expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { role: 'ADMINISTRADOR' } }));
    });

    test('eliminar usuario → 200', async () => {
        const res = await request(app).delete('/api/usuarios/3').set(ADMIN);
        expect(res.status).toBe(200);
        expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 3 } });
    });
});

describe('GESTOR administra usuarios comunes', () => {
    test.each(['GESTOR', 'TECNICO', 'INMOBILIARIA'])('crear usuario %s → 201', async (rol) => {
        const res = await request(app).post('/api/usuarios').set(GESTOR).send(alta(rol));
        expect(res.status).toBe(201);
        expect(prisma.user.create).toHaveBeenCalledTimes(1);
    });

    test('editar usuario común → 200', async () => {
        const res = await request(app).put('/api/usuarios/3').set(GESTOR).send({ username: 'tecnico-2' });
        expect(res.status).toBe(200);
        expect(prisma.user.update).toHaveBeenCalledTimes(1);
    });

    test('cambiar rol de un usuario común a otro rol no privilegiado → 200', async () => {
        const res = await request(app).put('/api/usuarios/3').set(GESTOR).send({ rol: 'GESTOR' });
        expect(res.status).toBe(200);
        expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { role: 'GESTOR' } }));
    });

    test('editar usuario inexistente → 404', async () => {
        const res = await request(app).put('/api/usuarios/99').set(GESTOR).send({ username: 'x' });
        expect(res.status).toBe(404);
        expect(prisma.user.update).not.toHaveBeenCalled();
    });
});

describe('GESTOR no escala privilegios → 403 sin escrituras', () => {
    test('crear un ADMINISTRADOR', async () => {
        const res = await request(app).post('/api/usuarios').set(GESTOR).send(alta('ADMINISTRADOR'));
        expect(res.status).toBe(403);
        expect(prisma.user.create).not.toHaveBeenCalled();
    });

    test('promover otro usuario a ADMINISTRADOR', async () => {
        const res = await request(app).put('/api/usuarios/3').set(GESTOR).send({ rol: 'ADMINISTRADOR' });
        expect(res.status).toBe(403);
        expect(prisma.user.update).not.toHaveBeenCalled();
    });

    test('auto-promoverse a ADMINISTRADOR', async () => {
        const res = await request(app).put('/api/usuarios/1').set(GESTOR).send({ rol: 'ADMINISTRADOR' });
        expect(res.status).toBe(403);
        expect(prisma.user.update).not.toHaveBeenCalled();
    });

    test.each([
        ['username', { username: 'otro' }],
        ['email', { email: 'tomado@mail.com' }],
        ['password', { password: 'nueva-clave' }],
        ['rol (degradar)', { rol: 'TECNICO' }],
    ])('modificar un ADMINISTRADOR existente (%s)', async (_campo, body) => {
        const res = await request(app).put('/api/usuarios/2').set(GESTOR).send(body);
        expect(res.status).toBe(403);
        expect(prisma.user.update).not.toHaveBeenCalled();
    });

    test('eliminar un usuario', async () => {
        const res = await request(app).delete('/api/usuarios/3').set(GESTOR);
        expect(res.status).toBe(403);
        expect(prisma.user.delete).not.toHaveBeenCalled();
    });
});
