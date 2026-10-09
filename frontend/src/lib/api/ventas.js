import { http, normalizeApiListResponse } from "../http/http";

const PRIMARY = "/ventas";
const FALLBACK = "/Ventas";

const ok = (data) => ({ data });

const toNumberOrNull = (v) => (v === "" || v == null ? null : Number(v));

const fromApi = (row = {}) => {
  const lotId =
    row.lotId ?? row.loteId ?? row.lote_id ?? row.lote ?? row.lot ?? null;
  const lotMapId =
    row.lote?.mapId ??
    row.lotMapId ??
    row.mapId ??
    (typeof row.codigo === "string" ? row.codigo : null);

  const ensureLote = () => {
    if (row.lote) {
      return {
        ...row.lote,
        mapId: row.lote.mapId ?? lotMapId ?? null,
      };
    }
    if (lotId != null && lotMapId != null) {
      return {
        id: lotId,
        mapId: lotMapId,
      };
    }
    return row.lote ?? null;
  };

  return {
    id: row.id ?? row.ventaId ?? row.Id,
    numero: row.numero ?? row.numeroVenta ?? row.numero_publico ?? null,
    lotId,
    lotMapId: lotMapId ?? null,
    lote: ensureLote(),
    monto: row.monto != null ? (typeof row.monto === "number" ? row.monto : Number(row.monto)) : (row.amount != null ? Number(row.amount) : null),
    fechaVenta: row.fechaVenta ?? row.date ?? row.fecha ?? null,
    estado: row.estado ?? row.status ?? null,
    estadoCobro: row.estadoCobro ?? null,
    tipoPago: row.tipoPago ?? row.paymentType ?? null,
    plazoEscritura: row.plazoEscritura ?? row.plazo_escritura ?? null,
    fechaBaja: row.fechaBaja ?? row.fecha_baja ?? null,
    fechaEscrituraReal: row.fechaEscrituraReal ?? null,
    fechaCancelacion: row.fechaCancelacion ?? null,
    motivoCancelacion: row.motivoCancelacion ?? null,
    date: row.fechaVenta ?? row.date ?? row.fecha ?? null,
    status: row.estado ?? row.status ?? null,
    amount: row.monto != null ? (typeof row.monto === "number" ? row.monto : Number(row.monto)) : (row.amount != null ? Number(row.amount) : null),
    paymentType: row.tipoPago ?? row.paymentType ?? null,
    buyerId: row.buyerId ?? row.compradorId ?? null,
    compradorId: row.compradorId ?? row.buyerId ?? null,
    // vc.persona ?? vc soporta tanto relación explícita (VentaComprador) como implícita (Persona[])
    compradores: (row.compradores ?? []).map(vc => vc.persona ?? vc).filter(Boolean),
    inmobiliariaId: row.inmobiliariaId ?? row.inmobiliaria_id ?? null,
    reservaId: row.reservaId ?? row.reserva_id ?? null,
    observaciones: row.observaciones ?? row.notas ?? "",
    estadoOperativo: row.estadoOperativo ?? (() => {
      const estadoStr = String(row.estado ?? "").toUpperCase().trim();
      if (estadoStr === "OPERATIVO" || estadoStr === "ELIMINADO") {
        return estadoStr;
      }
      return "OPERATIVO";
    })(),
    createdAt: row.createdAt ?? row.fechaCreacion ?? null,
    updatedAt: row.updatedAt ?? row.updateAt ?? row.fechaActualizacion ?? null,
    // Submódulo pagos / tabla: el back incluye plan vigente y conteos; sin esto siempre cae "Sin plan"
    planPagos: Array.isArray(row.planPagos) ? row.planPagos : [],
    _count: row._count && typeof row._count === "object" ? row._count : undefined,
    // Relaciones que el backend ya incluye en listado y detalle (VENTA_INCLUDE); se conservan
    // solo si existen para que el listado sirva de fallback completo (p. ej. VentaVerCard).
    ...(row.comprador ? { comprador: row.comprador } : {}),
    ...(row.inmobiliaria && typeof row.inmobiliaria === "object" ? { inmobiliaria: row.inmobiliaria } : {}),
  };
};

const toApi = (form = {}) => ({
  loteId: form.lotId != null ? String(form.lotId).trim() : undefined,
  fechaVenta: form.date || form.fechaVenta || null,
  estado: form.status || "Registrada",
  monto: toNumberOrNull(form.amount),
  tipoPago: form.paymentType || form.tipoPago || null,
  compradorId: form.buyerId ?? form.compradorId ?? null,
  inmobiliariaId: form.inmobiliariaId ?? null,
  reservaId: form.reservaId ?? null,
  observaciones: (form.observaciones ?? "").trim() || null,
});

function qs(params = {}) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  }
  const str = s.toString();
  return str ? `?${str}` : "";
}

async function fetchWithFallback(path, options) {
  let res = await http(path, options);
  if (res.status === 404) {
    const alt = path.startsWith(PRIMARY) ? path.replace(PRIMARY, FALLBACK) : path.replace(FALLBACK, PRIMARY);
    res = await http(alt, options);
  }
  return res;
}

async function apiGetAll(params = {}) {
  const res = await fetchWithFallback(`${PRIMARY}${qs(params)}`, { method: "GET" });
  let data;
  let invalidJson = false;
  try {
    data = await res.json();
  } catch {
    invalidJson = true;
    data = {};
  }
  if (!res.ok) {
    const error = new Error(data?.message || "Error al cargar ventas");
    error.status = res.status;
    throw error;
  }
  // Un 2xx con body que no es JSON válido no equivale a "no hay ventas".
  if (invalidJson) {
    const error = new Error("Respuesta inválida del servidor al cargar ventas");
    error.status = res.status;
    throw error;
  }

  const arr = normalizeApiListResponse(data);
  const meta = data?.meta ?? { total: Number(data?.meta?.total ?? arr.length) || arr.length, page: Number(params.page || 1), pageSize: Number(params.pageSize || arr.length) };
  return { data: arr.map(fromApi), meta };
}

// Ventas OPERATIVAS de un lote. El filtro lo hace el backend (GET /ventas?loteId=X).
async function apiGetByLoteId(loteId) {
  const id = Number(loteId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Lote inválido para buscar ventas");
  }
  const { data } = await apiGetAll({ loteId: id, estadoOperativo: "OPERATIVO" });
  return data;
}

// Venta "asociada" a un lote: entre las OPERATIVAS del lote, se excluyen las CANCELADAS
// y se toma la de mayor id (la más reciente). Retorna null si no hay ninguna.
// No pide el detalle: VentaVerCard hace GET /ventas/:id al abrirse.
async function apiGetVentaAsociadaByLoteId(loteId) {
  const ventas = await apiGetByLoteId(loteId);
  let asociada = null;
  for (const v of ventas) {
    if (String(v.estado ?? "").toUpperCase() === "CANCELADA") continue;
    if (asociada == null || Number(v.id) > Number(asociada.id)) asociada = v;
  }
  return asociada;
}

async function apiGetById(id) {
  const res = await fetchWithFallback(`${PRIMARY}/${id}`, { method: "GET" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || "Error al obtener la venta");
  
  const raw = data?.data ?? data;
  const base = fromApi(raw);
  
  return ok({
    ...base,
    comprador: raw?.comprador || base?.comprador || null,
    compradores: base.compradores?.length ? base.compradores : (raw?.compradores ?? []).map(vc => vc.persona ?? vc).filter(Boolean),
    lote: raw?.lote
      ? { ...raw.lote, mapId: raw.lote.mapId ?? base.lotMapId ?? null }
      : base.lote || null,
    inmobiliaria: raw?.inmobiliaria || base?.inmobiliaria || null,
    reserva: raw?.reserva || null,
    planPagos: Array.isArray(raw?.planPagos) ? raw.planPagos : base.planPagos ?? [],
    _count: raw?._count ?? base._count,
  });
}

async function apiGetByInmobiliaria(inmobiliariaId, params = {}) {
  const res = await fetchWithFallback(
    `${PRIMARY}/inmobiliaria/${inmobiliariaId}${qs(params)}`,
    { method: "GET" }
  );
  const data = await res.json().catch(() => ({}));

  if (res.status === 404) {
    return {
      data: [],
      meta: {
        total: 0,
        page: Number(params.page || 1),
        pageSize: Number(params.pageSize || 0),
      },
      message: data?.message,
    };
  }

  if (!res.ok) {
    throw new Error(
      data?.message || "Error al cargar ventas de la inmobiliaria"
    );
  }

  const arr = normalizeApiListResponse(data);
  const mapped = arr.map(fromApi);

  return {
    data: mapped,
    meta: {
      total: Number(data?.total ?? mapped.length) || mapped.length,
      page: Number(params.page || 1),
      pageSize: Number(params.pageSize || mapped.length),
    },
  };
}

async function apiCreate(payload) {
  const res = await fetchWithFallback(PRIMARY, { method: "POST", body: payload });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    let errorMsg = data?.message || "Error al crear la venta";
    
    if (data?.errors && Array.isArray(data.errors) && data.errors.length > 0) {
      const mensajes = data.errors.map((err) => {
        if (typeof err === 'string') return err;
        const campo = err.path?.[0] || '';
        const msg = err.message || '';
        if (msg.includes('expected string, received null')) {
          return `${campo || 'Campo'}: no puede estar vacío`;
        }
        if (msg.includes('expected number')) {
          return `${campo || 'Campo'}: debe ser un número válido`;
        }
        return msg || 'Error de validación';
      });
      errorMsg = mensajes.join(", ");
    } else if (data?.error) {
      errorMsg = data.error;
    }
    
    const error = new Error(errorMsg);
    error.response = { data };
    throw error;
  }
  return ok(fromApi(data?.data ?? data));
}

async function apiUpdate(id, payload) {
  const body = {};

  if (payload.loteId != null) body.loteId = payload.loteId;
  if (payload.fechaVenta != null) body.fechaVenta = payload.fechaVenta;
  if (payload.monto != null) body.monto = payload.monto;
  if (payload.estado != null) body.estado = payload.estado;
  if (payload.estadoCobro != null) body.estadoCobro = payload.estadoCobro;
  if (payload.plazoEscritura != null) body.plazoEscritura = payload.plazoEscritura;
  if (payload.tipoPago != null) body.tipoPago = payload.tipoPago;
  if (payload.numero != null) body.numero = payload.numero;
  if (payload.compradorId != null) body.compradorId = payload.compradorId;
  if (payload.compradores != null && Array.isArray(payload.compradores)) {
    body.compradores = payload.compradores.map(c =>
      typeof c === 'object' && c.personaId != null ? { personaId: c.personaId } : { personaId: c.id ?? c }
    );
  }
  if (payload.inmobiliariaId != null) body.inmobiliariaId = payload.inmobiliariaId;
  if (payload.reservaId != null) body.reservaId = payload.reservaId;
  if (payload.fechaEscrituraReal != null) body.fechaEscrituraReal = payload.fechaEscrituraReal;
  if (payload.fechaCancelacion != null) body.fechaCancelacion = payload.fechaCancelacion;
  if (payload.motivoCancelacion != null) body.motivoCancelacion = payload.motivoCancelacion;
  
  const res = await fetchWithFallback(`${PRIMARY}/${id}`, { method: "PUT", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || "Error al actualizar la venta");
  }
  
  const raw = data?.data ?? data;
  const base = fromApi(raw);
  
  return ok({
    ...base,
    comprador: raw?.comprador || base?.comprador || null,
    compradores: base.compradores?.length ? base.compradores : (raw?.compradores ?? []).map(vc => vc.persona ?? vc).filter(Boolean),
    lote: raw?.lote
      ? { ...raw.lote, mapId: raw.lote.mapId ?? base.lotMapId ?? null }
      : base.lote || null,
    inmobiliaria: raw?.inmobiliaria || base?.inmobiliaria || null,
    reserva: raw?.reserva || null,
    planPagos: Array.isArray(raw?.planPagos) ? raw.planPagos : base.planPagos ?? [],
    _count: raw?._count ?? base._count,
  });
}

async function apiDelete(id) {
  const res = await fetchWithFallback(`${PRIMARY}/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Error al eliminar la venta");
  }
  return ok(true);
}

async function apiDesactivar(id) {
  const res = await fetchWithFallback(`${PRIMARY}/${id}/eliminar`, { method: "PATCH" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || "Error al eliminar venta");
  return ok(fromApi(data?.data ?? data));
}

async function apiReactivar(id) {
  const res = await fetchWithFallback(`${PRIMARY}/${id}/reactivar`, { method: "PATCH" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || "Error al reactivar venta");
  return ok(fromApi(data?.data ?? data));
}

function getApiBase() {
  const RAW_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || "";
  const FORCE_ABS = import.meta.env.VITE_API_FORCE_ABSOLUTE === "true";
  const isLocalAbs = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(RAW_BASE);
  return (import.meta.env.DEV && isLocalAbs && !FORCE_ABS) ? "/api" : (RAW_BASE || "/api");
}

async function apiRegistrarBoleto(ventaId, file) {
  const formData = new FormData();
  formData.append("file", file);
  const { getAccessToken } = await import("../auth/token");
  const access = getAccessToken();
  const res = await fetch(`${getApiBase()}${PRIMARY}/${ventaId}/registrar-boleto`, {
    method: "POST",
    headers: { ...(access ? { Authorization: `Bearer ${access}` } : {}) },
    credentials: "include",
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || "Error al registrar boleto");
  }
  const raw = data?.data ?? data;
  return ok({
    archivo: raw?.archivo ?? null,
    venta: raw?.venta ? fromApi(raw.venta) : null,
  });
}

async function apiRegistrarEscritura(ventaId, file, fechaEscritura) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("fechaEscritura", typeof fechaEscritura === "string" ? fechaEscritura : fechaEscritura?.toISOString?.() ?? String(fechaEscritura));
  const { getAccessToken } = await import("../auth/token");
  const access = getAccessToken();
  const res = await fetch(`${getApiBase()}${PRIMARY}/${ventaId}/registrar-escritura`, {
    method: "POST",
    headers: { ...(access ? { Authorization: `Bearer ${access}` } : {}) },
    credentials: "include",
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || "Error al registrar escritura");
  }
  const raw = data?.data ?? data;
  return ok({
    archivo: raw?.archivo ?? null,
    venta: raw?.venta ? fromApi(raw.venta) : null,
  });
}

export const getAllVentas = apiGetAll;
export const getVentaById = apiGetById;
export const getVentasByLoteId = apiGetByLoteId;
export const getVentaAsociadaByLoteId = apiGetVentaAsociadaByLoteId;
export const createVenta = apiCreate;
export const updateVenta = apiUpdate;
export const deleteVenta = apiDelete;
export const desactivarVenta = apiDesactivar;
export const reactivarVenta = apiReactivar;
export const getVentasByInmobiliaria = apiGetByInmobiliaria;
export const registrarBoleto = apiRegistrarBoleto;
export const registrarEscritura = apiRegistrarEscritura;
