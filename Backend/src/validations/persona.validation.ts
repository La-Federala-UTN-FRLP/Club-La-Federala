import { z } from "zod";
import { idParamsSchema, positiveIntString } from "./params.validation";
import { booleanQuery } from "./query.validation";
import { idDelBody, tieneAlgunCampo, ACTUALIZAR_SIN_CAMPOS } from "./body.validation";

const identificadorTipoEnum = z.enum(["DNI", "CUIT", "CUIL", "PASAPORTE", "OTRO"]);

// Función para normalizar identificadorValor
const normalizeIdentificadorValor = (tipo: string, valor: string): string => {
  let normalized = valor.trim();
  
  // Para CUIL/CUIT, quitar guiones
  if (tipo === "CUIL" || tipo === "CUIT") {
    normalized = normalized.replace(/-/g, "");
  }
  
  return normalized;
};

// Validación de formato según tipo
const validateIdentificadorFormat = (tipo: string, valor: string): boolean => {
  const normalized = normalizeIdentificadorValor(tipo, valor);
  
  if (tipo === "DNI") {
    return /^\d{8}$/.test(normalized);
  }
  if (tipo === "CUIT" || tipo === "CUIL") {
    return /^\d{11}$/.test(normalized); // Sin guiones
  }
  if (tipo === "PASAPORTE") {
    return /^[A-Z0-9]{6,9}$/.test(normalized);
  }
  if (tipo === "OTRO") {
    return normalized.length > 0;
  }
  return false;
};

// Schema base para crear persona
const baseCreatePersonaSchema = z.object({
  identificadorTipo: identificadorTipoEnum,
  identificadorValor: z
    .string()
    .min(1, "El valor del identificador es requerido")
    .transform((val) => val.trim()),
  // Datos para persona física
  nombre: z.string().max(100, "El nombre no puede tener mas de 100 caracteres").optional(),
  apellido: z.string().max(100, "El apellido no puede tener mas de 100 caracteres").optional(),
  // Datos para persona jurídica
  razonSocial: z.string().max(200, "La razón social no puede tener mas de 200 caracteres").optional(),
  // Contacto
  telefono: z
    .number()
    .int()
    .positive("El telefono debe ser un numero positivo")
    .optional(),
  email: z.string().email("Email invalido").optional(),
  // Relaciones
  // IDs del body: política compartida (number o string decimal canónico, 1..int4, entrega number).
  jefeDeFamiliaId: idDelBody("del jefe de familia").optional(),
  // inmobiliariaId: opcional, solo para ADMIN/GESTOR
  inmobiliariaId: idDelBody("de la inmobiliaria").nullable().optional(),
})
.refine(
  (data) => {
    // Regla: razonSocial O (nombre + apellido)
    const tieneRazonSocial = !!data.razonSocial;
    const tieneNombreApellido = !!(data.nombre && data.apellido);
    return tieneRazonSocial || tieneNombreApellido;
  },
  {
    message: "Debe proporcionar razonSocial (persona jurídica) o nombre y apellido (persona física)",
    path: ["razonSocial"],
  }
)
.refine(
  (data) => {
    // Validar formato del identificador
    return validateIdentificadorFormat(data.identificadorTipo, data.identificadorValor);
  },
  {
    message: "Valor de identificador no coincide con el tipo especificado",
    path: ["identificadorValor"],
  }
)
.transform((data) => ({
  ...data,
  identificadorValor: normalizeIdentificadorValor(data.identificadorTipo, data.identificadorValor),
}));

export const createPersonaSchema = baseCreatePersonaSchema;
// Body ya validado y normalizado por la ruta (lo que el controller recibe en req.body).
export type CreatePersonaInput = z.output<typeof createPersonaSchema>;

export const updatePersonaSchema = z.object({
  identificadorTipo: identificadorTipoEnum.optional(),
  identificadorValor: z
    .string()
    .min(1)
    .optional()
    .transform((val) => val ? val.trim() : undefined),
  nombre: z.string().min(1).max(100).optional(),
  apellido: z.string().min(1).max(100).optional(),
  razonSocial: z.string().max(200).optional(),
  telefono: z.union([z.number().int().positive(), z.null()]).optional(),
  email: z.union([z.string().email("Email invalido"), z.null()]).optional(),
  jefeDeFamiliaId: idDelBody("del jefe de familia").optional(),
  estado: z.enum(["OPERATIVO", "ELIMINADO"]).optional(),
  inmobiliariaId: idDelBody("de la inmobiliaria").nullable().optional(),
})
.refine(tieneAlgunCampo, ACTUALIZAR_SIN_CAMPOS)
.refine(
  (data) => {
    // Si viene identificadorTipo, debe venir identificadorValor y viceversa
    const tieneTipo = !!data.identificadorTipo;
    const tieneValor = !!data.identificadorValor;
    if (tieneTipo && !tieneValor) {
      return false;
    }
    if (tieneValor && !tieneTipo) {
      return false;
    }
    return true;
  },
  {
    message: "identificadorTipo e identificadorValor deben venir juntos",
  }
)
.refine(
  (data) => {
    // Si viene identificador, validar formato
    if (data.identificadorTipo && data.identificadorValor) {
      return validateIdentificadorFormat(data.identificadorTipo, data.identificadorValor);
    }
    return true;
  },
  {
    message: "Valor de identificador no coincide con el tipo especificado",
    path: ["identificadorValor"],
  }
)
.transform((data) => {
  if (data.identificadorTipo && data.identificadorValor) {
    return {
      ...data,
      identificadorValor: normalizeIdentificadorValor(data.identificadorTipo, data.identificadorValor),
    };
  }
  return data;
});

export type UpdatePersonaInput = z.output<typeof updatePersonaSchema>;

// Params /:id de Persona (política común de IDs de path)
export const getPersonaSchema = idParamsSchema;

// Params GET /personas/cuil/:cuil. El CUIL es un identificador, no un ID de PK: se mantiene como
// string (un number perdería el contrato de "11 dígitos") y sale normalizado, sin separadores.
// Acepta los mismos separadores que PersonaService.getPersonaByCuil ya toleraba (guiones, puntos
// y espacios), así que "20-12345678-3" y "20.12345678.3" llegan como "20123456783".
export const cuilParamsSchema = z.object({
  cuil: z
    .string()
    .transform((valor) => valor.replace(/[-.\s]/g, ""))
    .pipe(z.string().regex(/^\d{11}$/, "El CUIL debe tener 11 dígitos")),
});

export const deletePersonaSchema = getPersonaSchema;

// Body: alta de miembro de grupo familiar. Mismas reglas de formato y normalización
// del identificador que el alta de Persona.
export const createMiembroFamiliarSchema = z
  .object({
    nombre: z.string().trim().min(1, "El nombre es requerido").max(100, "El nombre no puede tener mas de 100 caracteres"),
    apellido: z.string().trim().min(1, "El apellido es requerido").max(100, "El apellido no puede tener mas de 100 caracteres"),
    identificadorTipo: identificadorTipoEnum,
    identificadorValor: z.string().trim().min(1, "El valor del identificador es requerido"),
  })
  .refine((data) => validateIdentificadorFormat(data.identificadorTipo, data.identificadorValor), {
    message: "Valor de identificador no coincide con el tipo especificado",
    path: ["identificadorValor"],
  })
  .transform((data) => ({
    ...data,
    identificadorValor: normalizeIdentificadorValor(data.identificadorTipo, data.identificadorValor),
  }));

export type CreateMiembroFamiliarInput = z.infer<typeof createMiembroFamiliarSchema>;

// Params: /:id/grupo-familiar/miembros/:miembroId
export const miembroFamiliarParamsSchema = z.object({
  id: positiveIntString,
  miembroId: positiveIntString,
});

// Query: GET /personas. Solo lo que lee el controller, que consume el resultado validado
// (includeInactive ya es boolean y limit ya es number).
export const queryPersonasSchema = z.object({
  view: z.enum(["ALL", "PROPIETARIOS", "INQUILINOS", "CLIENTES", "MIS_CLIENTES"]).optional(),
  q: z.string().optional(),
  includeInactive: booleanQuery.optional(),
  estado: z.enum(["OPERATIVO", "ELIMINADO"]).optional(),
  limit: positiveIntString.optional(),
});
