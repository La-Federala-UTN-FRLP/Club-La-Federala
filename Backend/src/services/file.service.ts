import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import type { FileMetadata, TipoFile, NewFileMetadata, UpdateFileMetadata, EstadoAprobacion, TargetAprobacion } from "../types/files.types";
import {
  isInmobiliaria,
  canUserAccessArchivo,
  canUpdateAprobacion,
  type FileAuthUser,
} from "../utils/file.auth.utils";
import { ensureVentaPerteneceALote } from "../utils/file.validation.utils";
import prisma from "../config/prisma";
import { getWebEnv } from "../config/env";
import type { SupabaseClient } from "@supabase/supabase-js";

let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    const { supabaseUrl, supabaseServiceKey } = getWebEnv();
    supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
  }
  return supabaseClient;
}

function getSupabaseBucket(): string {
  return getWebEnv().supabaseBucket;
}

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
 * Genera path único en Supabase Storage para evitar sobrescrituras (Etapa 5.3).
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

export async function uploadFileToSupabase(
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

  const { error } = await getSupabaseClient().storage
    .from(getSupabaseBucket())
    .upload(objectPath, fileBuffer, {
      contentType: "application/octet-stream",
      upsert: false,
    });

  if (error) {
    if (error.message?.toLowerCase().includes("already exists") || error.message?.toLowerCase().includes("duplicate")) {
      throw Object.assign(new Error("El archivo ya existe en storage (path duplicado). Reintente."), { statusCode: 409 });
    }
    throw new Error(`Error uploading file: ${error.message}`);
  }

  return { objectPath };
}

export async function generateSignedUrl(objectPath: string, expiresIn: number = 3660): Promise<string> {
  const { data, error } = await getSupabaseClient().storage
    .from(getSupabaseBucket())
    .createSignedUrl(objectPath, expiresIn, { download: false });

  if (error || !data?.signedUrl) {
    throw new Error(`Error generating signed URL: ${error?.message}`);
  }

  return data.signedUrl;
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

  if (!isInmobiliaria(user)) {
    return rows.map(toFileMetadata);
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

/** Restaurar archivo eliminado: OPERATIVO, limpia fechaBaja y deletedBy */
export async function restoreFileById(id: number): Promise<FileMetadata> {
  const file = await prisma.archivos.findUnique({ where: { id }, include: { venta: { select: { numero: true } } } });
  if (!file) throw new Error("Archivo no encontrado");
  if (file.estadoOperativo !== "ELIMINADO") {
    throw new Error("Solo se pueden restaurar archivos eliminados");
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

/** Purga definitiva: borra en Supabase Storage + registro en DB */
export async function purgeFileById(id: number): Promise<void> {
  const file = await prisma.archivos.findUnique({ where: { id } });
  if (!file) throw new Error("Archivo no encontrado");
  const objectPath = file.linkArchivo;
  const { error } = await getSupabaseClient().storage.from(getSupabaseBucket()).remove([objectPath]);
  if (error) {
    console.warn(`Supabase remove: ${error.message} (continuando con borrado DB)`);
  }
  await prisma.archivos.delete({ where: { id } });
}

export async function updateFileMetadata(id: number, updates: UpdateFileMetadata): Promise<FileMetadata> {
  const existingFile = await prisma.archivos.findUnique({ where: { id } });
  if (!existingFile) throw new Error("File not found");
  if (existingFile.estadoOperativo === "ELIMINADO") {
    throw new Error("No se puede modificar un archivo eliminado");
  }

  const updatedFile = await prisma.archivos.update({
    where: { id },
    data: {
      nombreArchivo: updates.filename || existingFile.nombreArchivo,
      linkArchivo: updates.url || existingFile.linkArchivo,
      tipo: updates.tipo || (existingFile.tipo as TipoFile),
      idLoteAsociado: updates.idLoteAsociado || existingFile.idLoteAsociado,
      ventaId: updates.ventaId !== undefined ? updates.ventaId : existingFile.ventaId,
      uploadedBy: updates.uploadedBy !== undefined ? updates.uploadedBy : existingFile.uploadedBy,
    },
  });

  return toFileMetadata(updatedFile);
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
 */
export async function sustituirArchivo(
  id: number,
  fileBuffer: Buffer,
  originalname: string,
  uploadedBy?: string | null,
  deletedByEmail?: string
): Promise<FileMetadata> {
  const oldFile = await prisma.archivos.findUnique({ where: { id } });
  if (!oldFile) throw new Error("Archivo no encontrado");
  if (oldFile.estadoOperativo === "ELIMINADO") {
    throw new Error("No se puede sustituir un archivo eliminado");
  }
  const tipo = oldFile.tipo as TipoFile;
  const tiposSustituibles: TipoFile[] = ["BOLETO", "ESCRITURA", "OTRO", "PLANO"];
  if (!tiposSustituibles.includes(tipo)) {
    throw new Error(
      `No se puede sustituir archivos de tipo ${tipo}. Solo BOLETO, ESCRITURA, OTRO o PLANO.`
    );
  }

  // Etapa 5.4.3: validar Venta ↔ Lote para documentos de venta
  if (oldFile.ventaId != null) {
    await ensureVentaPerteneceALote(oldFile.ventaId, oldFile.idLoteAsociado);
  }

  const { objectPath } = await uploadFileToSupabase(fileBuffer, {
    idLoteAsociado: oldFile.idLoteAsociado,
    tipo,
    filename: originalname,
    ventaId: oldFile.ventaId,
    uploadedBy: uploadedBy || null,
    uploadedAt: new Date(),
  });

  const newFile = await prisma.$transaction(async (tx) => {
    await tx.archivos.update({
      where: { id },
      data: {
        estadoOperativo: "ELIMINADO",
        fechaBaja: new Date(),
        deletedBy: deletedByEmail || null,
      },
    });
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
  if (!file) {
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