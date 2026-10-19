import { 
    createUsuarioSchema, 
    updateUsuarioSchema,
    getUsuarioSchema,
    deleteUsuarioSchema, 
    queryUsuarioSchema 
} from '../../../src/validations/usuario.validation';

//--- Tests para createUsuarioSchema ---
describe('createUsuarioSchema', () => {
    test('debe validar correctamente un usuario válido', () => {
        // ARRANGE
        const validUsuario = {
            username: 'testuser',
            password: 'password123',
            rol: 'ADMINISTRADOR',
            email: 'test@example.com',
        };

        // ACT & ASSERT
        expect(() => createUsuarioSchema.parse(validUsuario)).not.toThrow();
    });

    test('debe rechazar un username vacío', () => {
        // ARRANGE
        const invalidUsuario = {
            username: '',
            password: 'password123',
            rol: 'ADMINISTRADOR',
            email: 'test@example.com',
        };

        // ACT & ASSERT
        expect(() => createUsuarioSchema.parse(invalidUsuario)).toThrow();
    });

    test('debe rechazar un username muy largo', () => {
        // ARRANGE
        const invalidUsuario = {
            username: 'a'.repeat(31),
            password: 'password123',
            rol: 'ADMINISTRADOR',
            email: 'test@example.com',
        };

        // ACT & ASSERT
        expect(() => createUsuarioSchema.parse(invalidUsuario)).toThrow();
    });

    test('debe rechazar una contraseña muy corta', () => {
        // ARRANGE
        const invalidUsuario = {
            username: 'testuser',
            password: '12345',
            rol: 'ADMINISTRADOR',
            email: 'test@example.com',
        };

        // ACT & ASSERT
        expect(() => createUsuarioSchema.parse(invalidUsuario)).toThrow();
    });

    test('debe rechazar un rol inválido', () => {
        // ARRANGE
        const invalidUsuario = {
            username: 'testuser',
            password: 'password123',
            rol: 'ROL_INVALIDO',
            email: 'test@example.com',
        };

        // ACT & ASSERT
        expect(() => createUsuarioSchema.parse(invalidUsuario)).toThrow();
    });

    test('debe rechazar un email inválido', () => {
        // ARRANGE
        const invalidUsuario = {
            username: 'testuser',
            password: 'password123',
            rol: 'ADMINISTRADOR',
            email: 'email-invalido',
        };

        // ACT & ASSERT
        expect(() => createUsuarioSchema.parse(invalidUsuario)).toThrow();
    });

    test('debe rechazar un email muy largo', () => {
        // ARRANGE
        const invalidUsuario = {
            username: 'testuser',
            password: 'password123',
            rol: 'ADMINISTRADOR',
            email: 'a'.repeat(95) + '@example.com',
        };

        // ACT & ASSERT
        expect(() => createUsuarioSchema.parse(invalidUsuario)).toThrow();
    });

    test('debe validar todos los roles válidos', () => {
        // ARRANGE
        const roles = ['ADMINISTRADOR', 'INMOBILIARIA', 'GESTOR', 'TECNICO'];

        // ACT & ASSERT
        roles.forEach(rol => {
            const validUsuario = {
                username: 'testuser',
                password: 'password123',
                rol,
                email: 'test@example.com',
            };
            expect(() => createUsuarioSchema.parse(validUsuario)).not.toThrow();
        });
    });

    test('acepta contraseña con longitud mínima exacta (6 caracteres)', () => {
        const result = createUsuarioSchema.safeParse({
            username: 'testuser',
            password: '123456',
            rol: 'GESTOR',
            email: 'test@example.com',
        });
        expect(result.success).toBe(true);
    });
});

//--- Tests para updateUsuarioSchema ---
describe('updateUsuarioSchema', () => {
    test('acepta objeto vacío por ser esquema parcial', () => {
        const result = updateUsuarioSchema.safeParse({});
        expect(result.success).toBe(true);
    });

    test('debe validar correctamente una actualización parcial', () => {
        // ARRANGE
        const updateData = {
            username: 'newusername',
        };

        // ACT & ASSERT
        expect(() => updateUsuarioSchema.parse(updateData)).not.toThrow();
    });

    test('debe validar correctamente múltiples campos', () => {
        // ARRANGE
        const updateData = {
            username: 'newusername',
            email: 'newemail@example.com',
        };

        // ACT & ASSERT
        expect(() => updateUsuarioSchema.parse(updateData)).not.toThrow();
    });

    test('debe rechazar un username vacío en actualización', () => {
        // ARRANGE
        const invalidUpdate = {
            username: '',
        };

        // ACT & ASSERT
        expect(() => updateUsuarioSchema.parse(invalidUpdate)).toThrow();
    });
});

//--- Tests para getUsuarioSchema ---
describe('getUsuarioSchema', () => {
    test('debe validar correctamente un ID válido', () => {
        // ARRANGE
        const validParams = { id: '1' };

        // ACT & ASSERT
        expect(() => getUsuarioSchema.parse(validParams)).not.toThrow();
    });

    test('debe rechazar un ID negativo', () => {
        // ARRANGE
        const invalidParams = { id: '-1' };

        // ACT & ASSERT
        expect(() => getUsuarioSchema.parse(invalidParams)).toThrow();
    });

    test('debe convertir string a número correctamente', () => {
        // ARRANGE
        const validParams = { id: '5' };

        // ACT & ASSERT
        expect(() => getUsuarioSchema.parse(validParams)).not.toThrow();
    });
});

//--- Tests para deleteUsuarioSchema ---
describe('deleteUsuarioSchema', () => {
    test('debe validar correctamente un ID válido para eliminar', () => {
        // ARRANGE
        const validParams = { id: '1' };

        // ACT & ASSERT
        expect(() => deleteUsuarioSchema.parse(validParams)).not.toThrow();
    });

    test('debe rechazar un ID inválido para eliminar', () => {
        // ARRANGE
        const invalidParams = { id: '0' };

        // ACT & ASSERT
        expect(() => deleteUsuarioSchema.parse(invalidParams)).toThrow();
    });
});

//--- Tests para queryUsuarioSchema ---
describe('queryUsuarioSchema', () => {
    test('debe validar correctamente una query sin filtros', () => {
        // ARRANGE
        const emptyQuery = {};

        // ACT & ASSERT
        expect(() => queryUsuarioSchema.parse(emptyQuery)).not.toThrow();
    });

    test('debe validar correctamente una query con filtros válidos', () => {
        // ARRANGE
        const validQuery = {
            username: 'testuser',
            rol: 'ADMINISTRADOR',
            email: 'test@example.com',
        };

        // ACT & ASSERT
        expect(() => queryUsuarioSchema.parse(validQuery)).not.toThrow();
    });

    test('debe rechazar un username vacío en la query', () => {
        // ARRANGE
        const invalidQuery = {
            username: '',
        };

        // ACT & ASSERT
        expect(() => queryUsuarioSchema.parse(invalidQuery)).toThrow();
    });

    test('debe rechazar un rol inválido en la query', () => {
        // ARRANGE
        const invalidQuery = {
            rol: 'ROL_INVALIDO',
        };

        // ACT & ASSERT
        expect(() => queryUsuarioSchema.parse(invalidQuery)).toThrow();
    });

    test('debe rechazar un email inválido en la query', () => {
        // ARRANGE
        const invalidQuery = {
            email: 'email-invalido',
        };

        // ACT & ASSERT
        expect(() => queryUsuarioSchema.parse(invalidQuery)).toThrow();
    });

    test('rechaza password en query con menos de 6 caracteres', () => {
        const result = queryUsuarioSchema.safeParse({ password: '12345' });
        expect(result.success).toBe(false);
    });
});

//--- Normalización: trim/minúsculas antes de validar; password exacta ---
describe('normalización de usuario (create y update)', () => {
    const base = { username: 'testuser', password: 'password123', rol: 'GESTOR', email: 'test@example.com' };

    test('email con espacios y mayúsculas se normaliza antes de validarse', () => {
        const created = createUsuarioSchema.safeParse({ ...base, email: '  Usuario@Mail.COM ' });
        const updated = updateUsuarioSchema.safeParse({ email: '  Usuario@Mail.COM ' });
        expect(created.success && created.data.email).toBe('usuario@mail.com');
        expect(updated.success && updated.data.email).toBe('usuario@mail.com');
    });

    test('username vacío tras el trim se rechaza', () => {
        expect(createUsuarioSchema.safeParse({ ...base, username: '   ' }).success).toBe(false);
        expect(updateUsuarioSchema.safeParse({ username: '   ' }).success).toBe(false);
    });

    test('username se normaliza con trim', () => {
        const result = createUsuarioSchema.safeParse({ ...base, username: '  juan  ' });
        expect(result.success && result.data.username).toBe('juan');
    });

    test('la password se conserva exacta, con sus espacios', () => {
        const created = createUsuarioSchema.safeParse({ ...base, password: '  abc  ' });
        const updated = updateUsuarioSchema.safeParse({ password: '  abc  ' });
        // Comparación booleana para no volcar la password en el mensaje de fallo.
        expect(created.success && created.data.password === '  abc  ').toBe(true);
        expect(updated.success && updated.data.password === '  abc  ').toBe(true);
    });
});
