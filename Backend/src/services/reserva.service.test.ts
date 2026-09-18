import { getAllReservas, getReservaById, getReservaByImmobiliariaId, createReserva, updateReserva, deleteReserva } from './reserva.service';
import prisma from '../config/prisma';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

// ARRANGE GLOBAL: Mockeamos Prisma a nivel de módulo.
jest.mock('../config/prisma', () => ({
    reserva: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    },
}));

// ARRANGE GLOBAL: Limpiamos los mocks después de cada prueba.
afterEach(() => {
    jest.clearAllMocks();
});

//--- Tests para getAllReservas ---
describe('getAllReservas', () => {
    test('debe retornar una lista de reservas con el total', async () => {
        // ARRANGE
        const mockReservas = [
            {
                id: 1,
                fechaReserva: new Date('2025-10-01T10:00:00.000Z'),
                loteId: 1,
                clienteId: 10,
                inmobiliariaId: 5,
                sena: 5000,
            },
            {
                id: 2,
                fechaReserva: new Date('2025-11-15T12:30:00.000Z'),
                loteId: 2,
                clienteId: 12,
                inmobiliariaId: null,
                sena: 3000,
            },
        ];
        (prisma.reserva.findMany as jest.Mock).mockResolvedValue(mockReservas);

        // ACT
        const result = await getAllReservas();

        // ASSERT
        expect(result).toEqual({ reservas: mockReservas, total: 2 });
        expect(prisma.reserva.findMany).toHaveBeenCalledWith({
            orderBy: { fechaReserva: 'desc' },
        });
    });
});

//--- Tests para getReservaById ---
describe('getReservaById', () => {
    test('debe retornar una reserva cuando existe', async () => {
        // ARRANGE
        const mockReserva = {
            id: 1,
            fechaReserva: new Date('2025-10-01T10:00:00.000Z'),
            loteId: 1,
            clienteId: 10,
            inmobiliariaId: 5,
            sena: 5000,
        };
        (prisma.reserva.findUnique as jest.Mock).mockResolvedValue(mockReserva);

        // ACT
        const result = await getReservaById(1);

        // ASSERT
        expect(result).toEqual(mockReserva);
        expect(prisma.reserva.findUnique).toHaveBeenCalledWith({
            where: { id: 1 },
        });
    });

    test('debe lanzar un error 404 cuando la reserva no existe', async () => {
        // ARRANGE
        (prisma.reserva.findUnique as jest.Mock).mockResolvedValue(null);

        // ACT & ASSERT
        await expect(getReservaById(999)).rejects.toThrow('La reserva no existe');
        await expect(getReservaById(999)).rejects.toHaveProperty('status', 404);
    });
});

//--- Tests para getReservaByImmobiliariaId ---
describe('getReservaByImmobiliariaId', () => {
    test('debe retornar reservas cuando la inmobiliaria existe', async () => {
        // ARRANGE
        const mockReservas = [
            {
                id: 1,
                fechaReserva: new Date('2025-10-01T10:00:00.000Z'),
                loteId: 1,
                clienteId: 10,
                inmobiliariaId: 5,
                sena: 5000,
            },
        ];
        (prisma.reserva.findMany as jest.Mock).mockResolvedValue(mockReservas);

        // ACT
        const result = await getReservaByImmobiliariaId(5);

        // ASSERT
        expect(result).toEqual(mockReservas);
        expect(prisma.reserva.findMany).toHaveBeenCalledWith({
            where: { inmobiliariaId: 5 },
        });
    });

    test('debe lanzar un error 404 cuando la inmobiliaria no existe', async () => {
        // ARRANGE
        (prisma.reserva.findMany as jest.Mock).mockResolvedValue(null);

        // ACT & ASSERT
        await expect(getReservaByImmobiliariaId(999)).rejects.toThrow('Inmobialiaria no existe');
        await expect(getReservaByImmobiliariaId(999)).rejects.toHaveProperty('status', 404);
    });
});

//--- Tests para createReserva ---
describe('createReserva', () => {
    test('debe crear una nueva reserva exitosamente', async () => {
        // ARRANGE
        const newReservaRequest = {
            fechaReserva: '2025-12-01T18:00:00.000Z',
            loteId: 3,
            clienteId: 15,
            inmobiliariaId: 2,
            sena: 10000,
            numero: 'RES-TEST-001',
            ofertaInicial: 100000,
            fechaFinReserva: '2025-12-10T18:00:00.000Z',
        };
        const createdReserva = {
            id: 3,
            fechaReserva: new Date(newReservaRequest.fechaReserva),
            loteId: newReservaRequest.loteId,
            clienteId: newReservaRequest.clienteId,
            inmobiliariaId: newReservaRequest.inmobiliariaId,
            sena: newReservaRequest.sena,
        };
        
        (prisma.reserva.create as jest.Mock).mockResolvedValue(createdReserva);

        // ACT
        const result = await createReserva(newReservaRequest);

        // ASSERT
        expect(prisma.reserva.create).toHaveBeenCalledWith({
            data: {
                fechaReserva: new Date(newReservaRequest.fechaReserva),
                loteId: newReservaRequest.loteId,
                clienteId: newReservaRequest.clienteId,
                inmobiliariaId: newReservaRequest.inmobiliariaId,
                sena: newReservaRequest.sena,
            },
        });
        expect(result).toEqual(createdReserva);
    });

    test('debe crear una reserva sin inmobiliaria y sin seña', async () => {
        // ARRANGE
        const newReservaRequest = {
            fechaReserva: '2025-12-01T18:00:00.000Z',
            loteId: 3,
            clienteId: 15,
            numero: 'RES-TEST-002',
            ofertaInicial: 100000,
            fechaFinReserva: '2025-12-10T18:00:00.000Z',
        };
        const createdReserva = {
            id: 3,
            fechaReserva: new Date(newReservaRequest.fechaReserva),
            loteId: newReservaRequest.loteId,
            clienteId: newReservaRequest.clienteId,
            inmobiliariaId: null,
            sena: null,
        };
        
        (prisma.reserva.create as jest.Mock).mockResolvedValue(createdReserva);

        // ACT
        const result = await createReserva(newReservaRequest);

        // ASSERT
        expect(prisma.reserva.create).toHaveBeenCalledWith({
            data: {
                fechaReserva: new Date(newReservaRequest.fechaReserva),
                loteId: newReservaRequest.loteId,
                clienteId: newReservaRequest.clienteId,
                inmobiliariaId: null,
            },
        });
        expect(result).toEqual(createdReserva);
    });

    test('debe lanzar un error 409 si ya existe una reserva para el mismo cliente, lote y fecha', async () => {
        // ARRANGE
        const newReservaRequest = {
            fechaReserva: '2025-12-01T18:00:00.000Z',
            loteId: 3,
            clienteId: 15,
            numero: 'RES-TEST-003',
            ofertaInicial: 100000,
            fechaFinReserva: '2025-12-10T18:00:00.000Z',
        };
        const prismaError = new PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: '5.0.0',
        });
        (prisma.reserva.create as jest.Mock).mockRejectedValue(prismaError);

        // ACT & ASSERT
        await expect(createReserva(newReservaRequest)).rejects.toThrow('Ya existe una reserva para ese cliente, lote y fecha');
        await expect(createReserva(newReservaRequest)).rejects.toHaveProperty('status', 409);
    });

    test('debe lanzar un error 409 si alguna referencia no existe', async () => {
        // ARRANGE
        const newReservaRequest = {
            fechaReserva: '2025-12-01T18:00:00.000Z',
            loteId: 999,
            clienteId: 15,
            numero: 'RES-TEST-004',
            ofertaInicial: 100000,
            fechaFinReserva: '2025-12-10T18:00:00.000Z',
        };
        const prismaError = new PrismaClientKnownRequestError('Foreign key constraint failed', {
            code: 'P2003',
            clientVersion: '5.0.0',
        });
        (prisma.reserva.create as jest.Mock).mockRejectedValue(prismaError);

        // ACT & ASSERT
        await expect(createReserva(newReservaRequest)).rejects.toThrow('Alguna referencia (cliente/lote/inmobiliaria) no existe');
        await expect(createReserva(newReservaRequest)).rejects.toHaveProperty('status', 409);
    });
});

//--- Tests para updateReserva ---
describe('updateReserva', () => {
    test('debe actualizar una reserva exitosamente', async () => {
        // ARRANGE
        const updateRequest = {
            fechaReserva: '2025-12-15T18:00:00.000Z',
            sena: 15000,
        };
        const updatedReserva = {
            id: 1,
            fechaReserva: new Date(updateRequest.fechaReserva),
            loteId: 1,
            clienteId: 10,
            inmobiliariaId: 5,
            sena: updateRequest.sena,
        };

        (prisma.reserva.update as jest.Mock).mockResolvedValue(updatedReserva);

        // ACT
        const result = await updateReserva(1, updateRequest);
        
        // ASSERT
        expect(prisma.reserva.update).toHaveBeenCalledWith({
            where: { id: 1 },
            data: {
                fechaReserva: new Date(updateRequest.fechaReserva),
                sena: updateRequest.sena,
            },
        });
        expect(result).toEqual(updatedReserva);
    });

    test('debe actualizar solo los campos proporcionados', async () => {
        // ARRANGE
        const updateRequest = {
            sena: 20000,
        };
        const updatedReserva = {
            id: 1,
            fechaReserva: new Date('2025-10-01T10:00:00.000Z'),
            loteId: 1,
            clienteId: 10,
            inmobiliariaId: 5,
            sena: 20000,
        };

        (prisma.reserva.update as jest.Mock).mockResolvedValue(updatedReserva);

        // ACT
        const result = await updateReserva(1, updateRequest);
        
        // ASSERT
        expect(prisma.reserva.update).toHaveBeenCalledWith({
            where: { id: 1 },
            data: {
                sena: updateRequest.sena,
            },
        });
        expect(result).toEqual(updatedReserva);
    });

    test('debe lanzar un error 404 si la reserva a actualizar no existe', async () => {
        // ARRANGE
        const updateRequest = { sena: 10000 };
        const prismaError = new PrismaClientKnownRequestError('Record not found', {
            code: 'P2025',
            clientVersion: '5.0.0',
        });
        (prisma.reserva.update as jest.Mock).mockRejectedValue(prismaError);

        // ACT & ASSERT
        await expect(updateReserva(999, updateRequest)).rejects.toThrow('La reserva no existe');
        await expect(updateReserva(999, updateRequest)).rejects.toHaveProperty('status', 404);
    });
});

//--- Tests para deleteReserva ---
describe('deleteReserva', () => {
    test('debe eliminar una reserva exitosamente', async () => {
        // ARRANGE
        (prisma.reserva.delete as jest.Mock).mockResolvedValue({ id: 1 });

        // ACT
        await deleteReserva(1);
        
        // ASSERT
        expect(prisma.reserva.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    test('debe lanzar un error 404 si la reserva a eliminar no existe', async () => {
        // ARRANGE
        const prismaError = new PrismaClientKnownRequestError('Record not found', {
            code: 'P2025',
            clientVersion: '5.0.0',
        });
        (prisma.reserva.delete as jest.Mock).mockRejectedValue(prismaError);
        
        // ACT & ASSERT
        await expect(deleteReserva(999)).rejects.toThrow('La reserva no existe');
        await expect(deleteReserva(999)).rejects.toHaveProperty('status', 404);
    });
});
