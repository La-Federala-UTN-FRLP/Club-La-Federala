import jwt from 'jsonwebtoken';
import { login, DUMMY_PASSWORD_HASH } from '../../../src/services/auth.service';
import { useTestWebEnv } from '../../support/http';
import prisma from '../../../src/config/prisma';
import bcrypt from 'bcrypt';

jest.mock('../../../src/config/prisma', () => ({
    user: { findUnique: jest.fn() },
}));

jest.mock('bcrypt', () => ({
    compare: jest.fn(),
}));

afterEach(() => {
    jest.clearAllMocks();
});

describe('login — normalización de credenciales', () => {
    test('busca la cuenta por email normalizado (trim + minúsculas)', async () => {
        (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

        await expect(login({ email: '  Usuario@Mail.COM ', password: 'secreto1' })).rejects.toHaveProperty('statusCode', 401);
        expect(prisma.user.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({ where: { email: 'usuario@mail.com' } }),
        );
    });

    test('compara la password exacta, sin trim', async () => {
        (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 1, password: 'hash', role: 'GESTOR' });
        (bcrypt.compare as jest.Mock).mockResolvedValue(false);

        await expect(login({ email: 'usuario@mail.com', password: '  clave segura  ' })).rejects.toHaveProperty('statusCode', 401);
        // Comparación booleana para no volcar la password en el mensaje de fallo.
        expect((bcrypt.compare as jest.Mock).mock.calls[0][0] === '  clave segura  ').toBe(true);
    });
});

// Enumeración por tiempo: el email inexistente no puede saltearse bcrypt. Ambos caminos hacen
// exactamente una comparación bcrypt y fallan con el mismo error. No se miden milisegundos:
// se verifica que el trabajo criptográfico sea el mismo.
describe('login — credenciales inválidas indistinguibles', () => {
    const USUARIO = { id: 3, email: 'usuario@mail.com', password: '$2b$10$hashDelUsuarioReal..............................', role: 'GESTOR', inmobiliaria: null };

    async function errorDe(promesa: Promise<unknown>) {
        try {
            await promesa;
        } catch (e: any) {
            return { message: e.message, statusCode: e.statusCode, status: e.status };
        }
        throw new Error('login no falló');
    }

    test('email inexistente → bcrypt.compare contra el hash dummy y 401', async () => {
        (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
        (bcrypt.compare as jest.Mock).mockResolvedValue(false);

        const error = await errorDe(login({ email: 'nadie@mail.com', password: 'clave-cualquiera' }));

        expect(error).toEqual({ message: 'Credenciales inválidas', statusCode: 401, status: undefined });
        expect(bcrypt.compare).toHaveBeenCalledTimes(1);
        expect((bcrypt.compare as jest.Mock).mock.calls[0][1]).toBe(DUMMY_PASSWORD_HASH);
    });

    test('email existente + password incorrecta → bcrypt.compare contra el hash del usuario y 401', async () => {
        (prisma.user.findUnique as jest.Mock).mockResolvedValue(USUARIO);
        (bcrypt.compare as jest.Mock).mockResolvedValue(false);

        const error = await errorDe(login({ email: USUARIO.email, password: 'incorrecta' }));

        expect(error).toEqual({ message: 'Credenciales inválidas', statusCode: 401, status: undefined });
        expect(bcrypt.compare).toHaveBeenCalledTimes(1);
        expect((bcrypt.compare as jest.Mock).mock.calls[0][1]).toBe(USUARIO.password);
    });

    test('ambos caminos producen el mismo error', async () => {
        (bcrypt.compare as jest.Mock).mockResolvedValue(false);
        (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null).mockResolvedValueOnce(USUARIO);

        const inexistente = await errorDe(login({ email: 'nadie@mail.com', password: 'x' }));
        const incorrecta = await errorDe(login({ email: USUARIO.email, password: 'x' }));

        expect(inexistente).toEqual(incorrecta);
    });

    test('el hash dummy es un bcrypt válido, constante y con el cost del sistema (10)', () => {
        expect(DUMMY_PASSWORD_HASH).toMatch(/^\$2[aby]\$10\$[./A-Za-z0-9]{53}$/);
    });
});

describe('login — credenciales válidas (regresión)', () => {
    useTestWebEnv({ authIdentity: 'db' });

    test('emite el JWT con sub, email, role e inmobiliariaId, sin devolver la password', async () => {
        (prisma.user.findUnique as jest.Mock).mockResolvedValue({
            id: 3,
            username: 'inmo',
            email: 'inmo@mail.com',
            password: '$2b$10$hash',
            role: 'INMOBILIARIA',
            createdAt: new Date('2026-01-01'),
            inmobiliaria: { id: 5, nombre: 'Inmo Sur' },
        });
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);

        const result = await login({ email: 'inmo@mail.com', password: 'correcta' });

        expect(bcrypt.compare).toHaveBeenCalledTimes(1);
        expect(result.user).toEqual(expect.objectContaining({ id: 3, role: 'INMOBILIARIA', inmobiliariaId: 5, inmobiliariaNombre: 'Inmo Sur' }));
        expect(result.user).not.toHaveProperty('password');
        expect(jwt.verify(result.token, 'unit-test-jwt-secret')).toEqual(
            expect.objectContaining({ sub: 3, email: 'inmo@mail.com', role: 'INMOBILIARIA', inmobiliariaId: 5 }),
        );
    });
});
