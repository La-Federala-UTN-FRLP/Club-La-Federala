// Regresión de seguridad de logging: ningún request debe dejar en stdout/stderr
// credenciales, tokens ni payloads de negocio. Se espían todos los métodos de console
// y se busca el valor sensible en la salida serializada.
jest.mock('../../../src/services/auth.service', () => ({
    login: jest.fn(),
}));

jest.mock('../../../src/services/usuario.service', () => ({
    createUser: jest.fn(),
}));

jest.mock('../../../src/services/reserva.service', () => ({
    createReserva: jest.fn(),
}));

import { inspect } from 'util';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { NextFunction, Request, Response } from 'express';
import app from '../../../src/app';
import { initWebEnv, resetWebEnvForTests } from '../../../src/config/env';
import { validate } from '../../../src/middlewares/validation.middleware';
import { createReservaController } from '../../../src/controllers/reserva.controller';
import { login } from '../../../src/services/auth.service';
import { createUser } from '../../../src/services/usuario.service';
import { createReserva } from '../../../src/services/reserva.service';

const JWT_SECRET = 'unit-test-jwt-secret';
const SECRET_PASSWORD = 'super-secret-logging-test-123';
const LOGIN_EMAIL = 'logging.test@example.com';

const loginMock = login as jest.Mock;
const createUserMock = createUser as jest.Mock;
const createReservaMock = createReserva as jest.Mock;

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const;
let consoleSpies: jest.SpyInstance[] = [];

function consoleOutput(): string {
    return consoleSpies
        .flatMap((spy) => spy.mock.calls)
        .map((args: unknown[]) =>
            args.map((a) => (typeof a === 'string' ? a : inspect(a, { depth: null }))).join(' '),
        )
        .join('\n');
}

function tokenFor(role: string) {
    return jwt.sign({ sub: 1, email: 'admin@example.com', role }, JWT_SECRET);
}

beforeAll(() => {
    initWebEnv({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/federala',
        JWT_SECRET,
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_KEY: 'unit-test-service-key',
    });
});

afterAll(() => {
    resetWebEnvForTests();
});

beforeEach(() => {
    consoleSpies = CONSOLE_METHODS.map((method) =>
        jest.spyOn(console, method).mockImplementation(() => undefined),
    );
    loginMock.mockReset();
    createUserMock.mockReset();
    createReservaMock.mockReset();
});

afterEach(() => {
    consoleSpies.forEach((spy) => spy.mockRestore());
});

describe('POST /api/auth/login — no expone credenciales en logs', () => {
    test('login válido: ni la contraseña ni el email aparecen en consola', async () => {
        loginMock.mockResolvedValue({ user: { id: 1 }, token: 'fake-token' });

        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: LOGIN_EMAIL, password: SECRET_PASSWORD });

        expect(res.status).toBe(200);
        expect(loginMock).toHaveBeenCalledWith({ email: LOGIN_EMAIL, password: SECRET_PASSWORD });
        const output = consoleOutput();
        expect(output).not.toContain(SECRET_PASSWORD);
        expect(output).not.toContain(LOGIN_EMAIL);
    });

    test('login inválido (Zod): 400 con el contrato actual y sin la contraseña en consola ni respuesta', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'no-es-un-email', password: SECRET_PASSWORD });

        expect(res.status).toBe(400);
        expect(res.body).toEqual({
            success: false,
            message: 'Datos inválidos',
            errors: [{ field: 'email', message: expect.any(String) }],
        });
        expect(JSON.stringify(res.body)).not.toContain(SECRET_PASSWORD);
        expect(consoleOutput()).not.toContain(SECRET_PASSWORD);
        expect(loginMock).not.toHaveBeenCalled();
    });
});

describe('POST /api/usuarios — alta sin contraseña en logs', () => {
    test('el service recibe el body parseado (trim) y la contraseña no aparece en consola', async () => {
        createUserMock.mockResolvedValue({ id: 10 });

        const res = await request(app)
            .post('/api/usuarios')
            .set({ Authorization: `Bearer ${tokenFor('ADMINISTRADOR')}` })
            .send({
                username: '  nuevo.usuario  ',
                password: `  ${SECRET_PASSWORD}  `,
                rol: 'GESTOR',
                email: 'nuevo@example.com',
            });

        expect(res.status).toBe(201);
        expect(createUserMock).toHaveBeenCalledWith({
            username: 'nuevo.usuario',
            password: SECRET_PASSWORD,
            rol: 'GESTOR',
            email: 'nuevo@example.com',
        });
        expect(consoleOutput()).not.toContain(SECRET_PASSWORD);
    });
});

describe('validate() — conserva el parsing de Zod', () => {
    test('reemplaza req.body por el valor parseado y llama a next sin error', async () => {
        const middleware = validate(z.object({ nombre: z.string().trim() }));
        const req = { body: { nombre: '  Ana  ', extra: 'descartado' } } as unknown as Request;
        const next = jest.fn() as NextFunction;

        await middleware(req, {} as Response, next);

        expect(req.body).toEqual({ nombre: 'Ana' });
        expect(next).toHaveBeenCalledWith();
    });
});

describe('authenticate — errores JWT esperados sin token ni stack en logs', () => {
    test('token expirado: 401 "Token expirado" y solo una línea [AUTH] sin el token', async () => {
        const expired = jwt.sign(
            { sub: 1, email: 'admin@example.com', role: 'ADMINISTRADOR', exp: Math.floor(Date.now() / 1000) - 60 },
            JWT_SECRET,
        );

        const res = await request(app).get('/api/usuarios').set({ Authorization: `Bearer ${expired}` });

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ success: false, error: 'Token expirado' });
        const output = consoleOutput();
        expect(output).toContain('[AUTH] TokenExpiredError');
        expect(output).not.toContain(expired);
        expect(output).not.toMatch(/\n\s+at /);
    });

    test('firma inválida: 401 "Token inválido" sin el token ni el secret en consola', async () => {
        const forged = jwt.sign({ sub: 1, email: 'x@example.com', role: 'ADMINISTRADOR' }, 'otro-secret');

        const res = await request(app).get('/api/usuarios').set({ Authorization: `Bearer ${forged}` });

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ success: false, error: 'Token inválido' });
        const output = consoleOutput();
        expect(output).not.toContain(forged);
        expect(output).not.toContain(JWT_SECRET);
    });
});

describe('createReservaController — delega el error sin loguearlo', () => {
    test('un error de negocio llega intacto a next y no se escribe en consola', async () => {
        const businessError = Object.assign(new Error('El lote no está disponible'), { statusCode: 409 });
        createReservaMock.mockRejectedValue(businessError);
        const next = jest.fn();

        await createReservaController(
            { body: { loteId: 1 }, user: { id: 1, role: 'ADMINISTRADOR' } } as unknown as Request,
            {} as Response,
            next,
        );

        expect(next).toHaveBeenCalledWith(businessError);
        expect(consoleOutput()).toBe('');
    });
});
