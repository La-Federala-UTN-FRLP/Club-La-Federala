// El hash dummy del login se usa con bcrypt real: tiene que ser un hash válido (si no, compare
// fallaría distinto o más rápido que con un usuario existente) y con el mismo cost del sistema.
jest.mock('../../../src/config/prisma', () => ({}));

import bcrypt from 'bcrypt';
import { DUMMY_PASSWORD_HASH } from '../../../src/services/auth.service';

describe('DUMMY_PASSWORD_HASH', () => {
    test('bcrypt real lo acepta y usa cost 10, igual que usuario.service y los seeds', async () => {
        expect(bcrypt.getRounds(DUMMY_PASSWORD_HASH)).toBe(10);
        await expect(bcrypt.compare('cualquier-password', DUMMY_PASSWORD_HASH)).resolves.toBe(false);
    });
});
