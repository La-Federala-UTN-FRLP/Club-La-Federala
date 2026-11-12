import { http } from '../http/http';

const PRIMARY = "/files";

const getApiBase = () => {
  const RAW_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || "";
  const FORCE_ABS = import.meta.env.VITE_API_FORCE_ABSOLUTE === "true";
  const isLocalAbs = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(RAW_BASE);
  return (import.meta.env.DEV && isLocalAbs && !FORCE_ABS) ? "/api" : (RAW_BASE || "/api");
};

/**
 * Obtiene todos los archivos de un lote
 * @param {number} loteId - ID del lote
 * @param {boolean} [includeDeleted=false] - Incluir eliminados (solo ADMIN/GESTOR)
 * @returns {Promise<Array>} Lista de archivos
 */
export async function getArchivosByLote(loteId, includeDeleted = false) {
  if (!loteId) return [];
  try {
    const qs = includeDeleted ? "?includeDeleted=true" : "";
    const res = await http(`${PRIMARY}/lote/${loteId}${qs}`, { method: "GET" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || "Error al obtener archivos");
    const archivos = Array.isArray(data) ? data : (data?.archivos || data?.data || []);
    return archivos.map(archivo => mapArchivo(archivo));
  } catch (error) {
    console.error("Error obteniendo archivos por lote:", error);
    return [];
  }
}

function mapArchivo(archivo) {
  return {
    id: archivo.id,
    filename: archivo.filename || archivo.nombreArchivo,
    url: archivo.url || archivo.linkArchivo,
    tipo: archivo.tipo,
    uploadedAt: archivo.uploadedAt || archivo.createdAt,
    uploadedBy: archivo.uploadedBy,
    idLoteAsociado: archivo.idLoteAsociado,
    ventaId: archivo.ventaId,
    ventaNumero: archivo.ventaNumero,
    estadoOperativo: archivo.estadoOperativo || "OPERATIVO",
    fechaBaja: archivo.fechaBaja ?? null,
    deletedBy: archivo.deletedBy ?? null,
    estadoAprobacionComision: archivo.estadoAprobacionComision ?? null,
    fechaAprobacionComision: archivo.fechaAprobacionComision ?? null,
    aprobadoComisionBy: archivo.aprobadoComisionBy ?? null,
    observacionAprobacionComision: archivo.observacionAprobacionComision ?? null,
    estadoAprobacionMunicipio: archivo.estadoAprobacionMunicipio ?? null,
    fechaAprobacionMunicipio: archivo.fechaAprobacionMunicipio ?? null,
    aprobadoMunicipioBy: archivo.aprobadoMunicipioBy ?? null,
    observacionAprobacionMunicipio: archivo.observacionAprobacionMunicipio ?? null,
  };
}

/**
 * Obtiene todos los archivos de una venta
 * @param {number} ventaId - ID de la venta
 * @param {string} [tipo] - Opcional: BOLETO | ESCRITURA | OTRO
 * @param {boolean} [includeDeleted=false] - Incluir eliminados (solo ADMIN/GESTOR)
 * @returns {Promise<Array>} Lista de archivos
 */
export async function getArchivosByVenta(ventaId, tipo, includeDeleted = false) {
  if (!ventaId) return [];
  try {
    const params = new URLSearchParams();
    if (tipo) params.set("tipo", tipo);
    if (includeDeleted) params.set("includeDeleted", "true");
    const qs = params.toString() ? `?${params}` : "";
    const res = await http(`${PRIMARY}/venta/${ventaId}${qs}`, { method: "GET" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || "Error al obtener archivos");
    const archivos = Array.isArray(data) ? data : (data?.archivos || data?.data || []);
    return archivos.map(mapArchivo);
  } catch (error) {
    console.error("Error obteniendo archivos por venta:", error);
    return [];
  }
}

/**
 * Obtiene un archivo por ID
 * @param {number} id - ID del archivo
 * @returns {Promise<Object>} Archivo
 */
export async function getArchivoById(id) {
  try {
    const res = await http(`${PRIMARY}/${id}`, { method: "GET" });
    const data = await res.json().catch(() => ({}));
    
    if (!res.ok) {
      throw new Error(data?.message || "Error al obtener archivo");
    }
    
    const archivo = data?.archivo || data?.data || data;
    
    return {
      id: archivo.id,
      filename: archivo.filename || archivo.nombreArchivo,
      url: archivo.url || archivo.linkArchivo,
      tipo: archivo.tipo,
      uploadedAt: archivo.uploadedAt || archivo.createdAt,
      uploadedBy: archivo.uploadedBy,
      idLoteAsociado: archivo.idLoteAsociado,
    };
  } catch (error) {
    console.error("Error obteniendo archivo por id:", error);
    throw error;
  }
}

/**
 * Sube un archivo al backend
 * @param {File} file - Archivo a subir
 * @param {number} idLoteAsociado - ID del lote asociado
 * @param {string} tipo - Tipo de archivo: 'BOLETO' | 'ESCRITURA' | 'PLANO' | 'IMAGEN' | 'OTRO'
 * @param {number} [ventaId] - Opcional, obligatorio para BOLETO/ESCRITURA/OTRO
 * @returns {Promise<Object>} Archivo subido con metadata
 */
export async function uploadArchivo(file, idLoteAsociado, tipo = "IMAGEN", ventaId) {
  if (!file) {
    throw new Error("No se proporcionó ningún archivo");
  }
  if (!idLoteAsociado) {
    throw new Error("Se requiere el ID del lote asociado");
  }

  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("idLoteAsociado", String(idLoteAsociado));
    formData.append("tipo", tipo);
    if (ventaId != null && ventaId !== "") {
      formData.append("ventaId", String(ventaId));
    }

    const { getAccessToken } = await import("../auth/token");
    const access = getAccessToken();
    const url = `${getApiBase()}${PRIMARY}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
      },
      body: formData,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data?.message || "Error al subir archivo");
    }

    const archivo = data?.data || data?.archivo || data;
    
    return {
      id: archivo.id,
      filename: archivo.filename || archivo.nombreArchivo,
      url: archivo.url || archivo.linkArchivo,
      tipo: archivo.tipo,
      uploadedAt: archivo.uploadedAt || archivo.createdAt,
      uploadedBy: archivo.uploadedBy,
      idLoteAsociado: archivo.idLoteAsociado,
      ventaId: archivo.ventaId,
    };
  } catch (error) {
    console.error("Error subiendo archivo:", error);
    throw error;
  }
}

/**
 * Sustituye un archivo existente por uno nuevo (mismo tipo, mismo ventaId)
 * @param {number} fileId - ID del archivo a sustituir
 * @param {File} file - Nuevo archivo
 * @returns {Promise<Object>} Nuevo archivo creado
 */
export async function sustituirArchivo(fileId, file) {
  if (!fileId) throw new Error("Se requiere el ID del archivo");
  if (!file) throw new Error("Se requiere el archivo para sustituir");
  try {
    const formData = new FormData();
    formData.append("file", file);
    const { getAccessToken } = await import("../auth/token");
    const access = getAccessToken();
    const res = await fetch(`${getApiBase()}${PRIMARY}/${fileId}/sustituir`, {
      method: "POST",
      headers: { ...(access ? { Authorization: `Bearer ${access}` } : {}) },
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.message || "Error al sustituir archivo");
    }
    const archivo = data?.data || data?.archivo || data;
    return {
      id: archivo.id,
      filename: archivo.filename || archivo.nombreArchivo,
      url: archivo.url || archivo.linkArchivo,
      tipo: archivo.tipo,
      uploadedAt: archivo.uploadedAt || archivo.createdAt,
      uploadedBy: archivo.uploadedBy,
      idLoteAsociado: archivo.idLoteAsociado,
      ventaId: archivo.ventaId,
    };
  } catch (error) {
    console.error("Error sustituyendo archivo:", error);
    throw error;
  }
}

export async function deleteArchivo(id) {
  try {
    const res = await http(`${PRIMARY}/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || "Error al eliminar archivo");
    return true;
  } catch (error) {
    console.error("Error eliminando archivo:", error);
    throw error;
  }
}

export async function restoreArchivo(id) {
  try {
    const res = await http(`${PRIMARY}/${id}/restore`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || "Error al restaurar archivo");
    return data?.data || data;
  } catch (error) {
    console.error("Error restaurando archivo:", error);
    throw error;
  }
}

export async function purgeArchivo(id) {
  try {
    const res = await http(`${PRIMARY}/${id}/purge`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.message || "Error al purgar archivo");
    }
    return true;
  } catch (error) {
    console.error("Error purgando archivo:", error);
    throw error;
  }
}

/**
 * Actualiza la aprobación (Comisión o Municipio) de un archivo tipo PLANO
 * @param {number} fileId - ID del archivo
 * @param {{ target: 'COMISION'|'MUNICIPIO', estado: 'PENDIENTE'|'APROBADO'|'RECHAZADO', observacion?: string }} body
 * @returns {Promise<Object>} Archivo actualizado
 */
export async function actualizarAprobacion(fileId, { target, estado, observacion }) {
  if (!fileId) throw new Error("Se requiere el ID del archivo");
  try {
    const res = await http(`${PRIMARY}/${fileId}/aprobaciones`, {
      method: "PATCH",
      body: { target, estado, observacion },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || "Error al actualizar aprobación");
    const archivo = data?.data || data;
    return mapArchivo(archivo);
  } catch (error) {
    console.error("Error actualizando aprobación:", error);
    throw error;
  }
}

/**
 * Obtiene la URL firmada (signed URL) de un archivo usando su ID
 * @param {number|string} fileId - ID del archivo
 * @returns {Promise<string|null>} URL firmada o null si hay error
 */
export async function getFileSignedUrl(fileId) {
  if (!fileId) return null;
  try {
    const { getAccessToken } = await import('../auth/token');
    const access = getAccessToken();
    const urlRes = await fetch(`${getApiBase()}${PRIMARY}/${fileId}/url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
      },
      body: JSON.stringify({}),
    });
    const urlData = await urlRes.json().catch(() => ({}));
    if (!urlRes.ok) return null;
    return urlData?.signedURL || urlData?.signedUrl || null;
  } catch (error) {
    return null;
  }
}