// src/lib/api/reservas.js
// API adapter para reservas
 
import { http, httpJson } from "../http/http";

// ===== NORMALIZADORES =====
const fromApi = (row = {}) => {
  const loteId =
    row.loteId ?? row.lote?.id ?? row.lote?.idLote ?? row.lotId ?? null;
  const lotMapId =
    row.lote?.mapId ??
    row.lotMapId ??
    row.mapId ??
    (row.lote?.codigo ?? row.codigo ?? null);

  const buildLoteInfo = () => {
    if (row.lote) {
      return {
        fraccion: row.lote.fraccion ?? row.lote.numero ?? "",
        calle: row.lote.ubicacion?.calle ?? row.lote.calle ?? "",
        numero: row.lote.ubicacion?.numero ?? row.lote.numero ?? "",
        estado: row.lote.estado ?? "",
        precio: row.lote.precio ?? row.lote.valor ?? 0,
        mapId: row.lote.mapId ?? lotMapId ?? null,
      };
    }
    return {
      fraccion: lotMapId ?? `Lote ID: ${row.loteId || "N/A"}`,
      calle: "",
      numero: "",
      estado: "",
      precio: 0,
      mapId: lotMapId ?? null,
    };
  };

  return {
    id: row.id ?? row.idReserva ?? row.reservaId ?? row.Id,
    numero: row.numero ?? row.numeroReserva ?? row.numero_publico ?? null, // Dejamos de usar el ID interno como número visible de reserva. A partir de ahora usamos reserva.numero como identificador de negocio, igual que hacemos con venta.numero en el módulo de ventas.
    loteId,
    lotMapId: lotMapId ?? null,
    lote: row.lote
      ? { ...row.lote, mapId: row.lote.mapId ?? lotMapId ?? null }
      : row.lote ?? null,
    clienteId:
      row.clienteId ?? row.cliente?.id ?? row.cliente?.idPersona ?? row.clienteId,
    clienteNombre: row.cliente?.nombre ?? row.clienteNombre ?? "",
    clienteApellido: row.cliente?.apellido ?? row.clienteApellido ?? "",
    clienteCompleto:
      row.cliente?.nombreCompleto ||
      row.cliente?.razonSocial ||
      `${row.cliente?.nombre || ""} ${row.cliente?.apellido || ""}`.trim() ||
      `${row.clienteNombre || ""} ${row.clienteApellido || ""}`.trim() ||
      `Cliente ID: ${row.clienteId || "N/A"}`,
    fechaReserva: row.fechaReserva ?? row.fecha ?? row.createdAt,
    seña: row.seña ?? row.sena ?? row.signal ?? row.amount,
    estado: row.estado ?? null, // Preservar estado para el badge
    fechaFinReserva: row.fechaFinReserva ?? row.fecha_fin_reserva ?? null,
    inmobiliariaId:
      row.inmobiliariaId ?? row.inmobiliaria?.id ?? row.inmobiliaria?.idInmobiliaria,
    inmobiliariaNombre:
      row.inmobiliaria?.nombre ??
      row.inmobiliariaNombre ??
      "La Federala",
    loteInfo: buildLoteInfo(),
    // Estado operativo: leer directamente del backend, default OPERATIVO
    estadoOperativo: (() => {
      // Prioridad: usar estadoOperativo del backend si existe
      if (row.estadoOperativo != null) {
        const opStr = String(row.estadoOperativo).toUpperCase().trim();
        return opStr === "ELIMINADO" ? "ELIMINADO" : "OPERATIVO";
      }
      // Fallback: derivar de estado solo si es OPERATIVO/ELIMINADO (compatibilidad)
      const estadoStr = String(row.estado ?? "").toUpperCase().trim();
      if (estadoStr === "OPERATIVO" || estadoStr === "ELIMINADO") {
        return estadoStr;
      }
      return "OPERATIVO";
    })(),
    createdAt: row.createdAt ?? row.created_at ?? new Date().toISOString(),
    updateAt: row.updateAt ?? row.updated_at ?? row.updatedAt,
  };
};

const toApi = (data = {}) => ({
  loteId: data.loteId,
  clienteId: data.clienteId,
  fechaReserva: data.fechaReserva,
  sena: data.sena ?? data.seña ?? null,
  inmobiliariaId: data.inmobiliariaId ?? null,
  numero: data.numero, // Número de reserva editable por el usuario. Usamos reserva.numero como identificador de negocio y mostramos el input arriba a la derecha. El placeholder sugiere el formato RES-AAAA-NN, pero no lo forzamos.
  // estado no se envía en create, se asigna automáticamente como ACTIVA en el backend
  fechaFinReserva: data.fechaFinReserva,
  ofertaInicial: data.ofertaInicial,
});

// ===== FUNCIONES DE API =====
export const getAllReservas = async (params = {}) => {
  try {
    // Construir query string
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        queryParams.append(key, value);
      }
    });
    
    const queryString = queryParams.toString();
    const url = `/reservas${queryString ? `?${queryString}` : ''}`;
    
    const response = await http(url, {
      method: 'GET'
    });
    
    // Si response es un objeto Response de fetch, necesitamos parsear el JSON
    let data;
    let invalidJson = false;
    if (response && typeof response === 'object' && response.json) {
      // Es un objeto Response de fetch
      try {
        data = await response.json();
      } catch {
        invalidJson = true;
        data = {};
      }
    } else {
      // Ya son los datos parseados
      data = response;
    }

    // Una respuesta no-2xx (400 de validación, 403, 500) no es una lista válida:
    // su body puede traer arrays como `errors` que no deben leerse como reservas.
    if (response && typeof response.ok === 'boolean' && !response.ok) {
      const error = new Error(data?.message || data?.error || 'Error al obtener reservas');
      error.status = response.status;
      throw error;
    }

    // Un 2xx con body que no es JSON válido tampoco es una lista válida (no se asume lista vacía).
    if (invalidJson) {
      const error = new Error('Respuesta inválida del servidor al obtener reservas');
      error.status = response.status;
      throw error;
    }

    // Manejar diferentes estructuras de respuesta
    let reservasData = [];
    let total = 0;

    if (data && typeof data === 'object') {
      // Si data tiene una propiedad data
      if (data.data !== undefined) {
        if (Array.isArray(data.data)) {
          reservasData = data.data;
          total = data.data.length;
        } else if (data.data.reservas && Array.isArray(data.data.reservas)) {
          reservasData = data.data.reservas;
          total = data.data.reservas.length;
        }
      }
      // Si data tiene una propiedad reservas
      else if (data.reservas && Array.isArray(data.reservas)) {
        reservasData = data.reservas;
        total = data.reservas.length;
      }
      // Si data es directamente un array
      else if (Array.isArray(data)) {
        reservasData = data;
        total = data.length;
      }
      // Si data tiene propiedades pero no las esperadas, buscar arrays anidados
      else {
        const possibleArrays = Object.values(data).filter(val => Array.isArray(val));
        if (possibleArrays.length > 0) {
          reservasData = possibleArrays[0];
          total = possibleArrays[0].length;
        }
      }
    }

    return {
      success: true,
      data: reservasData,
      total: total,
      message: response.message || 'Reservas obtenidas correctamente'
    };
  } catch (error) {
    console.error('❌ Error obteniendo reservas:', error);
    return {
      success: false,
      data: [],
      total: 0,
      status: error.status,
      message: error.message || 'Error al obtener reservas'
    };
  }
};

// Normaliza una reserva del backend al shape de detalle (el que consumen las cards).
// El listado y el detalle traen el mismo include, así que sirve para ambos.
const normalizeReservaDetail = (raw) => {
    const base = fromApi(raw);
    // Normalizar manteniendo relaciones y fechas
    return {
      ...base,
      // Preservar relaciones completas del backend (si vienen)
      cliente: raw?.cliente
        ? raw.cliente
        : base?.clienteNombre
        ? {
            id: raw?.clienteId ?? base.clienteId,
            nombre: base.clienteNombre,
            apellido: base.clienteApellido,
          }
        : null,
      inmobiliaria: raw?.inmobiliaria
        ? raw.inmobiliaria
        : raw?.inmobiliariaId
        ? {
            id: raw.inmobiliariaId,
            nombre: raw?.inmobiliaria?.nombre ?? base.inmobiliariaNombre,
          }
        : null,
      lote: raw?.lote
        ? { ...raw.lote, mapId: raw.lote.mapId ?? base.lotMapId ?? null }
        : base.lote ||
          (raw?.loteId
            ? { id: raw.loteId, mapId: base.lotMapId ?? null }
            : null),
      // Mapear fechas correctamente
      createdAt: raw?.createdAt ?? base.createdAt ?? null,
      updatedAt: raw?.updatedAt ?? raw?.updateAt ?? base.updateAt ?? null,
      // Preservar también fechaReserva
      fechaReserva: raw?.fechaReserva ?? base.fechaReserva ?? null,
      // Preservar estado
      estado: raw?.estado ?? base.estado ?? null,
      // Preservar seña/sena
      seña: raw?.sena ?? raw?.seña ?? base.seña ?? null,
    };
};

export const getReservaById = async (id) => {
  try {
    // Usar httpJson que maneja el parsing de manera segura y consistente
    const response = await httpJson(`/reservas/${id}`, {
      method: 'GET'
    });

    // El backend devuelve { success: true, data: {...} }
    // Extraer la reserva de response.data (que es lo que envía el controller)
    const raw = response?.data ?? response?.reserva ?? response;

    return {
      success: true,
      data: normalizeReservaDetail(raw),
      message: response.message || 'Reserva obtenida correctamente'
    };
  } catch (error) {
    console.error('❌ Error obteniendo reserva:', error);
    throw new Error(error?.message || 'Error al obtener reserva');
  }
};

// Alias para compatibilidad
export const getReserva = getReservaById;

// Reserva "asociada" a un lote: ACTIVA y OPERATIVA (mismo criterio que usaban las pantallas).
// El filtro lo hace el backend; la fila ya trae el include del detalle, no hace falta GET /reservas/:id.
// Retorna la reserva normalizada como getReservaById, o null si el lote no tiene reserva activa visible.
export const getReservaActivaByLoteId = async (loteId) => {
  const id = Number(loteId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('Lote inválido para buscar la reserva');
  }

  const result = await getAllReservas({
    loteId: id,
    estado: 'ACTIVA',
    estadoOperativo: 'OPERATIVO',
  });

  if (!result.success) {
    const error = new Error(result.message || 'Error al obtener la reserva del lote');
    error.status = result.status;
    throw error;
  }

  const row = Array.isArray(result.data) ? result.data[0] : null;
  return row ? normalizeReservaDetail(row) : null;
};

export const createReserva = async (data) => {
  try {
    const body = toApi(data);
    const response = await http('/reservas', {
      method: 'POST',
      body: body
    });

    // Parsear respuesta JSON de manera segura
    const resData = await response.json().catch(() => ({}));
    
    if (!response.ok) {
      const errorMsg = resData?.message || resData?.errors?.[0]?.message || "Error al crear reserva";
      throw new Error(errorMsg);
    }

    const raw = resData?.data ?? resData?.reserva ?? resData;
    
    return {
      success: true,
      data: raw,
      message: resData?.message || 'Reserva creada correctamente'
    };
  } catch (error) {
    console.error('❌ Error creando reserva:', error);
    throw error; // Lanzar error para que el componente lo maneje
  }
};

export const updateReserva = async (id, payload) => {
  // El payload ya viene con los campos correctos del componente (fechaReserva, estado, sena, inmobiliariaId)
  // Enviar directamente los campos que espera el backend según la validación
  const body = {};
  
  // Mapear campos que pueden venir (todos opcionales para PATCH)
  // IMPORTANTE: Solo incluir campos que realmente han cambiado
  if (payload.fechaReserva !== undefined && payload.fechaReserva !== null) {
    body.fechaReserva = payload.fechaReserva;
  }
  if (payload.fechaFinReserva !== undefined && payload.fechaFinReserva !== null) {
    body.fechaFinReserva = payload.fechaFinReserva;
  }
  if (payload.estado !== undefined && payload.estado !== null && payload.estado !== "") {
    body.estado = payload.estado;
  }
  // Para sena, enviar incluso si es null (para eliminar la seña)
  if (payload.sena !== undefined) {
    if (payload.sena === null) {
      body.sena = null;
    } else if (payload.sena !== null) {
      const num = typeof payload.sena === 'number' ? payload.sena : Number(payload.sena);
      if (Number.isFinite(num) && num >= 0) {
        body.sena = num;
      }
    }
  } else if (payload.seña !== undefined) {
    if (payload.seña === null) {
      body.sena = null;
    } else if (payload.seña !== null) {
      const num = typeof payload.seña === 'number' ? payload.seña : Number(payload.seña);
      if (Number.isFinite(num) && num >= 0) {
        body.sena = num;
      }
    }
  }
  // Para inmobiliariaId, enviar incluso si es null (para desasociar)
  if (payload.inmobiliariaId !== undefined) {
    body.inmobiliariaId = payload.inmobiliariaId || null;
  }
  // Para numero, enviar si está presente
  if (payload.numero !== undefined && payload.numero !== null) {
    body.numero = String(payload.numero).trim();
  }
  // Cliente (FIX: Agregado handling de clienteId)
  if (payload.clienteId !== undefined) {
    body.clienteId = Number(payload.clienteId);
  }
  
  // Verificar que al menos hay un campo para actualizar
  if (Object.keys(body).length === 0) {
    throw new Error('Debes enviar al menos un campo para actualizar');
  }

  try {
    // Usar http que devuelve Response, luego parsear JSON de manera segura
    // Este patrón es el mismo que usan ventas.js e inmobiliarias.js para mantener seguridad
    // NOTA: http() ya hace JSON.stringify(body) internamente, no lo hagamos aquí
    const res = await http(`/reservas/${id}`, {
      method: 'PUT',
      body: body
    });
    
    // Parsear el JSON de manera segura con .catch() para evitar errores si no es JSON válido
    // Esto es seguro porque:
    // 1. El backend siempre devuelve JSON válido (o vacío si hay error)
    // 2. El .catch() previene excepciones si el JSON está malformado
    // 3. Validamos res.ok antes de usar los datos
    const data = await res.json().catch(() => ({}));
    
    if (!res.ok) {
      // Si hay error, extraer el mensaje de manera segura
      const errorMsg = data?.message || data?.errors?.[0]?.message || "Error al actualizar reserva";
      const error = new Error(errorMsg);
      error.status = res.status;
      error.errors = data?.errors;
      throw error;
    }

    // El backend devuelve { success: true, data: {...}, message: '...' }
    const raw = data?.data ?? data?.reserva ?? data;
    
    const base = fromApi(raw);
    const normalized = {
      ...base,
      cliente: raw?.cliente || base?.cliente || null,
      inmobiliaria: raw?.inmobiliaria || base?.inmobiliaria || null,
      lote: raw?.lote
        ? { ...raw.lote, mapId: raw.lote.mapId ?? base.lotMapId ?? null }
        : base.lote || null,
      createdAt: raw?.createdAt ?? base.createdAt ?? null,
      updatedAt: raw?.updatedAt ?? raw?.updateAt ?? base.updateAt ?? null,
      estado: raw?.estado ?? base.estado ?? null,
      numero: raw?.numero ?? base.numero ?? null,
    };

    return {
      success: true,
      data: normalized,
      message: data.message || 'Reserva actualizada correctamente'
    };
  } catch (error) {
    console.error('❌ Error actualizando reserva:', error);
    const errorMsg = error?.response?.data?.message || error?.message || 'Error al actualizar reserva';
    throw new Error(errorMsg);
  }
};

export const eliminarReserva = async (id) => {
  try {
    const response = await http(`/reservas/${id}/eliminar`, {
      method: 'PATCH'
    });
    
    // Parsear respuesta JSON de manera segura
    const resData = await response.json().catch(() => ({}));
    
    if (!response.ok) {
       const errorMsg = resData?.message || "Error al eliminar reserva";
       throw new Error(errorMsg);
    }

    const raw = resData?.data ?? resData?.reserva ?? resData;
    const normalized = fromApi(raw);

    return {
      success: true,
      data: normalized,
      message: resData.message || 'Reserva eliminada correctamente'
    };
  } catch (error) {
    console.error('❌ Error eliminando reserva:', error);
    throw error;
  }
};

// Alias para compatibilidad (deprecated, usar eliminarReserva)
export const desactivarReserva = eliminarReserva;

// deleteReserva ahora usa eliminarReserva (Soft Delete)
export const deleteReserva = eliminarReserva;

export const reactivarReserva = async (id) => {
    try {
        const response = await http(`/reservas/${id}/reactivar`, {
            method: 'PATCH'
        });

        const resData = await response.json().catch(() => ({}));

        if (!response.ok) {
             const errorMsg = resData?.message || "Error al reactivar reserva";
             throw new Error(errorMsg);
        }

        const raw = resData?.data ?? resData?.reserva ?? resData;
        const normalized = fromApi(raw);

        return {
            success: true,
            data: normalized,
            message: resData.message || 'Reserva reactivada correctamente'
        };
    } catch (error) {
        console.error('❌ Error reactivando reserva:', error);
        throw error;
    }
}


// ===== UTILIDADES =====
const mockFilterSortPage = (data, params = {}) => {
  let filtered = [...data];

  // Filtros
  if (params.q) {
    const query = params.q.toLowerCase();
    filtered = filtered.filter(r => 
      r.cliente?.nombreCompleto?.toLowerCase().includes(query) ||
      r.cliente?.nombre?.toLowerCase().includes(query) ||
      r.cliente?.apellido?.toLowerCase().includes(query) ||
      r.inmobiliaria?.nombre?.toLowerCase().includes(query) ||
      r.lote?.ubicacion?.calle?.toLowerCase().includes(query) ||
      String(r.lote?.ubicacion?.numero).includes(query) ||
      String(r.lote?.fraccion).includes(query)
    );
  }

  if (params.inmobiliaria) {
    filtered = filtered.filter(r => r.inmobiliariaId === parseInt(params.inmobiliaria));
  }

  if (params.fechaReserva?.min || params.fechaReserva?.max) {
    filtered = filtered.filter(r => {
      const fecha = new Date(r.fechaReserva);
      if (params.fechaReserva.min && fecha < new Date(params.fechaReserva.min)) return false;
      if (params.fechaReserva.max && fecha > new Date(params.fechaReserva.max)) return false;
      return true;
    });
  }

  if (params.fechaFinReserva?.min || params.fechaFinReserva?.max) {
    filtered = filtered.filter(r => {
      // Si la reserva no tiene fecha fin, la descartamos (o la mostramos, depende tu lógica. Aquí asumo estricto)
      if (!r.fechaFinReserva) return false; 
      
      const fecha = new Date(r.fechaFinReserva);
      // Validamos rango
      if (params.fechaFinReserva.min && fecha < new Date(params.fechaFinReserva.min)) return false;
      if (params.fechaFinReserva.max && fecha > new Date(params.fechaFinReserva.max)) return false;
      return true;
    });
  }

  if (params.seña?.min || params.seña?.max) {
    filtered = filtered.filter(r => {
      const sena = Number(r.seña);
      if (params.seña.min && sena < Number(params.seña.min)) return false;
      if (params.seña.max && sena > Number(params.seña.max)) return false;
      return true;
    });
  }

  // Ordenamiento
  if (params.sortBy) {
    filtered.sort((a, b) => {
      const aVal = a[params.sortBy];
      const bVal = b[params.sortBy];
      const direction = params.sortDir === 'desc' ? -1 : 1;
      
      if (aVal < bVal) return -1 * direction;
      if (aVal > bVal) return 1 * direction;
      return 0;
    });
  }

  // Paginación
  const page = parseInt(params.page) || 1;
  const pageSize = parseInt(params.pageSize) || 25;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  return {
    data: filtered.slice(start, end),
    total: filtered.length
  };
};

// ===== NORMALIZADOR DE RESPUESTA =====
// Usando la función normalizeApiListResponse importada desde http/http

// ===== FUNCIÓN LIST ESTÁNDAR =====
export const list = async (params = {}) => {
  const result = await getAllReservas(params);
  
  if (!result.success) {
    throw new Error(result.message || 'Error al obtener reservas');
  }

  return {
    data: result.data,
    meta: {
      total: result.total,
      page: params.page || 1,
      pageSize: params.pageSize || 25
    }
  };
};

// ===== OFERTAS (Negociación) =====

export const getOfertas = async (reservaId) => {
  try {
    const response = await httpJson(`/reservas/${reservaId}/ofertas`, { method: 'GET' });
    // response: { success: true, data: [...] }
    const raw = response.data || response;
    // Normalize logic if needed (dates etc)
    const normalized = Array.isArray(raw) ? raw.map(o => ({
        ...o,
        createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : null,
    })) : [];

    return { success: true, data: normalized };
  } catch (error) {
     console.error('❌ Error getting offers:', error);
     throw error;
  }
};

export const createOferta = async (reservaId, data) => {
    // data: { monto, motivo, action }
    try {
        const response = await httpJson(`/reservas/${reservaId}/ofertas`, {
            method: 'POST',
            body: data
        });
        return { success: true, data: response.data, message: response.message };
    } catch (error) {
        console.error('❌ Error creating offer:', error);
        throw error;
    }
};

export { fromApi, toApi };