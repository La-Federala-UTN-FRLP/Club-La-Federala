import prisma from '../config/prisma';
import type { Fraccion as PrismaFraccion } from "../generated/prisma";
import type { Fraccion, DeleteFraccionResponse, DeleteFraccionRequest, GetFraccionRequest, GetFraccionesResponse, PutFraccionResponse, PostFraccionRequest, PostFraccionResponse } from '../types/interfacesCCLF';

const toFraccion = (f: PrismaFraccion & { lotes?: any[] }): Fraccion => {
    return {
        idFraccion: f.id,
        numero: f.numero,
        // Pasar los lotes incluidos desde Prisma sin remapear toda la entidad
        lotes: (f.lotes ?? []) as any,
    } as unknown as Fraccion;
}

// Error de negocio con status HTTP explícito: el middleware global lo respeta (404/409).
const errorHttp = (message: string, statusCode: number): Error =>
    Object.assign(new Error(message), { statusCode });

export interface CreateFraccionDto {
    numero: number;
}

export interface UpdateFraccionDto {
    numero?: number;
}


export async function getAllFracciones(limit: number = 10): Promise<GetFraccionesResponse> {
    const [fracciones, total] = await Promise.all([
        prisma.fraccion.findMany({
            include: { lotes: true },
            orderBy: { id: 'asc' },
            take: limit
        }),
        prisma.fraccion.count()
    ]);
    return {
        fracciones: fracciones.map(f => toFraccion(f)),
        total
    };
}

export async function getFraccionById(id: number): Promise<Fraccion> {
    const fraccion = await prisma.fraccion.findUnique({
        where: { id: id },
        include: { lotes: true }
    });
    if (!fraccion) throw errorHttp('Fracción no encontrada', 404);
    return toFraccion(fraccion);
}

// Crear fracción
export async function createFraccion(data: CreateFraccionDto): Promise<Fraccion> {
    // Verificar si la fracción ya existe
    const exists = await prisma.fraccion.findUnique({
        where: { numero: data.numero }
    });
    if (exists) throw errorHttp('La fracción ya existe', 409);
    // Crear la fracción
    const newFraccion = await prisma.fraccion.create({
        data: {
            numero: data.numero
        }
    });
    return toFraccion(newFraccion);
}

// Actualizar fracción
export async function updateFraccion(id: number, data: UpdateFraccionDto): Promise<Fraccion> {
    try {
        // Verificar si la fracción existe
        const exists = await prisma.fraccion.findUnique({
            where: { id }
        });
        if (!exists) {
            const error = new Error('Fracción no encontrada') as any;
            error.statusCode = 404;
            throw error;
        }
        // numero es opcional en el update: sin número no hay nada que comparar ni que escribir.
        if (data.numero !== undefined && data.numero !== exists.numero) {
            // Verificar si el nuevo número ya existe en otra fracción
            const numeroExists = await prisma.fraccion.findUnique({
                where: { numero: data.numero }
            });
            if (numeroExists) {
                throw errorHttp('El número de fracción ya existe', 409);
            }
        }
        // Actualizar la fracción
        const updatedFraccion = await prisma.fraccion.update({
            where: { id },
            // Fraccion no tiene updatedAt: Prisma rechaza claves que el modelo no declara.
            data: {
                numero: data.numero
            }
        });
        return toFraccion(updatedFraccion);
    } catch (e: any) {
        if (e.code === 'P2025') {
            const error = new Error('Fracción no encontrada') as any;
            error.statusCode = 404;
            throw error;
        }
        throw e;
    }
}

export async function deleteFraccion(id: number): Promise<DeleteFraccionResponse> {
    try {
        const exists = await prisma.fraccion.findUnique({
            where: { id }
        });

        if (!exists) {
            const error = new Error('Fracción no encontrada') as any;
            error.statusCode = 404;
            throw error;
        }   
        // Verificar si la fracción tiene lotes asociados
        const lotes = await prisma.lote.count({
            where: { fraccionId: id }
        });
        if (lotes > 0) {
            const error = new Error('No se puede eliminar la fracción porque tiene lotes asociados') as any;
            error.statusCode = 400;
            throw error;
        }
        await prisma.fraccion.delete({
            where: { id }
        });
        return { message: 'Fracción eliminada correctamente' };
    } catch (e: any) {
        if (e.code === 'P2025') {
        const error = new Error('Fracción no encontrada') as any;
        error.statusCode = 404;
        throw error;
        }
        throw e;
    }
}
