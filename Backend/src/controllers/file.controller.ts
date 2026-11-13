import { Request, Response } from "express";
import * as FileService from "../services/file.service";
import { TipoFile } from "../types/files.types";
import { isInmobiliaria, canUserAccessArchivo, canUseIncludeDeleted } from "../utils/file.auth.utils";
import { validateUploadFile } from "../utils/file.upload.validation";
import { ensureVentaPerteneceALote } from "../utils/file.validation.utils";
import prisma from "../config/prisma";
import { safeErrorForLog } from "../utils/safeErrorLog";
import { errorCodeForStatus } from "../middlewares/error.middleware";
import { validatedParams, validatedQuery } from "../middlewares/validation.middleware";
import {
    CreateFileMetadataInput,
    fileIdParamsSchema,
    fileLoteParamsSchema,
    fileVentaParamsSchema,
    filesByLoteQuerySchema,
    filesByVentaQuerySchema,
} from "../validations/filemeta.validation";

const TIPOS_REQUIEREN_VENTA: TipoFile[] = ["BOLETO", "ESCRITURA", "OTRO"];
const TIPOS_PROHIBEN_VENTA: TipoFile[] = ["PLANO", "IMAGEN"];

/**
 * Verifica si el usuario puede acceder al archivo (canUserAccessArchivo: INMOBILIARIA por
 * ownership de venta, TECNICO por tipo). Retorna false si debe responder 404.
 */
async function verifyArchivoAccess(
  user: { role: string; inmobiliariaId?: number | null } | undefined,
  archivo: { tipo: TipoFile | string; ventaId?: number | null; estadoOperativo?: string }
): Promise<boolean> {
  let venta: { inmobiliariaId: number | null } | null = null;
  if (isInmobiliaria(user) && archivo.ventaId != null && TIPOS_REQUIEREN_VENTA.includes(archivo.tipo as TipoFile)) {
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

/** Error de cliente de Files con el contrato de error (D4): { success: false, code, message }. */
function sendFileClientError(res: Response, status: number, message: string) {
    return res.status(status).json({ success: false, code: errorCodeForStatus(status), message });
}

/**
 * Respuesta de error de Files. Un error de dominio (statusCode 4xx) conserva su status y mensaje.
 * Cualquier otro error es inesperado: 500 con un mensaje público fijo, sin el objeto error, stack,
 * mensaje interno ni metadata de Prisma/Supabase (el detalle queda solo en el log del servidor).
 */
function sendFileError(res: Response, error: unknown, publicMessage: string) {
    const statusCode = (error as { statusCode?: unknown } | null)?.statusCode;
    if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
        return sendFileClientError(res, statusCode, (error as Error).message || publicMessage);
    }
    console.error(`[files] ${publicMessage}:`, safeErrorForLog(error));
    return res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: publicMessage });
}

export class fileController {
    static async upload(req: Request, res: Response) {
        const file = req.file as Express.Multer.File;
        // Body ya validado en la ruta (createFileMetadataSchema): los IDs del multipart llegan como
        // number (o ventaId undefined), así que acá no se vuelve a parsear ningún string.
        const { idLoteAsociado, ventaId, tipo } = req.body as CreateFileMetadataInput;

        if (!file) {
            return sendFileClientError(res, 400, "No se subió ningún archivo");
        }

        if (!tipo || !["BOLETO", "ESCRITURA", "PLANO", "IMAGEN", "OTRO"].includes(tipo)) {
            return sendFileClientError(res, 400, "tipo inválido");
        }

        // Block 3: no se puede crear un tipo que el rol no puede leer (TECNICO → solo PLANO/IMAGEN).
        // Va antes de las reglas de venta: un tipo vedado no consulta la venta ni el storage.
        if (!canUserAccessArchivo(req.user, { tipo }, null)) {
            return sendFileClientError(res, 403, `No tenés permiso para subir archivos de tipo ${tipo}`);
        }

        if (TIPOS_REQUIEREN_VENTA.includes(tipo)) {
            if (ventaId === undefined) {
                return sendFileClientError(res, 400, `Para tipo ${tipo} se requiere ventaId`);
            }
        }
        if (TIPOS_PROHIBEN_VENTA.includes(tipo)) {
            if (ventaId !== undefined) {
                return sendFileClientError(res, 400, `Para tipo ${tipo} no se permite ventaId`);
            }
        }

        if (ventaId !== undefined) {
            try {
                await ensureVentaPerteneceALote(ventaId, idLoteAsociado);
            } catch (err) {
                return sendFileError(res, err, "Error al subir archivo");
            }
        }

        try {
            validateUploadFile(file);
        } catch (err: any) {
            return sendFileClientError(res, err.statusCode ?? 400, err.message);
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
        } catch (err) {
            sendFileError(res, err, "Error al subir archivo");
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
        sendFileError(res, error, "Error al obtener archivos");
    }
};

export const getAllFilesByVentaController = async (req: Request, res: Response) => {
    try {
        const { ventaId } = validatedParams(req, fileVentaParamsSchema);
        let venta: { inmobiliariaId: number | null } | null = null;
        if (isInmobiliaria(req.user)) {
            venta = await prisma.venta.findUnique({
                where: { id: ventaId },
                select: { inmobiliariaId: true },
            });
            if (!venta || venta.inmobiliariaId !== req.user?.inmobiliariaId) {
                return sendFileClientError(res, 404, "No encontrado");
            }
        }
        const { tipo, includeDeleted: requested = false } = validatedQuery(req, filesByVentaQuerySchema);
        const includeDeleted = requested && canUseIncludeDeleted(req.user);
        const files = await FileService.listByVenta(ventaId, tipo, includeDeleted);
        // Block 3: misma política por archivo que el resto de Files (TECNICO no ve documentos de venta).
        res.status(200).json(files.filter((f) => canUserAccessArchivo(req.user, f, venta)));
    } catch (error) {
        sendFileError(res, error, "Error al obtener archivos por venta");
    }
};

export const sustituirArchivoController = async (req: Request, res: Response) => {
    const { id } = validatedParams(req, fileIdParamsSchema);
    const file = req.file as Express.Multer.File;
    try {
        validateUploadFile(file);
    } catch (err: any) {
        return sendFileClientError(res, err.statusCode ?? 400, err.message);
    }
    try {
        const newFile = await FileService.sustituirArchivo(
            id,
            file.buffer,
            file.originalname,
            req.user?.email || null,
            req.user?.email || undefined,
            req.user
        );
        res.status(200).json({ message: "Archivo sustituido", data: newFile });
    } catch (error) {
        sendFileError(res, error, "Error al sustituir archivo");
    }
};

// Signed URL obligatoria: obtiene objectPath del registro por ID, nunca del body
export const generateSignedUrlController = async (req: Request, res: Response) => {
    const { id: fileId } = validatedParams(req, fileIdParamsSchema);

    try {
        const file = await FileService.getOperativeFileRaw(fileId);
        if (!file) {
            return sendFileClientError(res, 404, "Archivo no encontrado o eliminado");
        }
        if (!(await verifyArchivoAccess(req.user, file))) {
            return sendFileClientError(res, 404, "Archivo no encontrado o eliminado");
        }

        const expiresIn = 3600;
        const signedUrl = await FileService.generateSignedUrl(file.linkArchivo, expiresIn);
        const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
        res.status(200).json({ signedUrl, signedURL: signedUrl, expiresAt });
    } catch (error) {
        sendFileError(res, error, "Error al generar URL firmada");
    }
};

export const getFileByIdController = async (req: Request, res: Response) => {
    const { id } = validatedParams(req, fileIdParamsSchema);
    try {
        const file = await FileService.getFileById(id);
        if (!file) {
            return sendFileClientError(res, 404, "Archivo no encontrado");
        }
        if (!(await verifyArchivoAccess(req.user, file))) {
            return sendFileClientError(res, 404, "Archivo no encontrado");
        }
        res.status(200).json(file);
    } catch (error) {
        sendFileError(res, error, "Error al obtener archivo");
    }
};

export const deleteFileController = async (req: Request, res: Response) => {
    const { id } = validatedParams(req, fileIdParamsSchema);
    try {
        await FileService.deleteFileById(id, req.user?.email);
        res.status(204).send();
    } catch (error) {
        sendFileError(res, error, "Error al eliminar archivo");
    }
};

export const restoreFileController = async (req: Request, res: Response) => {
    const { id } = validatedParams(req, fileIdParamsSchema);
    try {
        const file = await FileService.restoreFileById(id);
        res.status(200).json({ message: "Archivo restaurado", data: file });
    } catch (error) {
        sendFileError(res, error, "Error al restaurar archivo");
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
    } catch (error) {
        sendFileError(res, error, "Error al actualizar aprobación");
    }
};

export const purgeFileController = async (req: Request, res: Response) => {
    const { id } = validatedParams(req, fileIdParamsSchema);
    try {
        const file = await prisma.archivos.findUnique({ where: { id } });
        if (!file) return sendFileClientError(res, 404, "Archivo no encontrado");
        if (!(await verifyArchivoAccess(req.user, file))) {
            return sendFileClientError(res, 404, "Archivo no encontrado");
        }
        await FileService.purgeFileById(id);
        res.status(204).send();
    } catch (error) {
        // El 404 sale del statusCode que lanza el service, no del texto del mensaje.
        sendFileError(res, error, "Error al purgar archivo");
    }
};
