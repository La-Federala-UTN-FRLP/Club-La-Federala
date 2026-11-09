import prisma from '../config/prisma';
import type { User as PrismaUser } from "../generated/prisma";
import type { Usuario, Rol, UserData, PostUsuarioRequest, PostUsuarioResponse, PutUsuarioRequest, PutUsuarioResponse, DeleteUsuarioRequest, DeleteUsuarioResponse } from '../types/interfacesCCLF';
import type { $Enums, Prisma } from "../generated/prisma"
import bcrypt from 'bcrypt'
import { toLowerCase } from 'zod';


// mapeo de PrismaUser a Usuario
const toUsuario = (u: PrismaUser): Usuario => ({
    idUsuario: u.id,
    username: u.username,
    password: u.password,     
    rol: u.role as unknown as Rol,
    email: u.email,
});

// obtener todos los usuarios
export async function getAllUsers(limit: number = 10): Promise<UserData[]> {
    const usuarios = await prisma.user.findMany({
        orderBy: { id: 'asc' },
        take: limit,
        omit: { password: true }
    });
    return usuarios;
}

export async function getUsuarioById(id: number): Promise<UserData> {
    const usuario = await prisma.user.findUnique({
        where: { id },
        omit: { password: true }
    });

    if (!usuario) {
        const error = new  Error('Usuario no encontrado');
        (error as any).statusCode = 404;
        throw error;
    }

    return usuario;

}


// Quién administra usuarios: la ruta deja pasar a ADMINISTRADOR y GESTOR, pero solo
// ADMINISTRADOR administra privilegios de ADMINISTRADOR (otorgarlos o tocar a quien los tiene).
export type UsuarioActor = { role: string };

function forbidUsuario(message: string): never {
    const error = new Error(message) as any;
    error.statusCode = 403;
    throw error;
}

function assertPuedeAsignarRol(actor: UsuarioActor, rolSolicitado: Rol | undefined): void {
    if (actor.role !== 'ADMINISTRADOR' && rolSolicitado === 'ADMINISTRADOR') {
        forbidUsuario('Solo un ADMINISTRADOR puede asignar el rol ADMINISTRADOR');
    }
}

// Para no-ADMINISTRADOR: el objetivo debe existir y no ser ADMINISTRADOR.
async function assertPuedeModificarUsuario(actor: UsuarioActor, idObjetivo: number): Promise<void> {
    if (actor.role === 'ADMINISTRADOR') return;
    const objetivo = await prisma.user.findUnique({ where: { id: idObjetivo }, select: { role: true } });
    if (!objetivo) {
        const error = new Error('Usuario no encontrado') as any;
        error.statusCode = 404;
        throw error;
    }
    if (objetivo.role === 'ADMINISTRADOR') {
        forbidUsuario('Solo un ADMINISTRADOR puede modificar a otro ADMINISTRADOR');
    }
}

// crear usuario
export async function createUser(req: PostUsuarioRequest, actor: UsuarioActor): Promise<PostUsuarioResponse> {
    assertPuedeAsignarRol(actor, req.rol);

    // 1. Verificar si existe
    const exists = await prisma.user.findUnique({ where: { email: req.email }});
    if (exists) {
        const error = new Error('Email ya registrado') as any;
        error.statusCode = 409;
        throw error;
    }
    // 2. Hashear password
    const hashedPassword = await bcrypt.hash(req.password, 10);
  
    // 3. Crear usuario
    const created = await prisma.user.create({
        data: {
            username: (req.username).trim(),
            password: hashedPassword,
            role: req.rol as unknown as $Enums.Role,
            email: (req.email).toLowerCase().trim(),
        },
        omit: {password: true}
    });
    return { usuario: created , message: 'Usuario creado con éxito' };
}

// actualizar usuario
export async function updateUser( idActual: number, req: PutUsuarioRequest, actor: UsuarioActor ): Promise<PutUsuarioResponse> {
   assertPuedeAsignarRol(actor, req.rol);
   await assertPuedeModificarUsuario(actor, idActual);
   try {
       // Solo los campos del contrato de actualización: cualquier otra propiedad del input
       // (id, relaciones, etc.) no llega a Prisma. El rol público (rol) se persiste como role.
       const updateData: Prisma.UserUpdateInput = {};
       if (req.username !== undefined) updateData.username = req.username.trim();
       if (req.email !== undefined) updateData.email = req.email.toLowerCase().trim();
       if (req.password) updateData.password = await bcrypt.hash(req.password, 10);
       if (req.rol !== undefined) updateData.role = req.rol as unknown as $Enums.Role;
       const updated= await prisma.user.update({
           where: { id: idActual },
           data: updateData,
           omit: { password: true }
       });
       return { user: updated, message: "El usuario se actualizo con exito"};
   } catch (e: any) {
       if (e.code === 'P2025') {
           const error = new Error('Usuario no encontrado') as any;
           error.statusCode = 404;
           throw error;
       }
       throw e;
   }
}

// eliminar usuario
export async function deleteUser( req: DeleteUsuarioRequest ): Promise<DeleteUsuarioResponse> {
    try {
        await prisma.user.delete({ where: { id: req.idUsuario } });
        return { message: 'Usuario eliminado con éxito' };
    } catch (e: any) {
       if (e.code === 'P2025') {
           const error = new Error('Usuario no encontrado') as any;
           error.statusCode = 404;
           throw error;
       }
       throw e;
    }
}

