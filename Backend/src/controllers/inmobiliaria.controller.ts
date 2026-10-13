import { Request, Response, NextFunction } from 'express';
import * as inmobiliariaService from '../services/inmobiliaria.service';
import {
    PostInmobiliariaRequest,
    // PutInmobiliariaRequest // No se estaba usando explícitamente en el código anterior, pero está bien tenerlo
} from '../types/interfacesCCLF';

// ==============================
// Obtener todas las inmobiliarias
// ==============================
export async function getAllInmobiliariasController(req: Request, res: Response, next: NextFunction) {
    try {
        // validateQuery valida la query pero en Express 5 no reemplaza req.query: se arma el
        // filtro a mano. El listado solo filtra por estadoOperativo; el resto se ignora.
        const { estadoOperativo } = req.query;
        const filters = estadoOperativo !== undefined ? { estadoOperativo: estadoOperativo as string } : {};

        // Pasamos los filtros al servicio
        const result = await inmobiliariaService.getAllInmobiliarias(filters);
        
        res.json({ success: true, data: result });
    } catch (error) {
        next(error); 
    }
}

// ==============================
// Obtener Inmobiliaria por ID
// ==============================
export async function getInmobiliariaByIdController(req: Request, res: Response, next: NextFunction) {
    try {
        const idInmobiliaria = parseInt(req.params.id, 10);
        const result = await inmobiliariaService.getInmobiliariaById({ idInmobiliaria });  

        // CAMBIO 2: Corrección de lógica 404.
        // El servicio devuelve un objeto, por lo que !result siempre era falso.
        // Debemos verificar si la propiedad interna inmobiliaria es null.
        if (!result.inmobiliaria) {
            res.status(404).json({ success: false, message: result.message });
            return;
        }
        
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
}

// ==============================
// Crear nueva Inmobiliaria
// ==============================
export async function createInmobiliariaController(req: Request, res: Response, next: NextFunction) {
    try {
        const data: PostInmobiliariaRequest = req.body;
        const result = await inmobiliariaService.createInmobiliaria(data);

        // Validación simple de seguridad
        if (!result) {
            res.status(400).json({ success: false, message: "No se pudo crear la inmobiliaria" });
            return;
        }
        res.status(201).json({ success: true, message: "Inmobiliaria creada exitosamente", data: result });
    } catch (error) {
        next(error);
    }
}

// ==============================
// Actualizar Inmobiliaria existente
// ==============================
export async function updateInmobiliariaController(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    const data = req.body; 
    
    // NOTA: El servicio bloquea updates si está eliminado y no permite cambios de estadoOperativo
    // Solo endpoints de desactivar/reactivar pueden cambiar estadoOperativo
    const result = await inmobiliariaService.updateInmobiliaria(id, data);
    
    res.json({ success: true, message: 'Inmobiliaria actualizada exitosamente', data: result });
  } catch (error) {
    next(error);
  }
}

// ==============================
// Eliminar Inmobiliaria (soft delete - estadoOperativo)
// ==============================
export async function eliminarInmobiliariaController(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    const result = await inmobiliariaService.eliminarInmobiliaria(id);
    
    res.json({ success: true, message: 'Inmobiliaria eliminada exitosamente', data: result });
  } catch (error) {
    next(error);
  }
}

// ==============================
// Reactivar Inmobiliaria (estadoOperativo)
// ==============================
export async function reactivarInmobiliariaController(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    const result = await inmobiliariaService.reactivarInmobiliaria(id);
    
    res.json({ success: true, message: 'Inmobiliaria reactivada exitosamente', data: result });
  } catch (error) {
    next(error);
  }
}

// ==============================
// Eliminar Inmobiliaria (Hard Delete)
// ==============================
export async function deleteInmobiliariaController(req: Request, res: Response, next: NextFunction) {
    try {
        const idInmobiliaria = Number(req.params.id);
        const result = await inmobiliariaService.deleteInmobiliaria({ idInmobiliaria });

        // Aquí la lógica sí funcionaba porque el servicio lanzaba error o mensaje específico
        if (result.message === 'Inmobiliaria no encontrada') {
            res.status(404).json(result);
            return;
        }
        res.json({ success: true, message: "Inmobiliaria eliminada exitosamente", data: result });
    } catch (error) {
        next(error);
    }
}