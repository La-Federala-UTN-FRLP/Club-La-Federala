import { 
    createUsuarioSchema, 
    updateUsuarioSchema, 
    updateUsuarioWithParamsSchema, 
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

//--- Tests para updateUsuarioWithParamsSchema ---
describe('updateUsuarioWithParamsSchema', () => {
    test('debe validar correctamente un usuario con ID y datos de actualización', () => {
        // ARRANGE
        const validData = {
            id: 1,
            username: 'newusername',
        };

        // ACT & ASSERT
        expect(() => updateUsuarioWithParamsSchema.parse(validData)).not.toThrow();
    });

    test('debe rechazar un ID negativo', () => {
        // ARRANGE
        const invalidData = {
            id: -1,
            username: 'newusername',
        };

        // ACT & ASSERT
        expect(() => updateUsuarioWithParamsSchema.parse(invalidData)).toThrow();
    });

    test('debe rechazar un ID no entero', () => {
        // ARRANGE
        const invalidData = {
            id: 1.5,
            username: 'newusername',
        };

        // ACT & ASSERT
        expect(() => updateUsuarioWithParamsSchema.parse(invalidData)).toThrow();
    });
});

//--- Tests para getUsuarioSchema ---
describe('getUsuarioSchema', () => {
    test('debe validar correctamente un ID válido', () => {
        // ARRANGE
        const validParams = { id: 1 };

        // ACT & ASSERT
        expect(() => getUsuarioSchema.parse(validParams)).not.toThrow();
    });

    test('debe rechazar un ID negativo', () => {
        // ARRANGE
        const invalidParams = { id: -1 };

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
        const validParams = { id: 1 };

        // ACT & ASSERT
        expect(() => deleteUsuarioSchema.parse(validParams)).not.toThrow();
    });

    test('debe rechazar un ID inválido para eliminar', () => {
        // ARRANGE
        const invalidParams = { id: 0 };

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
