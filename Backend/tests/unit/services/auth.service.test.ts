import { login } from '../../../src/services/auth.service';
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
