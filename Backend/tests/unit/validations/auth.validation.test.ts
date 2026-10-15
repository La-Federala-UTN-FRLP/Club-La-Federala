import { loginSchema } from '../../../src/validations/auth.validation';

describe('loginSchema', () => {
    test('normaliza el email antes de validarlo (trim + minúsculas)', () => {
        const result = loginSchema.safeParse({ email: '  Usuario@Mail.COM ', password: 'secreto1' });
        expect(result.success).toBe(true);
        expect(result.data?.email).toBe('usuario@mail.com');
    });

    test('no modifica la password', () => {
        const result = loginSchema.safeParse({ email: 'usuario@mail.com', password: '  clave segura  ' });
        expect(result.success).toBe(true);
        expect(result.data?.password === '  clave segura  ').toBe(true);
    });

    test('rechaza email inválido', () => {
        expect(loginSchema.safeParse({ email: 'no-es-email', password: 'secreto1' }).success).toBe(false);
    });
});
