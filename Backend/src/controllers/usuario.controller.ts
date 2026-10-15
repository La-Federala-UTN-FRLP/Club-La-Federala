import { Request, Response, NextFunction } from 'express';
import * as UsuarioService from '../services/usuario.service';
import { PutUsuarioRequest } from '../types/interfacesCCLF';

// Obtener todos los usuarios
export async function obtenerTodosUsuarios( req: Request, res: Response, next: NextFunction) {
    try {
        const result = await UsuarioService.getAllUsers();
        res.json({success: true, data:result});
    } catch (error) {
            next(error);
    }
}

// Obtener usuario por ID
export async function obtenerUsuarioPorId( req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
        const id = parseInt(req.params.id);
        const result = await UsuarioService.getUsuarioById(id);
        res.json({success: true, data:result});
    } catch (error) {
        next(error);
    }
}

// Crear usuario
export async function crearUsuario(req: Request, res: Response, next: NextFunction) {
    try {
        const usuario = await UsuarioService.createUser(req.body);
        res.status(201).json({success: true,message: "Usuario creado exitosamente", data:usuario});
    } catch (error) {
        next(error);
    }   
}

// Actualizar usuario por ID
export async function actualizarUsuario(req: Request<{id: string}, {}, PutUsuarioRequest>, res: Response, next: NextFunction) {
    try {
        // id validado por getUsuarioSchema (z.coerce.number): Number() da el mismo valor; parseInt no.
        const id = Number(req.params.id);
        const result = await UsuarioService.updateUser(id, req.body);
        res.json({success: true, message: "Usuario actualizado exitosamente", data:result});
    } catch (error) {
        next(error);
    }
}

// Eliminar usuario por ID
export async function eliminarUsuario(req: Request<{ id: string }>, res: Response, next: NextFunction) {
    try {
        const id = parseInt(req.params.id);
        const deleteRequest = { idUsuario: id }; 
        const result = await UsuarioService.deleteUser(deleteRequest);
        res.json({success: true, message: "Usuario eliminado exitosamente"});
    } catch (error) {
        next(error);
    }
}

