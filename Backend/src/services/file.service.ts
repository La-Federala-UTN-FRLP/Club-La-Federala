import { randomUUID } from "crypto";
import type { FileMetadata, TipoFile, NewFileMetadata, EstadoAprobacion, TargetAprobacion } from "../types/files.types";
import {
  isInmobiliaria,
  isTecnico,
  canUserAccessArchivo,
  canUpdateAprobacion,
  type FileAuthUser,
} from "../utils/file.auth.utils";
import { ensureVentaPerteneceALote } from "../utils/file.validation.utils";
import prisma from "../config/prisma";
import { getObjectStorage } from "../storage";
import { safeErrorForLog } from '../utils/safeErrorLog';

const STORAGE_CONTENT_TYPE = "application/octet-stream";

const TIPOS_DOC_VENTA: TipoFile[] = ["BOLETO", "ESCRITURA", "OTRO"];
const TIPOS_DOC_LOTE: TipoFile[] = ["PLANO", "IMAGEN"];
const MAX_FILENAME_LEN = 200;

/**
 * Sanitiza el nombre de archivo: solo [a-zA-Z0-9._-], sin espacios ni caracteres raros.
 */
function sanitizeFilename(original: string): string {
  if (!original || typeof original !== "string") return "archivo";
  const base = original.replace(/[^a-zA-Z0-9._-]/g, "_").trim() || "archivo";
  return base.length > MAX_FILENAME_LEN ? base.slice(0, MAX_FILENAME_LEN) : base;
}

/**
 * Genera path único en el storage para evitar sobrescrituras (Etapa 5.3).
 * Incluye uuid + YYYY-MM. No reutiliza paths de archivos existentes.
 * PLANO/IMAGEN: lote-{loteId}/{tipo}/{YYYY-MM}/{uuid}-{sanitizedFilename}
 * BOLETO/ESCRITURA/OTRO: lote-{loteId}/{tipo}/venta-{ventaId}/{YYYY-MM}/{uuid}-{sanitizedFilename}
 */
function buildStoragePath(params: {
  loteId: number;
  tipo: TipoFile;
  originalFilename: string;
  ventaId?: number | null;
}): string {
  const { loteId, tipo, originalFilename, ventaId } = params;

  if (TIPOS_DOC_LOTE.includes(tipo)) {
    if (ventaId != null) {
      throw new Error(`Para tipo ${tipo} no se permite ventaId`);
    }
  } else if (TIPOS_DOC_VENTA.includes(tipo)) {
    if (ventaId == null || typeof ventaId !== "number") {
      throw new Error(`Para tipo ${tipo} se requiere ventaId`);
    }
  }

  const now = new Date();
  const yyyyMm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const uuid = randomUUID();
  const sanitized = sanitizeFilename(originalFilename);

  if (TIPOS_DOC_VENTA.includes(tipo)) {
    return `lote-${loteId}/${tipo}/venta-${ventaId}/${yyyyMm}/${uuid}-${sanitized}`;
  }
  return `lote-${loteId}/${tipo}/${yyyyMm}/${uuid}-${sanitized}`;
}

export async function uploadObject(
  fileBuffer: Buffer,
  metadata: {
    idLoteAsociado: number;
    tipo: TipoFile;
    filename: string;
    ventaId?: number | null;
    uploadedBy?: string | null;
    uploadedAt: Date;
  }
): Promise<{ objectPath: string }> {
  const objectPath = buildStoragePath({
    loteId: metadata.idLoteAsociado,
    tipo: metadata.tipo,
    originalFilename: metadata.filename,
    ventaId: metadata.ventaId,
  });

  await getObjectStorage().putObject(objectPath, fileBuffer, STORAGE_CONTENT_TYPE);
  return { objectPath };
}

/**
 * Best-effort: borra un objeto recién subido si la metadata no llegó a commitearse.
 * Un fallo de esta limpieza no reemplaza el error original.
 */
export async function compensateUploadedObject(objectPath: string): Promise<void> {
  try {
    await getObjectStorage().deleteObject(objectPath);
  } catch (error) {
    console.warn('No se pudo compensar el objeto subido:', safeErrorForLog(error));
  }
}

export async function generateSignedUrl(objectPath: string, expiresIn: number = 3600): Promise<string> {
  return getObjectStorage().getSignedReadUrl(objectPath, expiresIn);
}

function toFileMetadata(row: any): FileMetadata {
  return {
    id: row.id,
    filename: row.nombreArchivo,
    url: row.linkArchivo,
    tipo: row.tipo as TipoFile,
    uploadedAt: row.createdAt,
    updatedAt: row.updatedAt,
    uploadedBy: row.uploadedBy,
    idLoteAsociado: row.idLoteAsociado,
    ventaId: row.ventaId ?? null,
    ventaNumero: row.venta?.numero ?? null,
    estadoOperativo: row.estadoOperativo,
    fechaBaja: row.fechaBaja ?? null,
    deletedBy: row.deletedBy,
    estadoAprobacionComision: row.estadoAprobacionComision ?? null,
    fechaAprobacionComision: row.fechaAprobacionComision ?? null,
    aprobadoComisionBy: row.aprobadoComisionBy ?? null,
    observacionAprobacionComision: row.observacionAprobacionComision ?? null,
    estadoAprobacionMunicipio: row.estadoAprobacionMunicipio ?? null,
    fechaAprobacionMunicipio: row.fechaAprobacionMunicipio ?? null,
    aprobadoMunicipioBy: row.aprobadoMunicipioBy ?? null,
    observacionAprobacionMunicipio: row.observacionAprobacionMunicipio ?? null,
  };
}

export async function saveFileMetadata(metadata: NewFileMetadata): Promise<FileMetadata> {
  const isPlano = metadata.tipo === "PLANO";
  const newFile = await prisma.archivos.create({
    data: {
      nombreArchivo: metadata.filename,
      linkArchivo: metadata.url,
      tipo: metadata.tipo,
      idLoteAsociado: metadata.idLoteAsociado,
      ventaId: metadata.ventaId ?? null,
      uploadedBy: metadata.uploadedBy || null,
      ...(isPlano && {
        estadoAprobacionComision: "PENDIENTE",
        estadoAprobacionMunicipio: "PENDIENTE",
      }),
    },
  });
  return toFileMetadata(newFile);
}

/**
 * Lista archivos por lote. Si user es INMOBILIARIA (Etapa 5.4), filtra:
 * - PLANO/IMAGEN: incluir siempre.
 * - BOLETO/ESCRITURA/OTRO: solo si venta.inmobiliariaId == user.inmobiliariaId.
 * Si user es TECNICO (Block 3), solo los tipos que canUserAccessArchivo le permite.
 */
export async function listByLote(
  idLoteAsociado: number,
  includeDeleted = false,
  user?: FileAuthUser
): Promise<FileMetadata[]> {
  const where: any = { idLoteAsociado };
  if (!includeDeleted) {
    where.estadoOperativo = "OPERATIVO";
  }
  const rows = await prisma.archivos.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { venta: { select: { numero: true } } },
  });

  if (isTecnico(user)) {
    return rows
      .filter((row) => canUserAccessArchivo(user, { tipo: row.tipo as TipoFile }, null))
      .map(toFileMetadata);
  }

  if (!isInmobiliaria(user)) {
    return rows.map(toFileMetadata);
  }

  // Lote NO_DISPONIBLE: para INMOBILIARIA, la misma lista vacía que un lote inexistente (no revela que existe).
  const lote = await prisma.lote.findUnique({ where: { id: idLoteAsociado }, select: { estado: true } });
  if (lote?.estado === "NO_DISPONIBLE") {
    return [];
  }

  const ventaIds = [...new Set(rows.map((r) => r.ventaId).filter((id): id is number => id != null))];
  const ventas =
    ventaIds.length > 0
      ? await prisma.venta.findMany({
          where: { id: { in: ventaIds } },
          select: { id: true, inmobiliariaId: true },
        })
      : [];
  const ventaMap = new Map(ventas.map((v) => [v.id, v]));

  const filtered = rows.filter((row) => {
    const metadata = { tipo: row.tipo as TipoFile, ventaId: row.ventaId, estadoOperativo: row.estadoOperativo };
    const venta = row.ventaId != null ? ventaMap.get(row.ventaId) ?? null : null;
    return canUserAccessArchivo(user, metadata, venta);
  });

  return filtered.map(toFileMetadata);
}

export async function listByVenta(
  ventaId: number,
  tipo?: TipoFile,
  includeDeleted = false
): Promise<FileMetadata[]> {
  const where: any = { ventaId };
  if (!includeDeleted) {
    where.estadoOperativo = "OPERATIVO";
  }
  if (tipo) {
    where.tipo = tipo;
  }
  const rows = await prisma.archivos.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { venta: { select: { numero: true } } },
  });
  return rows.map(toFileMetadata);
}

export async function getFileById(id: number): Promise<FileMetadata | null> {
  const file = await prisma.archivos.findUnique({ where: { id } });
  if (!file || file.estadoOperativo === "ELIMINADO") return null;
  return toFileMetadata(file);
}

// Soft delete: marca el registro como ELIMINADO sin tocar el binario en storage (Etapa 5.4.3)
export async function deleteFileById(id: number, deletedByEmail?: string): Promise<void> {
  const file = await prisma.archivos.findUnique({ where: { id } });
  if (!file) {
    const err = new Error("Archivo no encontrado") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }
  if (file.estadoOperativo === "ELIMINADO") {
    const err = new Error("El archivo ya está eliminado") as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }

  await prisma.archivos.update({
    where: { id },
    data: {
      estadoOperativo: "ELIMINADO",
      fechaBaja: new Date(),
      deletedBy: deletedByEmail || null,
    },
  });
}

// Error de negocio con status HTTP explícito: el controller usa error.statusCode, no el texto del mensaje.
const errorHttp = (message: string, statusCode: number): Error =>
  Object.assign(new Error(message), { statusCode });

/** Restaurar archivo eliminado: OPERATIVO, limpia fechaBaja y deletedBy */
export async function restoreFileById(id: number): Promise<FileMetadata> {
  const file = await prisma.archivos.findUnique({ where: { id }, include: { venta: { select: { numero: true } } } });
  if (!file) throw errorHttp("Archivo no encontrado", 404);
  if (file.estadoOperativo !== "ELIMINADO") {
    throw errorHttp("Solo se pueden restaurar archivos eliminados", 400);
  }
  const updated = await prisma.archivos.update({
    where: { id },
    data: {
      estadoOperativo: "OPERATIVO",
      fechaBaja: null,
      deletedBy: null,
    },
    include: { venta: { select: { numero: true } } },
  });
  return toFileMetadata(updated);
}

/**
 * Purga definitiva. El objeto se borra antes que la fila.
 * Un error real de storage conserva la metadata para poder reintentar.
 * Si el objeto ya no existe, el borrado de storage se considera hecho.
 * Si storage responde bien y falla PostgreSQL, la fila queda para un reintento idempotente.
 */
export async function purgeFileById(id: number): Promise<void> {
  const file = await prisma.archivos.findUnique({ where: { id } });
  if (!file) throw errorHttp("Archivo no encontrado", 404);
  try {
    await getObjectStorage().deleteObject(file.linkArchivo);
  } catch (error) {
    console.warn('No se pudo eliminar el objeto; se conserva la metadata:', safeErrorForLog(error));
    throw error;
  }
  await prisma.archivos.delete({ where: { id } });
}

// Busca un archivo operativo por ID y devuelve el registro crudo (para signed URL)
export async function getOperativeFileRaw(id: number) {
  const file = await prisma.archivos.findUnique({ where: { id } });
  if (!file || file.estadoOperativo === "ELIMINADO") return null;
  return file;
}

/**
 * Sustituir documento: soft delete del anterior + subir nuevo del mismo tipo, loteId, ventaId.
 * NO cambia EstadoVenta.
 * Block 3: un tipo que el usuario no puede ver responde 404 antes de cualquier otra validación
 * (no se revela que existe ni su estado).
 */
export async function sustituirArchivo(
  id: number,
  fileBuffer: Buffer,
  originalname: string,
  uploadedBy?: string | null,
  deletedByEmail?: string,
  user?: FileAuthUser
): Promise<FileMetadata> {
  const oldFile = await prisma.archivos.findUnique({ where: { id } });
  if (!oldFile || !canUserAccessArchivo(user, { tipo: oldFile.tipo as TipoFile }, null)) {
    throw errorHttp("Archivo no encontrado", 404);
  }
  if (oldFile.estadoOperativo === "ELIMINADO") {
    throw errorHttp("No se puede sustituir un archivo eliminado", 400);
  }
  const tipo = oldFile.tipo as TipoFile;
  const tiposSustituibles: TipoFile[] = ["BOLETO", "ESCRITURA", "OTRO", "PLANO"];
  if (!tiposSustituibles.includes(tipo)) {
    throw errorHttp(
      `No se puede sustituir archivos de tipo ${tipo}. Solo BOLETO, ESCRITURA, OTRO o PLANO.`,
      400
    );
  }

  // Etapa 5.4.3: validar Venta ↔ Lote para documentos de venta
  if (oldFile.ventaId != null) {
    await ensureVentaPerteneceALote(oldFile.ventaId, oldFile.idLoteAsociado);
  }

  const { objectPath } = await uploadObject(fileBuffer, {
    idLoteAsociado: oldFile.idLoteAsociado,
    tipo,
    filename: originalname,
    ventaId: oldFile.ventaId,
    uploadedBy: uploadedBy || null,
    uploadedAt: new Date(),
  });

  try {
    const newFile = await prisma.$transaction(async (tx) => {
      // Solo una sustitución concurrente puede pasar de OPERATIVO a ELIMINADO.
      const claimed = await tx.archivos.updateMany({
        where: { id, estadoOperativo: "OPERATIVO" },
        data: {
          estadoOperativo: "ELIMINADO",
          fechaBaja: new Date(),
          deletedBy: deletedByEmail || null,
        },
      });
      if (claimed.count !== 1) {
        throw errorHttp("No se puede sustituir un archivo eliminado", 400);
      }
      return tx.archivos.create({
        data: {
          nombreArchivo: originalname,
          linkArchivo: objectPath,
          tipo,
          idLoteAsociado: oldFile.idLoteAsociado,
          ventaId: oldFile.ventaId,
          uploadedBy: uploadedBy || null,
          ...(tipo === "PLANO" && {
            estadoAprobacionComision: "PENDIENTE",
            estadoAprobacionMunicipio: "PENDIENTE",
          }),
        },
      });
    });
    return toFileMetadata(newFile);
  } catch (error) {
    await compensateUploadedObject(objectPath);
    throw error;
  }
}

/**
 * Etapa 5.5: Actualiza aprobación (Comisión o Municipio) de un archivo tipo PLANO.
 */
export async function updateAprobacionPlano(
  id: number,
  target: TargetAprobacion,
  estado: EstadoAprobacion,
  userEmail: string,
  userRole: string,
  observacion?: string
): Promise<FileMetadata> {
  const file = await prisma.archivos.findUnique({ where: { id }, include: { venta: { select: { numero: true } } } });
  // Block 3: la autorización por tipo precede a la validación de tipo y a la acción (un tipo que
  // el rol no puede ver responde 404, sin revelar que el id existe ni qué tipo tiene).
  if (!file || !canUserAccessArchivo({ role: userRole }, { tipo: file.tipo as TipoFile }, null)) {
    const err = new Error("Archivo no encontrado") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }
  if (file.tipo !== "PLANO") {
    const err = new Error("Solo se pueden modificar aprobaciones de archivos tipo PLANO") as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }
  if (file.estadoOperativo === "ELIMINADO") {
    const err = new Error("No se puede modificar la aprobación de un archivo eliminado") as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }
  if (!canUpdateAprobacion(userRole, target)) {
    const err = new Error(`No tenés permiso para modificar la aprobación de ${target}`) as Error & { statusCode?: number };
    err.statusCode = 403;
    throw err;
  }

  const now = new Date();
  const isReset = estado === "PENDIENTE";

  const data: Record<string, any> = {};
  if (target === "COMISION") {
    data.estadoAprobacionComision = estado;
    data.fechaAprobacionComision = isReset ? null : now;
    data.aprobadoComisionBy = isReset ? null : userEmail;
    data.observacionAprobacionComision = isReset ? null : (observacion ?? null);
  } else {
    data.estadoAprobacionMunicipio = estado;
    data.fechaAprobacionMunicipio = isReset ? null : now;
    data.aprobadoMunicipioBy = isReset ? null : userEmail;
    data.observacionAprobacionMunicipio = isReset ? null : (observacion ?? null);
  }

  const updated = await prisma.archivos.update({
    where: { id },
    data,
    include: { venta: { select: { numero: true } } },
  });
  return toFileMetadata(updated);
}