// src/lib/api/inmobiliarias.js
// Adapter Inmobiliarias: desacopla UI del contrato del backend.
// - fromApi/toApi mapean español<->inglés según use el back.
// - list() siempre entrega { data, meta } para paginar igual en la UI.

import { http, normalizeApiListResponse } from "../http/http";

const PRIMARY = "/inmobiliarias";

const ok = (data) => ({ data });

// ---------- Mapeos ----------
const fromApi = (row = {}) => ({
  id: row.id ?? row.idInmobiliaria ?? row.inmobiliariaId ?? row.Id,
  nombre: row.nombre ?? row.name ?? "",
  razonSocial: row.razonSocial ?? row.razon_social ?? "",
  comxventa: row.comxventa ?? row.comision ?? null,
  contacto: row.contacto ?? row.phone ?? row.telefono ?? "",
  estado: row.estado ?? "OPERATIVO", // OPERATIVO o ELIMINADO
  fechaBaja: row.fechaBaja ?? row.fecha_baja ?? null,
  // Métricas - Totales (legacy + nuevos nombres)
  ventasTotales: row.ventasTotales ?? row.cantidadVentas ?? row.ventas_count ?? 0,
  reservasTotales: row.reservasTotales ?? row.cantidadReservas ?? row.reservas_count ?? row._count?.reservas ?? 0,
  prioridadesTotales: row.prioridadesTotales ?? 0,
  // Métricas - Activas
  ventasActivas: row.ventasActivas ?? 0,
  reservasActivas: row.reservasActivas ?? 0,
  prioridadesActivas: row.prioridadesActivas ?? 0,
  // Límite prioridades
  maxPrioridadesActivas: row.maxPrioridadesActivas ?? null,
  // Aliases legacy (para compatibilidad)
  cantidadVentas: row.ventasTotales ?? row.cantidadVentas ?? row.ventas_count ?? 0,
  cantidadReservas: row.reservasTotales ?? row.cantidadReservas ?? row.reservas_count ?? row._count?.reservas ?? 0,
  // Fechas
  createdAt: row.createdAt ?? row.created_at ?? null,
  updateAt: row.updateAt ?? row.updated_at ?? null,
});

const toApi = (form = {}) => {
  const payload = {
    // Enviamos en español según el schema de Prisma
    nombre: (form.nombre ?? "").trim(),
    razonSocial: (form.razonSocial ?? "").trim(),
    comxventa: form.comxventa ? Number(form.comxventa) : null,
    contacto: (form.contacto ?? "").trim(),
  };

  // Incluir estado si está presente (para baja lógica)
  if (form.estado !== undefined) {
    payload.estado = form.estado;
  }

  return payload;
};

// ---------- Utilitarios ----------
function qs(params = {}) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  }
  const str = s.toString();
  return str ? `?${str}` : "";
}


/* ------------------------------- API --------------------------------- */
async function apiGetAll(params = {}) {
  const res = await http(`${PRIMARY}${qs(params)}`, { method: "GET" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || "Error al cargar inmobiliarias");

  // Si data.data es un objeto, intentar extraer el array de inmobiliarias
  let inmobiliariasArray = [];
  if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
    // Buscar posibles claves que contengan el array
    if (data.data.inmobiliarias && Array.isArray(data.data.inmobiliarias)) {
      inmobiliariasArray = data.data.inmobiliarias;
    } else if (data.data.rows && Array.isArray(data.data.rows)) {
      inmobiliariasArray = data.data.rows;
    } else {
      // Si es un objeto con propiedades que parecen inmobiliarias, convertirlo a array
      const values = Object.values(data.data);
      if (values.length > 0 && typeof values[0] === 'object') {
        inmobiliariasArray = values;
      }
    }
  }

  const arr = normalizeApiListResponse(data);

  // Usar el array manual si el normalizado está vacío
  const finalArray = arr.length > 0 ? arr : inmobiliariasArray;

  const mapped = finalArray.map((row) => fromApi(row));

  const meta = data?.meta ?? { total: arr.length, page: Number(params.page || 1), pageSize: Number(params.pageSize || arr.length) };
  return { data: mapped, meta };
}

async function apiGetById(id) {
  const res = await http(`${PRIMARY}/${id}`, { method: "GET" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || "Error al obtener inmobiliaria");

  const raw = data?.data?.inmobiliaria ?? data?.data ?? data;
  return ok(fromApi(raw));
}

async function apiCreate(payload) {
  const res = await http(PRIMARY, { method: "POST", body: toApi(payload) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || "Error al crear inmobiliaria");
  return ok(fromApi(data?.data ?? data));
}

async function apiUpdate(id, payload) {
  // El payload ya viene con los campos correctos del componente (nombre, razonSocial, contacto, comxventa, estado)
  // Construir el body validando que cumpla con el schema del backend
  const body = {};

  // Mapear campos que pueden venir (todos opcionales para PATCH)
  // El schema espera: nombre (string, min 1), razonSocial (string, min 1), contacto (string, max 100, opcional), comxventa (number, 0-100, opcional), estado (OPERATIVO/ELIMINADO)
  if (payload.nombre !== undefined && payload.nombre !== null && String(payload.nombre).trim().length > 0) {
    const nombreTrim = String(payload.nombre).trim();
    if (nombreTrim.length > 100) {
      throw new Error("El nombre es demasiado largo (máximo 100 caracteres)");
    }
    body.nombre = nombreTrim;
  }

  if (payload.razonSocial !== undefined && payload.razonSocial !== null && String(payload.razonSocial).trim().length > 0) {
    const razonTrim = String(payload.razonSocial).trim();
    if (razonTrim.length > 150) {
      throw new Error("La razón social es demasiado larga (máximo 150 caracteres)");
    }
    body.razonSocial = razonTrim;
  }

  if (payload.contacto !== undefined && payload.contacto !== null && payload.contacto !== "") {
    const contactoTrim = String(payload.contacto).trim();
    if (contactoTrim.length > 100) {
      throw new Error("El contacto es demasiado largo (máximo 100 caracteres)");
    }
    if (contactoTrim.length > 0) {
      body.contacto = contactoTrim;
    }
  }

  if (payload.comxventa !== undefined && payload.comxventa !== null) {
    // Asegurar que sea un número válido
    const num = typeof payload.comxventa === 'number' ? payload.comxventa : Number(payload.comxventa);
    if (isNaN(num) || !isFinite(num)) {
      throw new Error("La comisión por venta debe ser un número válido");
    }
    if (num < 0) {
      throw new Error("La comisión por venta no puede ser negativa");
    }
    if (num > 100) {
      throw new Error("La comisión por venta no puede ser mayor a 100");
    }
    body.comxventa = num;
  }

  // maxPrioridadesActivas - solo Admin/Gestor puede editar (validación ya hecha en EditCard)
  if (payload.maxPrioridadesActivas !== undefined) {
    if (payload.maxPrioridadesActivas === null) {
      body.maxPrioridadesActivas = null; // Limpiar límite
    } else if (typeof payload.maxPrioridadesActivas === 'number') {
      body.maxPrioridadesActivas = Math.floor(payload.maxPrioridadesActivas);
    } else {
      const num = Number(payload.maxPrioridadesActivas);
      if (!isNaN(num) && num >= 0) {
        body.maxPrioridadesActivas = Math.floor(num);
      }
    }
  }

  // IMPORTANTE: NO incluir estado/estadoOperativo - solo endpoints de desactivar/reactivar pueden cambiarlo
  // El backend ignora cualquier campo estado/estadoOperativo que venga en updateData

  // Validar que al menos haya un campo (como requiere el schema: .refine((d) => Object.keys(d).length > 0))
  if (Object.keys(body).length === 0) {
    throw new Error("Debe enviar al menos un campo para actualizar");
  }

  const res = await http(`${PRIMARY}/${id}`, { method: "PUT", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Si hay errores de validación, mostrar el mensaje más específico
    const errorMsg = data?.message || data?.errors?.[0]?.message || "Error al actualizar inmobiliaria";
    const error = new Error(errorMsg);
    error.status = res.status;
    error.errors = data?.errors;
    throw error;
  }

  const raw = data?.data?.inmobiliaria ?? data?.data ?? data;
  return ok(fromApi(raw));
}

async function apiDeactivate(id) {
  // Baja lógica: usar endpoint específico PATCH /api/inmobiliarias/:id/eliminar
  const res = await http(`${PRIMARY}/${id}/eliminar`, { method: "PATCH" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errorMsg = data?.message || "Error al desactivar inmobiliaria";
    const error = new Error(errorMsg);
    error.status = res.status;
    throw error;
  }

  const raw = data?.data?.inmobiliaria ?? data?.data ?? data;
  return ok(fromApi(raw));
}

async function apiReactivate(id) {
  // Reactivar: usar endpoint específico PATCH /api/inmobiliarias/:id/reactivar
  const res = await http(`${PRIMARY}/${id}/reactivar`, { method: "PATCH" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errorMsg = data?.message || "Error al reactivar inmobiliaria";
    const error = new Error(errorMsg);
    error.status = res.status;
    throw error;
  }

  const raw = data?.data?.inmobiliaria ?? data?.data ?? data;
  return ok(fromApi(raw));
}

/* --------------------------- EXPORT PÚBLICO --------------------------- */
export const getAllInmobiliarias = apiGetAll;
export const getInmobiliariaById = apiGetById;
export const createInmobiliaria = apiCreate;
export const updateInmobiliaria = apiUpdate;
export const deactivateInmobiliaria = apiDeactivate;
export const reactivateInmobiliaria = apiReactivate;
// Mantener deleteInmobiliaria por compatibilidad (ahora hace soft delete)
export const deleteInmobiliaria = deactivateInmobiliaria;

