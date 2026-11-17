// src/lib/api/lotes.js
// Cliente de API para LOTES. Devuelve SIEMPRE { data: Array<LoteUI> }.

import { http } from "../http/http"; // usa Authorization y maneja 401

const PRIMARY = "/lotes";

const ok = (data) => ({ data });

const numOrNull = (v) => (v === "" || v == null ? null : Number(v));
const strOrNull = (v) => {
  if (v == null) return null;
  const str = String(v).trim();
  return str.length ? str : null;
};

const parseId = (raw) => {
  if (raw === null || raw === undefined || raw === "") return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : String(raw).trim();
};

const deriveMapId = (row = {}) => {
  const candidate =
    row.mapId ??
    row.codigo ??
    row.code ??
    row.identificador ??
    (row.manzana != null || row.numero != null
      ? `L${row.manzana ?? "?"}-${row.numero ?? "?"}`
      : null);
  return strOrNull(candidate);
};

// --------------------------- MAPEO BACK -> UI ---------------------------
function fromApi(x = {}) {
  const id = parseId(x.id ?? x.loteId ?? x.Id);
  const mapId = deriveMapId(x);
  const status = x.status ?? x.estado ?? null;
  const subStatus = x.subStatus ?? x.subestado ?? x.subEstado ?? x.estadoPlano ?? null;
  const owner =
    x.owner ??
    x.propietario?.nombre ??
    x.propietarioId ??
    null;
  const location =
    x.location ??
    (x.manzana != null || x.numero != null
      ? `Mz ${x.manzana ?? "?"} - Lt ${x.numero ?? "?"}`
      : null);

  // Promoción activa (primera de promociones activas)
  const promocionActiva = Array.isArray(x.promociones) && x.promociones.length > 0 
    ? x.promociones[0] 
    : null;

  return {
    ...x,
    id,
    mapId: mapId ?? x.mapId ?? null,
    status,            // ⇐ ojo: mantenemos status/ subStatus además de los campos originales
    subStatus,
    estado: x.estado ?? null,
    subestado: x.subestado ?? null,
    tipo: x.tipo ?? null,
    owner,
    location,
    superficie: numOrNull(x.superficie ?? x.superficieM2 ?? x.surface),
    price: numOrNull(x.price ?? x.precio),
    precio: numOrNull(x.precio ?? x.price),
    deuda: x.deuda ?? null,
    descripcion: x.descripcion ?? null,
    ubicacion: x.ubicacion ?? null,
    fraccion: x.fraccion ?? null,
    inquilino: x.inquilino ?? null,
    numPartido: x.numPartido ?? null,
    promocionActiva,
  };
}

// ------------------------------ QUERYSTRING ------------------------------
function qs(params = {}) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  }
  const str = s.toString();
  return str ? `?${str}` : "";
}


/* ================================ API REAL ================================ */
function pickArrayFromApi(json) {
  // Soporta:
  // - []                           (ya array)
  // - { data: [] }                 (array en data)
  // - { rows: [] }                 (array en rows)
  // - { data: { lotes: [] } }      (tu backend actual)
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.rows)) return json.rows;
  if (Array.isArray(json?.data?.lotes)) return json.data.lotes;
  return [];
}

async function apiGetAll(params = {}) {
  const res  = await http(`${PRIMARY}${qs(params)}`, { method: "GET" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || "Error al cargar lotes");

  const rawList = pickArrayFromApi(json);
  const list = rawList.map(fromApi);
  return ok(list); // ← SIEMPRE { data: Array }
}

async function apiGetById(id) {
  const res  = await http(`${PRIMARY}/${id}`, { method: "GET" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || "Error al obtener lote");
  const row = json?.data ?? json;
  return ok(fromApi(row));
}

async function apiCreate(payload) {
  const res  = await http(PRIMARY, { method: "POST", body: payload });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(json?.message || "Error al crear lote");
    error.statusCode = res.status;
    error.response = { status: res.status };
    throw error;
  }
  const row = json?.data ?? json;
  return ok(fromApi(row));
}

async function apiUpdate(id, payload) {
  const res  = await http(`${PRIMARY}/${id}`, { method: "PUT", body: payload });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || "Error al actualizar lote");
  const row = json?.data ?? json;
  return ok(fromApi(row));
}

async function apiDelete(id) {
  const res = await http(`${PRIMARY}/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.message || "Error al eliminar lote");
  }
  return ok(true);
}

// ===================
// Promociones
// ===================

async function apiAplicarPromocion(loteId, payload) {
  // http() ya hace JSON.stringify del body, no hacerlo aquí
  const res = await http(`${PRIMARY}/${loteId}/promociones/aplicar`, {
    method: "POST",
    body: payload, // Objeto, no string - http() lo serializa
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(json?.message || "Error al aplicar promoción");
    error.statusCode = res.status;
    error.response = { data: json, status: res.status };
    throw error;
  }
  return ok(json?.data ?? json);
}

async function apiQuitarPromocion(loteId) {
  const res = await http(`${PRIMARY}/${loteId}/promociones/quitar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(json?.message || "Error al quitar promoción");
    error.statusCode = res.status;
    error.response = { status: res.status };
    throw error;
  }
  return ok(json?.data ?? json);
}

async function apiGetPromocionActiva(loteId) {
  const res = await http(`${PRIMARY}/${loteId}/promociones/activa`, {
    method: "GET",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || "Error al obtener promoción activa");
  return ok(json?.data ?? json);
}

/* ------------------------------ EXPORTS ------------------------------ */
export const getAllLotes = apiGetAll;
export const getLoteById = apiGetById;
export const createLote = apiCreate;
export const updateLote = apiUpdate;
export const deleteLote = apiDelete;

// ===================
// Promociones
// ===================
export async function aplicarPromocion(loteId, payload) {
  try {
    return await apiAplicarPromocion(loteId, payload);
  } catch (error) {
    console.error(`Error al aplicar promoción al lote ${loteId}:`, error);
    throw error;
  }
}

export async function quitarPromocion(loteId) {
  try {
    return await apiQuitarPromocion(loteId);
  } catch (error) {
    console.error(`Error al quitar promoción del lote ${loteId}:`, error);
    throw error;
  }
}

export async function getPromocionActiva(loteId) {
  try {
    return await apiGetPromocionActiva(loteId);
  } catch (error) {
    console.error(`Error al obtener promoción activa del lote ${loteId}:`, error);
    throw error;
  }
}
