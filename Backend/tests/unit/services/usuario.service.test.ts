import { getAllUsers, getUsuarioById, createUser, updateUser, deleteUser } from '../../../src/services/usuario.service';
import prisma from '../../../src/config/prisma';
import bcrypt from 'bcrypt';
import type { PostUsuarioRequest, PutUsuarioRequest, Rol } from '../../../src/types/interfacesCCLF';

// ARRANGE GLOBAL: Mockeamos Prisma y bcrypt a nivel de módulo.
jest.mock('../../../src/config/prisma', () => ({
    user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    },
}));

jest.mock('bcrypt', () => ({
    hash: jest.fn(),
}));

// ARRANGE GLOBAL: Limpiamos los mocks después de cada prueba.
afterEach(() => {
    jest.clearAllMocks();
});

//--- Tests para getAllUsers ---
describe('getAllUsers', () => {
    test('debe retornar una lista de usuarios', async () => {
        // ARRANGE: Usamos roles válidos según la definición de 'Rol'.
        const mockUsers = [
            { id: 1, username: 'justina', email: 'justi@test.com', role: 'GESTOR' as Rol }, // CAMBIO: 'USER' -> 'GESTOR'
            { id: 2, username: 'carlos', email: 'carlos@test.com', role: 'ADMINISTRADOR' as Rol }, // CAMBIO: 'ADMIN' -> 'ADMINISTRADOR'
        ];
        (prisma.user.findMany as jest.Mock).mockResolvedValue(mockUsers);

        // ACT
        const result = await getAllUsers();

        // ASSERT
        expect(result).toEqual(mockUsers);
        expect(prisma.user.findMany).toHaveBeenCalledWith({
            orderBy: { id: 'asc' },
            take: 10,
            omit: { password: true },
        });
    });
});

//--- Tests para getUsuarioById ---
describe('getUsuarioById', () => {
    test('debe retornar un usuario cuando existe', async () => {
        // ARRANGE
        const mockUser = { id: 1, username: 'justina', email: 'justi@test.com', role: 'GESTOR' as Rol }; // CAMBIO: 'USER' -> 'GESTOR'
        (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

        // ACT
        const result = await getUsuarioById(1);

        // ASSERT
        expect(result).toEqual(mockUser);
        expect(prisma.user.findUnique).toHaveBeenCalledWith({
            where: { id: 1 },
            omit: { password: true },
        });
    });

    test('debe lanzar un error 404 cuando el usuario no existe', async () => {
        // ARRANGE
        (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

        // ACT & ASSERT
        await expect(getUsuarioById(999)).rejects.toThrow('Usuario no encontrado');
        await expect(getUsuarioById(999)).rejects.toHaveProperty('statusCode', 404);
    });
});

//--- Tests para createUser ---
describe('createUser', () => {
    test('debe crear un nuevo usuario exitosamente', async () => {
        // ARRANGE: Ya estaba correcto aquí.
        const newUserRequest: PostUsuarioRequest = {
            username: 'nuevoUsuario',
            email: 'nuevo@test.com',
            password: 'password123',
            rol: 'ADMINISTRADOR',
        };
        const createdUser = { id: 3, username: 'nuevoUsuario', email: 'nuevo@test.com', role: 'ADMINISTRADOR' as Rol };
        
        (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
        (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
        (prisma.user.create as jest.Mock).mockResolvedValue(createdUser);

        // ACT
        const result = await createUser(newUserRequest);

        // ASSERT
        expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
        expect(prisma.user.create).toHaveBeenCalledWith({
            data: {
                username: 'nuevoUsuario',
                email: 'nuevo@test.com',
                password: 'hashed_password',
                role: 'ADMINISTRADOR',
            },
            omit: { password: true },
        });
        expect(result).toEqual({ usuario: createdUser, message: 'Usuario creado con éxito' });
    });

    test('debe lanzar un error 409 si el email ya existe', async () => {
        // ARRANGE
        const newUserRequest: PostUsuarioRequest = {
            username: 'justina',
            email: 'justi@test.com',
            password: 'password123',
            rol: 'GESTOR',
        };
        const existingUser = { id: 1, ...newUserRequest };
        (prisma.user.findUnique as jest.Mock).mockResolvedValue(existingUser);

        // ACT & ASSERT
        await expect(createUser(newUserRequest)).rejects.toThrow('Email ya registrado');
        await expect(createUser(newUserRequest)).rejects.toHaveProperty('statusCode', 409);
        expect(bcrypt.hash).not.toHaveBeenCalled();
        expect(prisma.user.create).not.toHaveBeenCalled();
    });
});

//--- Tests para updateUser ---
describe('updateUser', () => {
    test('debe actualizar un usuario exitosamente (con contraseña)', async () => {
        // ARRANGE
        const updateRequest: PutUsuarioRequest = {
            username: 'justinaActualizada',
            password: 'newPassword',
        };
        const updatedUser = { id: 1, username: 'justinaActualizada', email: 'justi@test.com', role: 'TECNICO' as Rol }; 

        (bcrypt.hash as jest.Mock).mockResolvedValue('new_hashed_password');
        (prisma.user.update as jest.Mock).mockResolvedValue(updatedUser);

        // ACT
        const result = await updateUser(1, updateRequest);
        
        // ASSERT
        expect(bcrypt.hash).toHaveBeenCalledWith('newPassword', 10);
        expect(prisma.user.update).toHaveBeenCalledWith({
            where: { id: 1 },
            data: expect.objectContaining({ 
                username: 'justinaActualizada',
                password: 'new_hashed_password',
            }),
            omit: { password: true }
        });
        expect(result).toEqual({ user: updatedUser, message: 'El usuario se actualizo con exito' });
    });

    test('debe lanzar un error 404 si el usuario a actualizar no existe', async () => {
        // ARRANGE
        const updateRequest: PutUsuarioRequest = { username: 'noexiste' };
        const prismaError = { code: 'P2025' };
        (prisma.user.update as jest.Mock).mockRejectedValue(prismaError);

        // ACT & ASSERT
        await expect(updateUser(999, updateRequest)).rejects.toThrow('Usuario no encontrado');
        await expect(updateUser(999, updateRequest)).rejects.toHaveProperty('statusCode', 404);
    });
});

//--- Tests para deleteUser ---
describe('deleteUser', () => {
    test('debe eliminar un usuario exitosamente', async () => {
        // ARRANGE
        (prisma.user.delete as jest.Mock).mockResolvedValue({ id: 1 });

        // ACT
        const result = await deleteUser({ idUsuario: 1 });
        
        // ASSERT
        expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 1 } });
        expect(result).toEqual({ message: 'Usuario eliminado con éxito' });
    });

    test('debe lanzar un error 404 si el usuario a eliminar no existe', async () => {
        // ARRANGE
        const prismaError = { code: 'P2025' };
        (prisma.user.delete as jest.Mock).mockRejectedValue(prismaError);
        
        // ACT & ASSERT
        await expect(deleteUser({ idUsuario: 999 })).rejects.toThrow('Usuario no encontrado');
        await expect(deleteUser({ idUsuario: 999 })).rejects.toHaveProperty('statusCode', 404);
    });
});

//--- Contrato de actualización: solo campos públicos, rol → role ---
describe('updateUser — contrato de actualización', () => {
    beforeEach(() => {
        (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
        (prisma.user.update as jest.Mock).mockResolvedValue({ id: 7 });
    });

    function updateData() {
        return (prisma.user.update as jest.Mock).mock.calls[0][0].data;
    }

    test('el rol del contrato público se persiste como role', async () => {
        await updateUser(7, { rol: 'GESTOR' });
        expect(updateData()).toEqual({ role: 'GESTOR' });
    });

    test('propiedades fuera del contrato no llegan a Prisma', async () => {
        await updateUser(7, {
            username: 'nuevo',
            id: 99,
            role: 'ADMINISTRADOR',
            createdAt: new Date('2020-01-01'),
            uplodedFiles: { deleteMany: {} },
            inmobiliaria: { disconnect: true },
            persona: { disconnect: true },
        } as any);
        expect(updateData()).toEqual({ username: 'nuevo' });
    });

    test('normaliza username y email', async () => {
        await updateUser(7, { username: '  juan  ', email: '  Usuario@Mail.COM ' });
        expect(updateData()).toEqual({ username: 'juan', email: 'usuario@mail.com' });
    });

    test('hashea la password exacta, sin trim', async () => {
        await updateUser(7, { password: '  clave segura  ' });
        // Comparación booleana para no volcar la password en el mensaje de fallo.
        expect((bcrypt.hash as jest.Mock).mock.calls[0][0] === '  clave segura  ').toBe(true);
        expect(updateData()).toEqual({ password: 'hashed_password' });
    });
});
