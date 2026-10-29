import { Request, Response } from "express";
import * as FileService from "../services/file.service";
import { UpdateFileMetadata, TipoFile } from "../types/files.types";
import { isInmobiliaria, canUserAccessArchivo, canUseIncludeDeleted } from "../utils/file.auth.utils";
import { validateUploadFile } from "../utils/file.upload.validation";
import { ensureVentaPerteneceALote } from "../utils/file.validation.utils";
import prisma from "../config/prisma";
import { validatedParams, validatedQuery } from "../middlewares/validation.middleware";
import {
    fileIdParamsSchema,
    fileLoteParamsSchema,
    fileVentaParamsSchema,
    filesByLoteQuerySchema,
    filesByVentaQuerySchema,
} from "../validations/filemeta.validation";

const TIPOS_REQUIEREN_VENTA: TipoFile[] = ["BOLETO", "ESCRITURA", "OTRO"];
const TIPOS_PROHIBEN_VENTA: TipoFile[] = ["PLANO", "IMAGEN"];

/** Etapa 5.4: Verifica acceso INMOBILIARIA. Retorna false si debe responder 404. */
async function verifyInmobiliariaArchivoAccess(
  user: { role: string; inmobiliariaId?: number | null } | undefined,
  archivo: { tipo: TipoFile | string; ventaId?: number | null; estadoOperativo?: string }
): Promise<boolean> {
  if (!isInmobiliaria(user)) return true;
  let venta: { inmobiliariaId: number | null } | null = null;
  if (archivo.ventaId != null && TIPOS_REQUIEREN_VENTA.includes(archivo.tipo as TipoFile)) {
    venta = await prisma.venta.findUnique({
      where: { id: archivo.ventaId },
      select: { inmobiliariaId: true },
    });
  }
  const archivoForAuth = {
    tipo: archivo.tipo as TipoFile,
    ventaId: archivo.ventaId,
    estadoOperativo: archivo.estadoOperativo,
  };
  return canUserAccessArchivo(user, archivoForAuth, venta);
}

export class fileController {
    static async upload(req: Request, res: Response) {
        const file = req.file as Express.Multer.File;
        const body = req.body as { tipo: TipoFile; idLoteAsociado: string; ventaId?: string };
        const idLoteAsociado = parseInt(body.idLoteAsociado, 10);
        const ventaIdRaw = body.ventaId;
        const ventaId = ventaIdRaw ? parseInt(ventaIdRaw, 10) : undefined;

        if (!file) {
            return res.status(400).json({ message: "No se subió ningún archivo" });
        }
        if (!idLoteAsociado || isNaN(idLoteAsociado)) {
            return res.status(400).json({ message: "idLoteAsociado es obligatorio" });
        }

        const tipo = body.tipo as TipoFile;
        if (!tipo || !["BOLETO", "ESCRITURA", "PLANO", "IMAGEN", "OTRO"].includes(tipo)) {
            return res.status(400).json({ message: "tipo inválido" });
        }

        if (TIPOS_REQUIEREN_VENTA.includes(tipo)) {
            if (!ventaId || isNaN(ventaId)) {
                return res.status(400).json({
                    message: `Para tipo ${tipo} se requiere ventaId`,
                });
            }
        }
        if (TIPOS_PROHIBEN_VENTA.includes(tipo)) {
            if (ventaId != null && !isNaN(ventaId)) {
                return res.status(400).json({
                    message: `Para tipo ${tipo} no se permite ventaId`,
                });
            }
        }

        if (ventaId != null && !isNaN(ventaId)) {
            try {
                await ensureVentaPerteneceALote(ventaId, idLoteAsociado);
            } catch (err: any) {
                return res.status(err.statusCode ?? 400).json({ message: err.message });
            }
        }

        try {
            validateUploadFile(file);
        } catch (err: any) {
            return res.status(err.statusCode ?? 400).json({ message: err.message });
        }

        const { originalname, buffer } = file;
        try {
            const { objectPath } = await FileService.uploadFileToSupabase(buffer, {
                idLoteAsociado,
                tipo,
                filename: originalname,
                ventaId: TIPOS_REQUIEREN_VENTA.includes(tipo) ? ventaId : undefined,
                uploadedBy: req.user?.email || null,
                uploadedAt: new Date()
            });

            const newFile = await FileService.saveFileMetadata({
                filename: originalname,
                url: objectPath,
                tipo,
                idLoteAsociado,
                ventaId: ventaId ?? null,
                uploadedBy: req.user?.email || null
            });
            res.status(201).json({ message: 'Archivo subido', data: newFile });
        } catch (err: any) {
            const status = err.statusCode ?? 500;
            res.status(status).json({ message: err.message || "Error al subir archivo" });
        }
    }
}

export const getAllFilesController = async (req: Request, res: Response) => {
    try {
        const { idLoteAsociado: idLote } = validatedParams(req, fileLoteParamsSchema);
        const { includeDeleted: requested = false } = validatedQuery(req, filesByLoteQuerySchema);
        const includeDeleted = requested && canUseIncludeDeleted(req.user);
        const files = await FileService.listByLote(idLote, includeDeleted, req.user);
        res.status(200).json(files);
    } catch (error) {
        res.status(500).json({ message: "Error al obtener archivos", error });
    }
};

export const getAllFilesByVentaController = async (req: Request, res: Response) => {
    try {
        const { ventaId } = validatedParams(req, fileVentaParamsSchema);
        if (isInmobiliaria(req.user)) {
            const venta = await prisma.venta.findUnique({
                where: { id: ventaId },
                select: { inmobiliariaId: true },
            });
            if (!venta || venta.inmobiliariaId !== req.user?.inmobiliariaId) {
                return res.status(404).json({ message: "No encontrado" });
            }
        }
        const { tipo, includeDeleted: requested = false } = validatedQuery(req, filesByVentaQuerySchema);
        const includeDeleted = requested && canUseIncludeDeleted(req.user);
        const files = await FileService.listByVenta(ventaId, tipo, includeDeleted);
        res.status(200).json(files);
    } catch (error) {
        res.status(500).json({ message: "Error al obtener archivos por venta", error });
    }
};

export const sustituirArchivoController = async (req: Request, res: Response) => {
    const { id } = validatedParams(req, fileIdParamsSchema);
    const file = req.file as Express.Multer.File;
    try {
        validateUploadFile(file);
    } catch (err: any) {
        return res.status(err.statusCode ?? 400).json({ message: err.message });
    }
    try {
        const newFile = await FileService.sustituirArchivo(
            id,
            file.buffer,
            file.originalname,
            req.user?.email || null,
            req.user?.email || undefined
        );
        res.status(200).json({ message: "Archivo sustituido", data: newFile });
    } catch (error: any) {
        const status = error.statusCode ?? (error.message?.includes("encontrado") || error.message?.includes("eliminado") ? 400 : 500);
        res.status(status).json({ message: error.message || "Error al sustituir archivo" });
    }
};

// Signed URL obligatoria: obtiene objectPath del registro por ID, nunca del body
export const generateSignedUrlController = async (req: Request, res: Response) => {
    const { id: fileId } = validatedParams(req, fileIdParamsSchema);

    try {
        const file = await FileService.getOperativeFileRaw(fileId);
        if (!file) {
            return res.status(404).json({ message: "Archivo no encontrado o eliminado" });
        }
        if (!(await verifyInmobiliariaArchivoAccess(req.user, file))) {
            return res.status(404).json({ message: "Archivo no encontrado o eliminado" });
        }

        const expiresIn = 3600;
        const signedUrl = await FileService.generateSignedUrl(file.linkArchivo, expiresIn);
        const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
        res.status(200).json({ signedUrl, signedURL: signedUrl, expiresAt });
    } catch (error) {
        res.status(500).json({ message: "Error al generar URL firmada", error });
    }
};

export const getFileByIdController = async (req: Request, res: Response) => {
    const { id } = validatedParams(req, fileIdParamsSchema);
    try {
        const file = await FileService.getFileById(id);
        if (!file) {
            return res.status(404).json({ message: "Archivo no encontrado" });
        }
        if (!(await verifyInmobiliariaArchivoAccess(req.user, file))) {
            return res.status(404).json({ message: "Archivo no encontrado" });
        }
        res.status(200).json(file);
    } catch (error) {
        res.status(500).json({ message: "Error al obtener archivo", error });
    }
};

export const updateFileController = async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const updates: UpdateFileMetadata = req.body;
    try {
        const updatedFile = await FileService.updateFileMetadata(id, updates);
        if (!updatedFile) {
            return res.status(404).json({ message: "Archivo no encontrado" });
        }
        res.status(200).json(updatedFile);
    } catch (error: any) {
        const status = error.message?.includes("eliminado") ? 400 : 500;
        res.status(status).json({ message: error.message || "Error al actualizar metadata del archivo" });
    }
};

export const deleteFileController = async (req: Request, res: Response) => {
    const { id } = validatedParams(req, fileIdParamsSchema);
    try {
        await FileService.deleteFileById(id, req.user?.email);
        res.status(204).send();
    } catch (error: any) {
        const status = error?.statusCode ?? 500;
        res.status(status).json({ message: error?.message || "Error al eliminar archivo" });
    }
};

export const restoreFileController = async (req: Request, res: Response) => {
    const { id } = validatedParams(req, fileIdParamsSchema);
    try {
        const file = await FileService.restoreFileById(id);
        res.status(200).json({ message: "Archivo restaurado", data: file });
    } catch (error: any) {
        const status = error.message?.includes("encontrado") || error.message?.includes("eliminados") ? 400 : 500;
        res.status(status).json({ message: error.message || "Error al restaurar archivo" });
    }
};

export const updateAprobacionController = async (req: Request, res: Response) => {
    const { id } = validatedParams(req, fileIdParamsSchema);

    const { target, estado, observacion } = req.body;
    try {
        const updated = await FileService.updateAprobacionPlano(
            id,
            target,
            estado,
            req.user?.email || "",
            req.user?.role || "",
            observacion
        );
        res.status(200).json({ message: "Aprobación actualizada", data: updated });
    } catch (error: any) {
        const status = error.statusCode ?? 500;
        res.status(status).json({ message: error.message || "Error al actualizar aprobación" });
    }
};

export const purgeFileController = async (req: Request, res: Response) => {
    const { id } = validatedParams(req, fileIdParamsSchema);
    try {
        const file = await prisma.archivos.findUnique({ where: { id } });
        if (!file) return res.status(404).json({ message: "Archivo no encontrado" });
        if (!(await verifyInmobiliariaArchivoAccess(req.user, file))) {
            return res.status(404).json({ message: "Archivo no encontrado" });
        }
        await FileService.purgeFileById(id);
        res.status(204).send();
    } catch (error: any) {
        const status = error.message?.includes("encontrado") ? 404 : 500;
        res.status(status).json({ message: error.message || "Error al purgar archivo" });
    }
};


