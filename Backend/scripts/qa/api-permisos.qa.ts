/**
 * QA (CCLF-29): chequeo automático de permisos, aislamiento multi-tenant y sesión.
 *
 * Ejecuta por HTTP, contra el backend LOCAL levantado con Backend/.env.qa, los casos de la Guía de QA
 * funcional que se pueden automatizar (ACC, LOT, PER, RES, VEN, PRI, INM, ADM, DOC, GEN) y genera:
 *   docs/qa/resultados/api-permisos-<YYYY-MM-DD>.csv  (ID;Estado;Ambiente;Hallazgo;Evidencia, para Excel)
 *   docs/qa/resultados/api-permisos-<YYYY-MM-DD>.md   (totales, detalle por subcaso y FAIL con prioridad)
 *
 * Reglas:
 * - Aborta si DATABASE_URL o QA_API_URL no son locales. Usa Prisma (base QA) solo para buscar los IDs
 *   sembrados por seed:qa, verificar que un rechazo no escribió nada y restaurar lo que modifica.
 * - Todo lo que modifica (baja de inmobiliaria, cambio de rol, usuario eliminado, altas de prueba) se
 *   restaura al final, aunque el script falle a mitad de camino.
 * - Nunca imprime ni guarda tokens ni contraseñas: la evidencia es método + ruta + status.
 * - El rate limit de login es por IP y en memoria: correr con el backend recién iniciado. Al terminar,
 *   localhost queda bloqueado para login 15 minutos (reiniciar el backend QA para liberarlo).
 *
 * Uso (desde Backend/, con la base y el backend QA levantados): npm run qa:api
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import { PrismaClient, Role, EstadoOperativo, EstadoLote } from "../../src/generated/prisma";

const BACKEND_DIR = path.resolve(__dirname, "../..");
dotenv.config({ path: path.join(BACKEND_DIR, ".env.qa"), override: true, quiet: true });

// ===================
// Guard: solo entorno local
// ===================

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function abort(message: string): never {
  console.error(`\n⛔ qa:api abortado: ${message}\n`);
  process.exit(1);
}

function assertLocalUrl(name: string, raw: string | undefined): string {
  if (!raw) abort(`${name} no está definida. ¿Existe Backend/.env.qa?`);
  let host: string;
  try {
    host = new URL(raw).hostname;
  } catch {
    abort(`${name} no es una URL válida.`);
  }
  if (!LOCAL_HOSTS.has(host)) abort(`${name} apunta a "${host}", no a localhost. qa:api solo corre contra el entorno QA local.`);
  return raw;
}

const DATABASE_URL = assertLocalUrl("DATABASE_URL", process.env.DATABASE_URL);
const API = assertLocalUrl("QA_API_URL", process.env.QA_API_URL).replace(/\/+$/, "");
const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

// ===================
// Resultados
// ===================

type Estado = "PASS" | "FAIL" | "BLOCKED" | "PENDIENTE DE DECISIÓN";
type Prioridad = "P0" | "P1" | "P2" | "P3";

type Subcaso = {
  id: string;
  rol: string;
  request: string;   // método + ruta (sin tokens)
  esperado: string;
  obtenido: string;
  estado: Estado;
  hallazgo: string;
  evidencia: string; // método + ruta + status
  prioridad?: Prioridad;
  sospecha?: string;
  pasos?: string;
};

const subcasos: Subcaso[] = [];
const notas: string[] = [
  "Mapeo de IDs corregido por el responsable de QA según la guía (ADM-07, ADM-16, GEN-10, GEN-11). LOT-03 es Base E de la guía.",
  "ADM-05 (según la guía): GESTOR modifica una cuenta existente de ADMINISTRADOR → 403; incluye además los intentos de GESTOR de promover a ADMINISTRADOR.",
  "Interpretación propia (confirmar contra la guía): ACC-03 = login con campos vacíos → 400.",
  "Files: el entorno QA no tiene storage (SUPABASE_* dummy). Los casos de archivos se prueban sobre metadata; subir, firmar URL o purgar como ADMINISTRADOR responde 500 en este entorno.",
];

function registrar(s: Subcaso) {
  subcasos.push(s);
  const icon = s.estado === "PASS" ? "✓" : s.estado === "FAIL" ? "✗" : "•";
  console.log(`  ${icon} ${s.id.padEnd(16)} ${s.estado.padEnd(6)} ${s.rol.padEnd(14)} ${s.evidencia}${s.estado === "FAIL" ? `  ← ${s.hallazgo}` : ""}`);
}

// ===================
// HTTP
// ===================

type Resp = { status: number; headers: Headers; text: string; json: any };

async function http(method: string, ruta: string, opts: { token?: string; body?: unknown; rawBody?: string; headers?: Record<string, string> } = {}): Promise<Resp> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body: string | undefined;
  if (opts.rawBody !== undefined) {
    body = opts.rawBody;
    headers["Content-Type"] ??= "application/json";
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${API}${ruta}`, { method, headers, body });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, headers: res.headers, text, json };
}

const ev = (method: string, ruta: string, status: number | string) => `${method} ${ruta} → ${status}`;

type ProbeSpec = {
  id: string | string[];
  rol: string;
  token?: string;
  method: string;
  ruta: string;
  body?: unknown;
  rawBody?: string;
  headers?: Record<string, string>;
  expect: number[];
  esperado: string;
  // Chequeos extra sobre la respuesta: devuelve el problema encontrado o null.
  verify?: (r: Resp) => string | null | Promise<string | null>;
  // Chequeo posterior contra la base (por ejemplo, que un 403 no haya escrito nada).
  after?: () => Promise<string | null>;
  prioridad?: Prioridad;
  sospecha?: string;
};

async function probe(spec: ProbeSpec): Promise<Resp> {
  const r = await http(spec.method, spec.ruta, { token: spec.token, body: spec.body, rawBody: spec.rawBody, headers: spec.headers });
  const problemas: string[] = [];
  if (!spec.expect.includes(r.status)) {
    problemas.push(`status ${r.status} (esperado ${spec.expect.join("/")})${r.json?.message ? `: "${String(r.json.message).slice(0, 120)}"` : ""}`);
  }
  const extra = spec.verify ? await spec.verify(r) : null;
  if (extra) problemas.push(extra);
  const despues = spec.after ? await spec.after() : null;
  if (despues) problemas.push(despues);

  const ids = Array.isArray(spec.id) ? spec.id : [spec.id];
  for (const id of ids) {
    registrar({
      id,
      rol: spec.rol,
      request: `${spec.method} ${spec.ruta}`,
      esperado: spec.esperado,
      obtenido: problemas.length ? problemas.join("; ") : `${r.status} (según lo esperado)`,
      estado: problemas.length ? "FAIL" : "PASS",
      hallazgo: problemas.join("; "),
      evidencia: ev(spec.method, spec.ruta, r.status),
      prioridad: problemas.length ? spec.prioridad : undefined,
      sospecha: problemas.length ? spec.sospecha : undefined,
      pasos: problemas.length ? `Como ${spec.rol}: ${spec.method} ${spec.ruta}${spec.body !== undefined ? ` con body ${JSON.stringify(spec.body).slice(0, 160)}` : ""}` : undefined,
    });
  }
  return r;
}

// Busca el primer array del JSON cuyos elementos cumplan el predicado (las respuestas no tienen un
// envoltorio uniforme: data, data.items, data.personas…).
function findArray(json: any, pred: (item: any) => boolean): any[] | null {
  const queue: any[] = [json];
  while (queue.length) {
    const node = queue.shift();
    if (Array.isArray(node)) {
      if (node.length > 0 && node.every((x) => x && typeof x === "object" && pred(x))) return node;
      if (node.length === 0) continue;
      queue.push(...node);
    } else if (node && typeof node === "object") {
      queue.push(...Object.values(node));
    }
  }
  return null;
}

// Señales de detalle interno en un body de error.
const LEAK_PATTERNS: Array<[RegExp, string]> = [
  [/"stack"\s*:/i, "campo stack"],
  [/\bat\s+[\w.<>]+\s+\(?[A-Za-z]:?[\\/][^)]*\)?/, "traza de stack"],
  [/node_modules|[\\/]src[\\/].*\.ts\b|\.ts:\d+/i, "ruta de archivo interna"],
  [/\b(SELECT|INSERT|UPDATE|DELETE)\s.+\b(FROM|INTO|SET)\b/i, "SQL"],
  [/prisma|PrismaClient|P20\d\d/i, "detalle de Prisma"],
  [/postgres(ql)?:\/\/|ECONNREFUSED|relation\s+"/i, "detalle de base de datos"],
  [/_pkey|_fkey|_key"|Prioridad_loteId|constraint/i, "nombre interno de constraint"],
];

function leakCheck(r: Resp): string | null {
  const encontrados = LEAK_PATTERNS.filter(([re]) => re.test(r.text)).map(([, d]) => d);
  if (encontrados.length) return `el body expone ${encontrados.join(", ")}`;
  if (!r.json || r.json.success !== false || typeof r.json.code !== "string") return "el body no sigue el contrato de error { success:false, code, message }";
  return null;
}

// ===================
// Datos sembrados (seed:qa)
// ===================

const EMAILS = {
  ADMIN: "qa.admin@federala.test",
  GESTOR: "qa.gestor@federala.test",
  INMO_A: "qa.inmo.a@federala.test",
  INMO_B: "qa.inmo.b@federala.test",
  TECNICO: "qa.tecnico@federala.test",
  AUX_ELIMINADO: "qa.aux.eliminado@federala.test",
  AUX_RATELIMIT: "qa.aux.ratelimit@federala.test",
} as const;
type Cuenta = keyof typeof EMAILS;

const PASSWORD_ENV: Record<Cuenta, string> = {
  ADMIN: "QA_PASS_ADMIN",
  GESTOR: "QA_PASS_GESTOR",
  INMO_A: "QA_PASS_INMO_A",
  INMO_B: "QA_PASS_INMO_B",
  TECNICO: "QA_PASS_TECNICO",
  AUX_ELIMINADO: "QA_PASS_AUX_ELIMINADO",
  AUX_RATELIMIT: "QA_PASS_AUX_RATELIMIT",
};

const password = (c: Cuenta) => {
  const v = process.env[PASSWORD_ENV[c]];
  if (!v || v.startsWith("<")) abort(`falta ${PASSWORD_ENV[c]} en Backend/.env.qa.`);
  return v;
};

async function cargarIds() {
  const user = async (email: string) => (await prisma.user.findUnique({ where: { email } }))?.id;
  const inmob = async (email: string) => (await prisma.inmobiliaria.findFirst({ where: { user: { email } } }))?.id;
  const lote = async (mapId: string) => (await prisma.lote.findUnique({ where: { mapId } }))?.id;
  const reserva = async (numero: string) => (await prisma.reserva.findUnique({ where: { numero } }))?.id;
  const prioridad = async (numero: string) => (await prisma.prioridad.findUnique({ where: { numero } }))?.id;
  const venta = async (numero: string) => (await prisma.venta.findUnique({ where: { numero } }))?.id;
  const persona = async (valor: string) => (await prisma.persona.findFirst({ where: { identificadorTipo: "DNI", identificadorValor: valor } }))?.id;
  const archivo = async (nombre: string) => (await prisma.archivos.findFirst({ where: { nombreArchivo: nombre } }))?.id;

  const ids = {
    userAdmin: await user(EMAILS.ADMIN),
    userGestor: await user(EMAILS.GESTOR),
    userAuxEliminado: await user(EMAILS.AUX_ELIMINADO),
    userAuxRateLimit: await user(EMAILS.AUX_RATELIMIT),
    inmoA: await inmob(EMAILS.INMO_A),
    inmoB: await inmob(EMAILS.INMO_B),
    loteDisponible: await lote("Lote1-4"),
    loteDeudor: await lote("Lote2-4"),
    loteNoDisponible: await lote("Lote3-4"),
    loteSinAsoc: await lote("Lote1-7"),
    loteVentaB: await lote("Lote25-4"),
    loteVentaPagos: await lote("Lote26-4"),
    fraccion4: (await prisma.fraccion.findUnique({ where: { numero: 4 } }))?.id,
    fraccion7: (await prisma.fraccion.findUnique({ where: { numero: 7 } }))?.id,
    resAActiva: await reserva("QA-RES-A-ACTIVA"),
    resBActiva: await reserva("QA-RES-B-ACTIVA"),
    resBRechazada: await reserva("QA-RES-B-RECHAZADA"),
    resBEliminada: await reserva("QA-RES-B-ELIMINADA"),
    priB: await prioridad("QA-PRI-B"),
    ventaACancelada: await venta("QA-VEN-A-CANCELADA"),
    ventaAPagos: await venta("QA-VEN-A-PAGOS"),
    ventaB: await venta("QA-VEN-B-BOLETO"),
    clienteA: await persona("90000002"),
    clienteB: await persona("90000003"),
    planoLote1: await archivo("qa-plano-lote1.pdf"),
    boletoA: await archivo("qa-boleto-a.pdf"),
    boletoB: await archivo("qa-boleto-b.pdf"),
    planoLoteB: await archivo("qa-plano-lote-b.pdf"),
    imagenLoteB: await archivo("qa-imagen-lote-b.jpg"),
  };
  const faltantes = Object.entries(ids).filter(([, v]) => v == null).map(([k]) => k);
  if (faltantes.length) abort(`faltan datos de seed:qa (${faltantes.join(", ")}). Correr: npm run seed:qa -- --base`);
  return ids as { [K in keyof typeof ids]: number };
}

// ===================
// Login y rate limit
// ===================

let loginsFallidos = 0;

async function login(email: string, pass: string): Promise<Resp> {
  const r = await http("POST", "/api/auth/login", { body: { email, password: pass } });
  if (r.status >= 400 && r.status !== 429) loginsFallidos++;
  return r;
}

async function loginOk(c: Cuenta): Promise<string> {
  const r = await login(EMAILS[c], password(c));
  if (r.status === 429) abort("el rate limit de login ya está activo. Reiniciá el backend QA (o esperá 15 min) y volvé a correr qa:api.");
  const token = r.json?.data?.token;
  if (r.status !== 200 || typeof token !== "string") abort(`no se pudo loguear ${EMAILS[c]} (status ${r.status}). ¿Corriste seed:qa y el backend usa .env.qa?`);
  return token;
}

const remainingRateLimit = (r: Resp): number | null => {
  const m = /r=(\d+)/.exec(r.headers.get("ratelimit") ?? "");
  return m ? Number(m[1]) : null;
};

// ===================
// Restauración
// ===================

const restauraciones: Array<{ desc: string; fn: () => Promise<void> }> = [];
const resultadoRestauracion: string[] = [];

async function restaurarTodo() {
  for (const { desc, fn } of restauraciones.reverse()) {
    try {
      await fn();
      resultadoRestauracion.push(`OK — ${desc}`);
    } catch (e) {
      resultadoRestauracion.push(`ERROR — ${desc}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

async function recrearUsuario(c: Cuenta, role: Role) {
  const hash = await bcrypt.hash(password(c), 10);
  const username = `qa_${c.toLowerCase()}`;
  await prisma.user.upsert({
    where: { email: EMAILS[c] },
    update: { role, password: hash },
    create: { email: EMAILS[c], username, role, password: hash },
  });
}

// ===================
// Casos
// ===================

type Tokens = Record<Cuenta, string>;
type Ids = Awaited<ReturnType<typeof cargarIds>>;

async function casosSesion(t: Tokens) {
  console.log("\n— Sesión");
  // ACC-01: el body lleva la password de .env.qa, así que se registra a mano (sin el body).
  const ok = await login(EMAILS.ADMIN, password("ADMIN"));
  const problemasAcc01: string[] = [];
  if (ok.status !== 200) problemasAcc01.push(`status ${ok.status} (esperado 200)`);
  if (typeof ok.json?.data?.token !== "string") problemasAcc01.push("sin token en data.token");
  if (ok.json?.data?.user?.role !== "ADMINISTRADOR") problemasAcc01.push("rol distinto de ADMINISTRADOR");
  if (/"password"/.test(ok.text)) problemasAcc01.push("la respuesta incluye el campo password");
  registrar({
    id: "ACC-01", rol: "ADMINISTRADOR", request: "POST /api/auth/login (credenciales válidas)",
    esperado: "200 con token y usuario, sin password", obtenido: problemasAcc01.join("; ") || "200 con token y rol ADMINISTRADOR, sin password",
    estado: problemasAcc01.length ? "FAIL" : "PASS", hallazgo: problemasAcc01.join("; "), evidencia: ev("POST", "/api/auth/login", ok.status),
    prioridad: "P1", sospecha: "Backend/src/services/auth.service.ts → login",
  });

  const mal = await login(EMAILS.ADMIN, "password-incorrecta-QA");
  const inexistente = await login("no.existe@federala.test", "password-incorrecta-QA");
  const msgs = [mal.json?.message, inexistente.json?.message];
  const problemasAcc02: string[] = [];
  if (mal.status !== 401 || inexistente.status !== 401) problemasAcc02.push(`status ${mal.status}/${inexistente.status} (esperado 401/401)`);
  if (msgs[0] !== msgs[1]) problemasAcc02.push(`mensajes distintos: "${msgs[0]}" vs "${msgs[1]}"`);
  if (/usuario|email|contrase|password|no existe|incorrect/i.test(String(msgs[0]))) problemasAcc02.push(`el mensaje revela qué falló: "${msgs[0]}"`);
  if (mal.json?.data?.token || inexistente.json?.data?.token) problemasAcc02.push("devolvió token");
  registrar({
    id: "ACC-02", rol: "anónimo", request: "POST /api/auth/login (password incorrecta y email inexistente)",
    esperado: "401 en ambos, mismo mensaje genérico, sin token", obtenido: problemasAcc02.join("; ") || `401/401, mensaje "${msgs[0]}"`,
    estado: problemasAcc02.length ? "FAIL" : "PASS", hallazgo: problemasAcc02.join("; "),
    evidencia: `${ev("POST", "/api/auth/login", mal.status)} | ${ev("POST", "/api/auth/login", inexistente.status)}`,
    prioridad: "P1", sospecha: "Backend/src/services/auth.service.ts → login",
  });

  // ACC-03 (interpretación sin la guía): campos vacíos / email inválido → 400 de validación, sin token.
  const vacio = await login("", "");
  registrar({
    id: "ACC-03", rol: "anónimo", request: "POST /api/auth/login con email y password vacíos",
    esperado: "400 VALIDATION_ERROR, sin token", obtenido: `${vacio.status} ${vacio.json?.code ?? ""}`.trim(),
    estado: vacio.status === 400 && vacio.json?.code === "VALIDATION_ERROR" && !vacio.json?.data?.token ? "PASS" : "FAIL",
    hallazgo: vacio.status === 400 ? "" : `status ${vacio.status} (esperado 400)`, evidencia: ev("POST", "/api/auth/login", vacio.status),
    prioridad: "P2", sospecha: "Backend/src/validations/auth.validation.ts → loginSchema",
  });

  // Se altera un carácter del medio de la firma: los últimos de base64url pueden ser solo relleno.
  const partes = t.ADMIN.split(".");
  const firma = partes[2];
  const firmaAlterada = `${partes[0]}.${partes[1]}.${firma.slice(0, 5)}${firma[5] === "A" ? "B" : "A"}${firma.slice(6)}`;
  for (const [desc, token] of [["firma alterada", firmaAlterada], ["token basura", "esto.no.es-un-jwt"]] as const) {
    await probe({
      id: "ACC-09", rol: `token inválido (${desc})`, token, method: "GET", ruta: "/api/lotes", expect: [401],
      esperado: "401 Token inválido, sin datos", verify: (r) => (r.json?.data ? "devolvió datos" : null),
      prioridad: "P0", sospecha: "Backend/src/middlewares/auth.middleware.ts → authenticate",
    });
  }
  await probe({
    id: "ACC-12", rol: "anónimo", method: "GET", ruta: "/api/lotes", expect: [401],
    esperado: "401 Token no proporcionado", verify: (r) => (r.json?.data ? "devolvió datos" : null),
    prioridad: "P0", sospecha: "Backend/src/middlewares/auth.middleware.ts → authenticate",
  });
}

async function casosTransporte(t: Tokens, ids: Ids) {
  console.log("\n— Errores y transporte");
  const id404 = 2147480000;
  // GEN-10: 401 con token inválido; 403 por falta de rol sin invalidar la sesión (el mismo token sigue sirviendo).
  await probe({ id: "GEN-10", rol: "token inválido", token: `${t.INMO_A}x`, method: "GET", ruta: "/api/reservas", expect: [401], esperado: "401 UNAUTHORIZED con token inválido",
    verify: (r) => (r.json?.code === "UNAUTHORIZED" && !r.json?.data ? null : `code ${r.json?.code}`), prioridad: "P0", sospecha: "Backend/src/middlewares/auth.middleware.ts → authenticate" });
  for (const [c, ruta, rutaPermitida] of [["INMO_A", "/api/usuarios", "/api/reservas"], ["TECNICO", "/api/ventas", "/api/lotes"]] as const) {
    const sinRol = await http("GET", ruta, { token: t[c] });
    const despues = await http("GET", rutaPermitida, { token: t[c] });
    const problemas: string[] = [];
    if (sinRol.status !== 403) problemas.push(`status ${sinRol.status} por falta de rol (esperado 403, no 401)`);
    else if (sinRol.json?.code !== "FORBIDDEN") problemas.push(`code ${sinRol.json?.code} (esperado FORBIDDEN)`);
    if (despues.status !== 200) problemas.push(`después del 403, ${rutaPermitida} respondió ${despues.status}: la sesión no sigue válida`);
    registrar({
      id: "GEN-10", rol: c, request: `GET ${ruta} (sin rol) y luego GET ${rutaPermitida} con el mismo token`,
      esperado: "403 FORBIDDEN (no 401) y el token sigue válido: 200 en la ruta permitida", obtenido: problemas.join("; ") || `403 FORBIDDEN → ${despues.status}`,
      estado: problemas.length ? "FAIL" : "PASS", hallazgo: problemas.join("; "),
      evidencia: `${ev("GET", ruta, sinRol.status)} | ${ev("GET", rutaPermitida, despues.status)}`,
      prioridad: "P1", sospecha: "Backend/src/middlewares/auth.middleware.ts → authorize",
    });
  }

  await probe({ id: "GEN-11", rol: "ADMINISTRADOR", token: t.ADMIN, method: "GET", ruta: `/api/lotes/${id404}`, expect: [404], esperado: "404 con contrato de error, sin stack ni SQL", verify: leakCheck, prioridad: "P2", sospecha: "Backend/src/middlewares/error.middleware.ts → handleError" });
  await probe({ id: "GEN-11", rol: "ADMINISTRADOR", token: t.ADMIN, method: "GET", ruta: "/api/ruta-inexistente-qa", expect: [404], esperado: "404 JSON 'Ruta no encontrada'", verify: leakCheck, prioridad: "P2", sospecha: "Backend/src/middlewares/error.middleware.ts → notFoundHandler" });
  await probe({ id: "GEN-11", rol: "ADMINISTRADOR", token: t.ADMIN, method: "GET", ruta: `/api/reservas/${id404}`, expect: [404], esperado: "404 sin stack ni SQL", verify: leakCheck, prioridad: "P2", sospecha: "Backend/src/services/reserva.service.ts → getReservaById" });

  await probe({ id: "GEN-11", rol: "ADMINISTRADOR", token: t.ADMIN, method: "POST", ruta: "/api/fracciones", body: { numero: 4 }, expect: [409], esperado: "409 (fracción duplicada) sin nombres internos", verify: leakCheck, prioridad: "P2", sospecha: "Backend/src/services/fraccion.service.ts" });
  await probe({ id: "GEN-11", rol: "ADMINISTRADOR", token: t.ADMIN, method: "DELETE", ruta: `/api/lotes/${ids.loteVentaPagos}`, expect: [409], esperado: "409 (lote con historia) sin borrar ni exponer constraints", verify: leakCheck,
    after: async () => ((await prisma.lote.findUnique({ where: { id: ids.loteVentaPagos } })) ? null : "el lote fue borrado"), prioridad: "P0", sospecha: "Backend/src/services/lote.service.ts → deleteLote" });
  await probe({ id: "GEN-11", rol: "ADMINISTRADOR", token: t.ADMIN, method: "POST", ruta: "/api/personas", body: { identificadorTipo: "DNI", identificadorValor: "abc" }, expect: [400], esperado: "400 VALIDATION_ERROR con errors[], sin detalle interno (la API no usa 422)", verify: leakCheck, prioridad: "P3", sospecha: "Backend/src/middlewares/validation.middleware.ts" });
  await probe({ id: "GEN-11", rol: "ADMINISTRADOR", token: t.ADMIN, method: "PUT", ruta: `/api/lotes/${ids.loteDisponible}`, rawBody: '{"descripcion": "sin cerrar', expect: [400], esperado: "400 por JSON mal formado, sin detalle del parser", verify: leakCheck, prioridad: "P3", sospecha: "Backend/src/middlewares/error.middleware.ts" });

  // GEN-14: CORS
  const evil = "http://evil.qa.example";
  const pre = await http("OPTIONS", "/api/lotes", { headers: { Origin: evil, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization" } });
  const get = await http("GET", "/health", { headers: { Origin: evil } });
  const ok = await http("GET", "/health", { headers: { Origin: "http://localhost:5173" } });
  const problemasCors: string[] = [];
  if (pre.headers.get("access-control-allow-origin")) problemasCors.push(`preflight de origen no permitido recibió Access-Control-Allow-Origin=${pre.headers.get("access-control-allow-origin")}`);
  if (get.headers.get("access-control-allow-origin")) problemasCors.push(`GET de origen no permitido recibió Access-Control-Allow-Origin=${get.headers.get("access-control-allow-origin")}`);
  if ([pre, get, ok].some((r) => r.headers.get("access-control-allow-credentials"))) problemasCors.push("alguna respuesta incluye Access-Control-Allow-Credentials");
  if (ok.headers.get("access-control-allow-origin") !== "http://localhost:5173") problemasCors.push("control: el origen permitido no recibió Access-Control-Allow-Origin");
  registrar({
    id: "GEN-14", rol: "navegador (Origin)", request: `OPTIONS /api/lotes y GET /health con Origin ${evil}; control con http://localhost:5173`,
    esperado: "Origen no permitido sin Access-Control-Allow-Origin; ninguna respuesta con Allow-Credentials", obtenido: problemasCors.join("; ") || "sin ACAO para el origen ajeno, ACAO solo para localhost:5173, sin Allow-Credentials",
    estado: problemasCors.length ? "FAIL" : "PASS", hallazgo: problemasCors.join("; "),
    evidencia: `${ev("OPTIONS", "/api/lotes", pre.status)} | ${ev("GET", "/health", get.status)} | ${ev("GET", "/health", ok.status)} (control)`,
    prioridad: "P1", sospecha: "Backend/src/config/cors.origins.ts → resolveCorsOrigin",
  });

  // GEN-15: JSON > 1 MB
  const grande = JSON.stringify({ descripcion: "x".repeat(1_100_000) });
  await probe({ id: "GEN-15", rol: "ADMINISTRADOR", token: t.ADMIN, method: "PUT", ruta: `/api/lotes/${ids.loteDisponible}`, rawBody: grande, expect: [413], esperado: "413 PAYLOAD_TOO_LARGE (JSON de ~1,1 MB)",
    verify: (r) => (r.json?.code === "PAYLOAD_TOO_LARGE" ? null : `code ${r.json?.code}`), prioridad: "P2", sospecha: "Backend/src/app.ts → express.json({ limit })" });
}

async function casosPermisos(t: Tokens, ids: Ids) {
  console.log("\n— Permisos por rol");
  const loteSigue = async () => ((await prisma.lote.findUnique({ where: { id: ids.loteSinAsoc } })) ? null : "el lote fue BORRADO");
  for (const c of ["GESTOR", "INMO_A", "TECNICO"] as const) {
    await probe({ id: "LOT-41", rol: c, token: t[c], method: "DELETE", ruta: `/api/lotes/${ids.loteSinAsoc}`, expect: [403], esperado: "403, el lote no se borra", after: loteSigue, prioridad: "P0", sospecha: "Backend/src/routes/lote.routes.ts (authorize ADMINISTRADOR)" });
  }

  const nombreCliente = async () => (await prisma.persona.findUnique({ where: { id: ids.clienteA } }))?.nombre;
  const nombreAntes = await nombreCliente();
  for (const c of ["INMO_A", "TECNICO"] as const) {
    await probe({ id: "PER-12", rol: c, token: t[c], method: "PUT", ruta: `/api/personas/${ids.clienteA}`, body: { nombre: "HackQA" }, expect: [403], esperado: "403, sin cambios",
      after: async () => ((await nombreCliente()) === nombreAntes ? null : "la persona fue modificada"), prioridad: "P0", sospecha: "Backend/src/routes/persona.routes.ts" });
  }

  const senaReserva = async () => String((await prisma.reserva.findUnique({ where: { id: ids.resAActiva } }))?.sena);
  const senaAntes = await senaReserva();
  await probe({ id: "RES-14", rol: "INMO_A", token: t.INMO_A, method: "PUT", ruta: `/api/reservas/${ids.resAActiva}`, body: { sena: 1 }, expect: [403], esperado: "403 (INMOBILIARIA no edita reservas por PUT), sin cambios",
    after: async () => ((await senaReserva()) === senaAntes ? null : "la reserva fue modificada"), prioridad: "P0", sospecha: "Backend/src/routes/reserva.routes.ts (PUT /:id)" });

  const estadoVenta = async () => (await prisma.venta.findUnique({ where: { id: ids.ventaACancelada } }))?.estadoOperativo;
  for (const c of ["INMO_A", "TECNICO"] as const) {
    for (const accion of ["eliminar", "reactivar"]) {
      await probe({ id: "VEN-17", rol: c, token: t[c], method: "PATCH", ruta: `/api/ventas/${ids.ventaACancelada}/${accion}`, expect: [403], esperado: "403, sin cambios",
        after: async () => ((await estadoVenta()) === EstadoOperativo.OPERATIVO ? null : "la venta cambió de estadoOperativo"), prioridad: "P0", sospecha: "Backend/src/routes/ventas.routes.ts" });
    }
  }

  for (const c of ["INMO_A", "TECNICO"] as const) {
    const rutas: Array<[string, string, unknown?]> = [
      ["GET", "/api/inmobiliarias"],
      ["GET", `/api/inmobiliarias/${ids.inmoA}`],
      ["POST", "/api/inmobiliarias", { nombre: "QA Hack", razonSocial: "QA Hack SRL" }],
      ["PUT", `/api/inmobiliarias/${ids.inmoA}`, { nombre: "QA Hack" }],
      ["PATCH", `/api/inmobiliarias/${ids.inmoB}/eliminar`],
      ["PATCH", `/api/inmobiliarias/${ids.inmoB}/reactivar`],
    ];
    for (const [method, ruta, body] of rutas) {
      await probe({ id: "INM-14", rol: c, token: t[c], method, ruta, body, expect: [403], esperado: "403", prioridad: "P0", sospecha: "Backend/src/routes/inmobiliaria.routes.ts" });
    }
  }
  const inmoBOk = await prisma.inmobiliaria.findUnique({ where: { id: ids.inmoB } });
  if (inmoBOk?.estadoOperativo !== EstadoOperativo.OPERATIVO) {
    notas.push("INM-14: la inmobiliaria B quedó ELIMINADO tras los intentos de INMO/TECNICO (se restaura al final).");
    restauraciones.push({ desc: "inmobiliaria B → OPERATIVO (tras INM-14)", fn: async () => { await prisma.inmobiliaria.update({ where: { id: ids.inmoB }, data: { estadoOperativo: EstadoOperativo.OPERATIVO, fechaBaja: null } }); } });
  }

  // ADM: GESTOR frente a ADMINISTRADOR
  const tmpEmail = `qa.tmp.admin.${Date.now()}@federala.test`;
  await probe({ id: "ADM-04", rol: "GESTOR", token: t.GESTOR, method: "POST", ruta: "/api/usuarios", body: { username: `qa_tmp_${Date.now() % 100000}`, password: "QaTmp-123456", rol: "ADMINISTRADOR", email: tmpEmail },
    expect: [403], esperado: "403: GESTOR no crea ADMINISTRADOR; no se crea el usuario",
    after: async () => {
      const u = await prisma.user.findUnique({ where: { email: tmpEmail } });
      if (!u) return null;
      await prisma.user.delete({ where: { id: u.id } });
      return "se creó un ADMINISTRADOR (borrado por el script)";
    }, prioridad: "P0", sospecha: "Backend/src/services/usuario.service.ts → assertPuedeAsignarRol" });

  const rolDe = async (id: number) => (await prisma.user.findUnique({ where: { id } }))?.role;
  for (const [desc, target, rolOriginal] of [["promueve a otro usuario", ids.userAuxRateLimit, Role.GESTOR], ["se auto-promueve", ids.userGestor, Role.GESTOR]] as const) {
    await probe({ id: "ADM-05", rol: `GESTOR (${desc})`, token: t.GESTOR, method: "PUT", ruta: `/api/usuarios/${target}`, body: { rol: "ADMINISTRADOR" }, expect: [403], esperado: "403: GESTOR no promueve a ADMINISTRADOR; rol sin cambios",
      after: async () => {
        if ((await rolDe(target)) === rolOriginal) return null;
        await prisma.user.update({ where: { id: target }, data: { role: rolOriginal } });
        return "el rol cambió a ADMINISTRADOR (restaurado por el script)";
      }, prioridad: "P0", sospecha: "Backend/src/services/usuario.service.ts → assertPuedeAsignarRol" });
  }

  const adminAntes = await prisma.user.findUnique({ where: { id: ids.userAdmin } });
  await probe({ id: "ADM-05", rol: "GESTOR (modifica un ADMINISTRADOR)", token: t.GESTOR, method: "PUT", ruta: `/api/usuarios/${ids.userAdmin}`, body: { username: "qa_admin_hack" }, expect: [403], esperado: "403: GESTOR no modifica un ADMINISTRADOR; sin cambios",
    after: async () => {
      const u = await prisma.user.findUnique({ where: { id: ids.userAdmin } });
      if (u?.username === adminAntes?.username && u?.role === adminAntes?.role) return null;
      await prisma.user.update({ where: { id: ids.userAdmin }, data: { username: adminAntes!.username, role: adminAntes!.role } });
      return "el ADMINISTRADOR fue modificado (restaurado por el script)";
    }, prioridad: "P0", sospecha: "Backend/src/services/usuario.service.ts → assertPuedeModificarUsuario" });

  const auxEliminadoSigue = (quien: string) => async () => {
    if (await prisma.user.findUnique({ where: { email: EMAILS.AUX_ELIMINADO } })) return null;
    await recrearUsuario("AUX_ELIMINADO", Role.GESTOR);
    return `${quien} eliminó un usuario (recreado por el script)`;
  };
  await probe({ id: "ADM-07", rol: "GESTOR", token: t.GESTOR, method: "DELETE", ruta: `/api/usuarios/${ids.userAuxEliminado}`, expect: [403], esperado: "403: GESTOR no elimina usuarios; el usuario sigue existiendo",
    after: auxEliminadoSigue("GESTOR"), prioridad: "P0", sospecha: "Backend/src/routes/usuario.routes.ts (DELETE /:id)" });

  // ADM-16: INMOBILIARIA y TECNICO no administran usuarios ni fracciones.
  const fraccionesAntes = await prisma.fraccion.findMany({ orderBy: { id: "asc" } });
  const fraccionesIguales = async () => {
    const ahora = await prisma.fraccion.findMany({ orderBy: { id: "asc" } });
    if (JSON.stringify(ahora) === JSON.stringify(fraccionesAntes)) return null;
    const ids0 = new Set(fraccionesAntes.map((f) => f.id));
    await prisma.fraccion.deleteMany({ where: { id: { notIn: [...ids0] } } });
    for (const f of fraccionesAntes) await prisma.fraccion.update({ where: { id: f.id }, data: { numero: f.numero } });
    return "las fracciones cambiaron (restauradas por el script)";
  };
  const auxRlAntes = await prisma.user.findUnique({ where: { id: ids.userAuxRateLimit } });
  const auxRlIgual = async () => {
    const u = await prisma.user.findUnique({ where: { id: ids.userAuxRateLimit } });
    if (u?.username === auxRlAntes?.username && u?.role === auxRlAntes?.role) return null;
    await prisma.user.update({ where: { id: ids.userAuxRateLimit }, data: { username: auxRlAntes!.username, role: auxRlAntes!.role } });
    return "el usuario fue modificado (restaurado por el script)";
  };
  for (const c of ["INMO_A", "TECNICO"] as const) {
    const tmp = `qa.tmp.adm16.${c.toLowerCase()}.${Date.now()}@federala.test`;
    const rutas: Array<{ method: string; ruta: string; body?: unknown; after?: () => Promise<string | null> }> = [
      { method: "GET", ruta: "/api/usuarios" },
      { method: "GET", ruta: `/api/usuarios/${ids.userAuxRateLimit}` },
      { method: "POST", ruta: "/api/usuarios", body: { username: `qa_tmp_${Date.now() % 100000}`, password: "QaTmp-123456", rol: "GESTOR", email: tmp },
        after: async () => {
          const u = await prisma.user.findUnique({ where: { email: tmp } });
          if (!u) return null;
          await prisma.user.delete({ where: { id: u.id } });
          return "se creó el usuario (borrado por el script)";
        } },
      { method: "PUT", ruta: `/api/usuarios/${ids.userAuxRateLimit}`, body: { username: "qa_hack" }, after: auxRlIgual },
      { method: "DELETE", ruta: `/api/usuarios/${ids.userAuxEliminado}`, after: auxEliminadoSigue(c) },
      { method: "POST", ruta: "/api/fracciones", body: { numero: 8 }, after: fraccionesIguales },
      { method: "PUT", ruta: `/api/fracciones/${ids.fraccion4}`, body: { numero: 6 }, after: fraccionesIguales },
      { method: "DELETE", ruta: `/api/fracciones/${ids.fraccion7}`, after: fraccionesIguales },
    ];
    for (const r of rutas) {
      await probe({ id: "ADM-16", rol: c, token: t[c], method: r.method, ruta: r.ruta, body: r.body, expect: [403], esperado: "403 sin escrituras", after: r.after,
        prioridad: "P0", sospecha: r.ruta.includes("fracciones") ? "Backend/src/routes/fraccion.routes.ts" : "Backend/src/routes/usuario.routes.ts" });
    }
  }

  const planoSigue = async () => ((await prisma.archivos.findUnique({ where: { id: ids.planoLote1 } })) ? null : "el archivo fue purgado");
  for (const c of ["GESTOR", "INMO_A", "TECNICO"] as const) {
    await probe({ id: "DOC-18", rol: c, token: t[c], method: "DELETE", ruta: `/api/files/${ids.planoLote1}/purge`, expect: [403], esperado: "403: solo ADMINISTRADOR purga", after: planoSigue, prioridad: "P0", sospecha: "Backend/src/routes/files.routes.ts (DELETE /:id/purge)" });
  }
  const aprobacion = async () => (await prisma.archivos.findUnique({ where: { id: ids.planoLote1 } }))?.estadoAprobacionComision;
  await probe({ id: "DOC-24", rol: "INMO_A", token: t.INMO_A, method: "PATCH", ruta: `/api/files/${ids.planoLote1}/aprobaciones`, body: { target: "COMISION", estado: "APROBADO" }, expect: [403], esperado: "403: INMOBILIARIA no aprueba planos; sin cambios",
    after: async () => ((await aprobacion()) === "PENDIENTE" ? null : "la aprobación cambió"), prioridad: "P0", sospecha: "Backend/src/routes/files.routes.ts (PATCH /:id/aprobaciones)" });

  await probe({ id: "LOT-04", rol: "TECNICO", token: t.TECNICO, method: "GET", ruta: "/api/lotes?deudor=true", expect: [400], esperado: "400: TECNICO no puede filtrar por deudor", prioridad: "P1", sospecha: "Backend/src/services/lote.service.ts → buildWhereFromQueryDTO" });
  await probe({ id: "LOT-04", rol: "TECNICO", token: t.TECNICO, method: "GET", ruta: "/api/lotes", expect: [200], esperado: "200 sin el campo deuda en ningún lote",
    verify: (r) => {
      const lotes = r.json?.data?.lotes;
      if (!Array.isArray(lotes) || lotes.length === 0) return "no se encontró data.lotes";
      const conDeuda = lotes.filter((l: any) => "deuda" in l).length;
      return conDeuda ? `${conDeuda} lotes incluyen deuda` : null;
    }, prioridad: "P1", sospecha: "Backend/src/services/lote.service.ts → stripFieldsForTecnico" });
  await probe({ id: "LOT-04", rol: "TECNICO", token: t.TECNICO, method: "GET", ruta: `/api/lotes/${ids.loteDeudor}`, expect: [200], esperado: "200 sin el campo deuda (lote con deuda)",
    verify: (r) => (r.json?.data && "deuda" in r.json.data ? "el detalle incluye deuda" : null), prioridad: "P1", sospecha: "Backend/src/services/lote.service.ts → getLoteById" });
}

async function casosCrossTenant(t: Tokens, ids: Ids) {
  console.log("\n— Aislamiento entre inmobiliarias (A intenta datos de B)");

  // LOT-03
  const lotes = await probe({ id: "LOT-03", rol: "INMO_A", token: t.INMO_A, method: "GET", ruta: "/api/lotes", expect: [200], esperado: "200 sin lotes NO_DISPONIBLE ni campos sensibles (deuda, documento de propietario/inquilino)",
    verify: (r) => {
      const ls: any[] = r.json?.data?.lotes ?? [];
      if (!ls.length) return "no se encontró data.lotes";
      const problemas: string[] = [];
      const noDisp = ls.filter((l) => l.estado === "NO_DISPONIBLE").length;
      if (noDisp) problemas.push(`incluye ${noDisp} lotes NO_DISPONIBLE`);
      const deuda = ls.filter((l) => "deuda" in l).length;
      if (deuda) problemas.push(`${deuda} lotes exponen deuda`);
      const docProp = ls.filter((l) => l.propietario?.identificadorValor).length;
      if (docProp) problemas.push(`${docProp} lotes exponen documento del propietario`);
      const docInq = ls.filter((l) => l.inquilino?.identificadorValor || l.alquilerActivo?.inquilino?.identificadorValor).length;
      if (docInq) problemas.push(`${docInq} lotes exponen documento del inquilino`);
      const priAjena = ls.filter((l) => (l.prioridad ?? []).some((p: any) => p.inmobiliariaId && p.inmobiliariaId !== ids.inmoA)).length;
      if (priAjena) problemas.push(`${priAjena} lotes exponen la prioridad (y el nombre) de otra inmobiliaria`);
      return problemas.join(", ") || null;
    }, prioridad: "P0", sospecha: "Backend/src/services/lote.service.ts → getAllLotes (no filtra por rol INMOBILIARIA)" });
  void lotes;
  await probe({ id: "LOT-03", rol: "INMO_A", token: t.INMO_A, method: "GET", ruta: `/api/lotes/${ids.loteNoDisponible}`, expect: [403, 404], esperado: "403/404 para el detalle de un lote NO_DISPONIBLE",
    prioridad: "P0", sospecha: "Backend/src/services/lote.service.ts → getLoteById" });

  // PER-02
  // El listado de personas usa un DTO con idPersona (no id).
  const esPersona = (x: any) => "identificadorTipo" in x && ("idPersona" in x || "id" in x);
  const verificaClientes = (debeIncluirPropio: boolean) => (r: Resp) => {
    const lista = findArray(r.json, esPersona) ?? [];
    if (r.text.includes("90000003")) return "aparece el cliente de B";
    const ajenas = lista.filter((p) => p.inmobiliariaId !== ids.inmoA);
    if (ajenas.length) return `${ajenas.length} personas de otra inmobiliaria o sin inmobiliaria (ids ${ajenas.slice(0, 5).map((p) => p.idPersona ?? p.id).join(", ")})`;
    if (debeIncluirPropio && !lista.some((p) => p.identificadorValor === "90000002")) return "control: no lista al cliente propio de A";
    return null;
  };
  for (const [q, control] of [["", true], ["?view=ALL", true], ["?view=CLIENTES", true], ["?view=PROPIETARIOS", false], ["?includeInactive=true", true], [`?inmobiliariaId=${ids.inmoB}`, true], ["?q=ClienteB", false]] as const) {
    await probe({ id: "PER-02", rol: "INMO_A", token: t.INMO_A, method: "GET", ruta: `/api/personas${q}`, expect: [200], esperado: "200 solo con clientes de A", verify: verificaClientes(control), prioridad: "P0", sospecha: "Backend/src/services/persona.service.ts → getAllPersonas / buildWhereClause" });
  }

  // PER-10
  const dniTmp = String(91000000 + (Date.now() % 1000000));
  await probe({ id: "PER-10", rol: "INMO_A", token: t.INMO_A, method: "POST", ruta: "/api/personas", body: { identificadorTipo: "DNI", identificadorValor: dniTmp, nombre: "TmpQA", apellido: "PER10", inmobiliariaId: ids.inmoB },
    expect: [201, 200, 400, 403], esperado: "No queda asignada a B: se crea con la inmobiliaria de A o se rechaza",
    after: async () => {
      const p = await prisma.persona.findFirst({ where: { identificadorTipo: "DNI", identificadorValor: dniTmp } });
      if (!p) return null;
      restauraciones.push({ desc: `borrar persona temporal PER-10 (id ${p.id})`, fn: async () => { await prisma.persona.delete({ where: { id: p.id } }); } });
      return p.inmobiliariaId === ids.inmoA ? null : `la persona quedó con inmobiliariaId=${p.inmobiliariaId} (B=${ids.inmoB})`;
    }, prioridad: "P0", sospecha: "Backend/src/services/persona.service.ts → createPersona" });

  // RES-01
  const esReserva = (x: any) => "fechaFinReserva" in x && "numero" in x;
  await probe({ id: "RES-01", rol: "INMO_A", token: t.INMO_A, method: "GET", ruta: "/api/reservas", expect: [200], esperado: "200 solo con reservas de A",
    verify: (r) => {
      const lista = findArray(r.json, esReserva) ?? [];
      if (!lista.length) return "no se encontraron reservas (A tiene reservas sembradas)";
      const ajenas = lista.filter((x) => x.inmobiliariaId !== ids.inmoA);
      return ajenas.length ? `${ajenas.length} reservas ajenas (${ajenas.slice(0, 3).map((x) => x.numero).join(", ")})` : null;
    }, prioridad: "P0", sospecha: "Backend/src/services/reserva.service.ts → getAllReservas" });

  // RES-11
  const loteAntes = await prisma.lote.findUnique({ where: { id: ids.loteDisponible } });
  const numRes = `QA-TMP-RES11-${Date.now() % 1000000}`;
  await probe({ id: "RES-11", rol: "INMO_A", token: t.INMO_A, method: "POST", ruta: "/api/reservas",
    body: { fechaReserva: new Date().toISOString(), loteId: ids.loteDisponible, clienteId: ids.clienteA, inmobiliariaId: ids.inmoB, numero: numRes, sena: 1000, ofertaInicial: 25000, fechaFinReserva: new Date(Date.now() + 5 * 86400000).toISOString() },
    expect: [201, 200, 400, 403], esperado: "No queda a nombre de B: se crea con la inmobiliaria de A o se rechaza",
    after: async () => {
      const res = await prisma.reserva.findUnique({ where: { numero: numRes } });
      if (!res) return null;
      restauraciones.push({ desc: `borrar reserva temporal RES-11 (id ${res.id}) y restaurar lote ${ids.loteDisponible}`, fn: async () => {
        await prisma.ofertaReserva.deleteMany({ where: { reservaId: res.id } });
        await prisma.reserva.delete({ where: { id: res.id } });
        await prisma.lote.update({ where: { id: ids.loteDisponible }, data: { estado: loteAntes!.estado } });
      } });
      return res.inmobiliariaId === ids.inmoA ? null : `la reserva quedó con inmobiliariaId=${res.inmobiliariaId} (B=${ids.inmoB})`;
    }, prioridad: "P0", sospecha: "Backend/src/services/reserva.service.ts → createReserva" });
  // El lote se libera ya (no al final) para que PRI-07 pueda usarlo.
  const tmpRes = await prisma.reserva.findUnique({ where: { numero: numRes } });
  if (tmpRes) {
    await prisma.ofertaReserva.deleteMany({ where: { reservaId: tmpRes.id } });
    await prisma.reserva.delete({ where: { id: tmpRes.id } });
    await prisma.lote.update({ where: { id: ids.loteDisponible }, data: { estado: loteAntes!.estado } });
    restauraciones.splice(restauraciones.findIndex((x) => x.desc.includes("RES-11")), 1);
    resultadoRestauracion.push(`OK — reserva temporal RES-11 borrada y lote ${ids.loteDisponible} restaurado a ${loteAntes!.estado}`);
  }

  // RES-27
  const estadoOp = async (id: number) => (await prisma.reserva.findUnique({ where: { id } }))?.estadoOperativo;
  await probe({ id: "RES-27", rol: "INMO_A", token: t.INMO_A, method: "PATCH", ruta: `/api/reservas/${ids.resBRechazada}/eliminar`, expect: [403], esperado: "403 sin escrituras (reserva RECHAZADA de B)",
    after: async () => {
      if ((await estadoOp(ids.resBRechazada)) === EstadoOperativo.OPERATIVO) return null;
      await prisma.reserva.update({ where: { id: ids.resBRechazada }, data: { estadoOperativo: EstadoOperativo.OPERATIVO, fechaBaja: null } });
      return "A dio de baja una reserva de B (restaurada por el script)";
    }, prioridad: "P0", sospecha: "Backend/src/services/reserva.service.ts → eliminarReserva" });
  await probe({ id: "RES-27", rol: "INMO_A", token: t.INMO_A, method: "PATCH", ruta: `/api/reservas/${ids.resBEliminada}/reactivar`, expect: [403], esperado: "403 sin escrituras (reserva ELIMINADA de B)",
    after: async () => {
      if ((await estadoOp(ids.resBEliminada)) === EstadoOperativo.ELIMINADO) return null;
      await prisma.reserva.update({ where: { id: ids.resBEliminada }, data: { estadoOperativo: EstadoOperativo.ELIMINADO } });
      return "A reactivó una reserva de B (revertido por el script)";
    }, prioridad: "P0", sospecha: "Backend/src/services/reserva.service.ts → reactivarReserva" });

  // PRI-07
  const loteAntesPri = await prisma.lote.findUnique({ where: { id: ids.loteDisponible } });
  const numPri = `QA-TMP-PRI07-${Date.now() % 1000000}`;
  await probe({ id: "PRI-07", rol: "INMO_A", token: t.INMO_A, method: "POST", ruta: "/api/prioridades",
    body: { numero: numPri, loteId: ids.loteDisponible, fechaInicio: new Date().toISOString(), fechaFin: new Date(Date.now() + 2 * 86400000).toISOString(), ownerType: "CCLF", inmobiliariaId: null },
    expect: [201, 200, 400, 403], esperado: "No queda como prioridad CCLF: se crea como INMOBILIARIA de A o se rechaza",
    after: async () => {
      const p = await prisma.prioridad.findUnique({ where: { numero: numPri } });
      if (!p) return null;
      await prisma.prioridad.delete({ where: { id: p.id } });
      await prisma.lote.update({ where: { id: ids.loteDisponible }, data: { estado: loteAntesPri!.estado } });
      resultadoRestauracion.push(`OK — prioridad temporal PRI-07 borrada y lote ${ids.loteDisponible} restaurado a ${loteAntesPri!.estado}`);
      return p.ownerType === "INMOBILIARIA" && p.inmobiliariaId === ids.inmoA ? null : `la prioridad quedó ownerType=${p.ownerType}, inmobiliariaId=${p.inmobiliariaId}`;
    }, prioridad: "P0", sospecha: "Backend/src/services/prioridad.service.ts → createPrioridad" });

  // PRI-11
  const priBAntes = await prisma.prioridad.findUnique({ where: { id: ids.priB } });
  const priBIgual = async () => {
    const p = await prisma.prioridad.findUnique({ where: { id: ids.priB } });
    if (p?.numero === priBAntes?.numero && p?.estado === priBAntes?.estado) return null;
    await prisma.prioridad.update({ where: { id: ids.priB }, data: { numero: priBAntes!.numero, estado: priBAntes!.estado } });
    return "la prioridad de B fue modificada (restaurada por el script)";
  };
  await probe({ id: "PRI-11", rol: "INMO_A", token: t.INMO_A, method: "PATCH", ruta: `/api/prioridades/${ids.priB}`, body: { numero: "QA-HACK" }, expect: [403], esperado: "403 sin escrituras", after: priBIgual, prioridad: "P0", sospecha: "Backend/src/services/prioridad.service.ts → updatePrioridad" });
  await probe({ id: "PRI-11", rol: "INMO_A", token: t.INMO_A, method: "PATCH", ruta: `/api/prioridades/${ids.priB}/cancelar`, expect: [403], esperado: "403 sin escrituras", after: priBIgual, prioridad: "P0", sospecha: "Backend/src/services/prioridad.service.ts → cancelPrioridad" });

  // DOC-11
  await probe({ id: "DOC-11", rol: "INMO_A", token: t.INMO_A, method: "GET", ruta: `/api/files/lote/${ids.loteVentaB}`, expect: [200], esperado: "200 con PLANO/IMAGEN del lote, sin el BOLETO de B",
    verify: (r) => {
      const lista: any[] = Array.isArray(r.json) ? r.json : [];
      const idsVistos = lista.map((f) => f.id);
      if (idsVistos.includes(ids.boletoB)) return "lista el BOLETO de la venta de B";
      if (!idsVistos.includes(ids.planoLoteB) || !idsVistos.includes(ids.imagenLoteB)) return "control: no lista el PLANO/IMAGEN del lote (permitidos)";
      return null;
    }, prioridad: "P0", sospecha: "Backend/src/services/file.service.ts → listByLote / canUserAccessArchivo" });
  await probe({ id: "DOC-11", rol: "INMO_A", token: t.INMO_A, method: "GET", ruta: `/api/files/${ids.boletoB}`, expect: [404], esperado: "404 (no revela el BOLETO de B)", prioridad: "P0", sospecha: "Backend/src/controllers/file.controller.ts → getFileByIdController" });
  await probe({ id: "DOC-11", rol: "INMO_A", token: t.INMO_A, method: "POST", ruta: `/api/files/${ids.boletoB}/url`, expect: [404], esperado: "404 (sin URL firmada del BOLETO de B)", prioridad: "P0", sospecha: "Backend/src/controllers/file.controller.ts → generateSignedUrlController" });
  await probe({ id: "DOC-11", rol: "INMO_A", token: t.INMO_A, method: "GET", ruta: `/api/files/venta/${ids.ventaB}`, expect: [404], esperado: "404 (archivos de la venta de B)", prioridad: "P0", sospecha: "Backend/src/controllers/file.controller.ts → getAllFilesByVentaController" });
  await probe({ id: "DOC-11", rol: "INMO_A", token: t.INMO_A, method: "GET", ruta: `/api/files/venta/${ids.ventaAPagos}`, expect: [200], esperado: "control: 200 con el BOLETO de su propia venta",
    verify: (r) => (Array.isArray(r.json) && r.json.some((f: any) => f.id === ids.boletoA) ? null : "no lista el BOLETO propio"), prioridad: "P2", sospecha: "Backend/src/controllers/file.controller.ts → getAllFilesByVentaController" });

  // GEN-12
  const gen12: Array<[string, number[], string, string]> = [
    [`/api/reservas/${ids.resBActiva}`, [403, 404], "403/404 (reserva de B por ID)", "Backend/src/services/reserva.service.ts → getReservaById"],
    [`/api/reservas/${ids.resBActiva}/ofertas`, [403, 404], "403/404 (ofertas de una reserva de B)", "Backend/src/services/reserva.service.ts → getOfertas"],
    [`/api/reservas/inmob/${ids.inmoB}`, [403], "403 (reservas de la inmobiliaria B)", "Backend/src/services/reserva.service.ts → getReservasByInmobiliaria"],
    [`/api/prioridades/${ids.priB}`, [403, 404], "403/404 (prioridad de B por ID)", "Backend/src/services/prioridad.service.ts → getPrioridadById"],
    [`/api/ventas/inmobiliaria/${ids.inmoB}`, [403], "403 (ventas de la inmobiliaria B)", "Backend/src/services/venta.service.ts → getVentasByInmobiliaria"],
    [`/api/ventas/${ids.ventaB}`, [403], "403 (detalle de venta: solo staff)", "Backend/src/routes/ventas.routes.ts"],
    [`/api/personas/${ids.clienteB}`, [403], "403 (detalle de persona: INMOBILIARIA no tiene acceso)", "Backend/src/routes/persona.routes.ts"],
  ];
  for (const [ruta, expect, esperado, sospecha] of gen12) {
    await probe({ id: "GEN-12", rol: "INMO_A", token: t.INMO_A, method: "GET", ruta, expect, esperado, verify: (r) => (r.json?.data ? "devolvió datos" : null), prioridad: "P0", sospecha });
  }
  const esPrioridad = (x: any) => "ownerType" in x && "fechaFin" in x;
  for (const q of ["", `?inmobiliariaId=${ids.inmoB}`]) {
    await probe({ id: "GEN-12", rol: "INMO_A", token: t.INMO_A, method: "GET", ruta: `/api/prioridades${q}`, expect: [200], esperado: "200 solo con prioridades de A (ignora ?inmobiliariaId)",
      verify: (r) => {
        const lista = findArray(r.json, esPrioridad) ?? [];
        const ajenas = lista.filter((p) => p.inmobiliariaId !== ids.inmoA);
        if (ajenas.length) return `${ajenas.length} prioridades ajenas`;
        return lista.some((p) => p.numero === "QA-PRI-A") ? null : "control: no lista la prioridad propia de A";
      }, prioridad: "P0", sospecha: "Backend/src/services/prioridad.service.ts → getAllPrioridades" });
  }
}

async function casosSesionDestructivos(t: Tokens, ids: Ids) {
  console.log("\n— Sesión: cambios que invalidan tokens (se restauran)");

  // ACC-15: cambio de rol rige en la siguiente petición.
  restauraciones.push({ desc: "rol de qa.aux.ratelimit → GESTOR", fn: async () => { await prisma.user.update({ where: { id: ids.userAuxRateLimit }, data: { role: Role.GESTOR } }); } });
  const antes = await http("GET", "/api/usuarios", { token: t.AUX_RATELIMIT });
  const cambio = await http("PUT", `/api/usuarios/${ids.userAuxRateLimit}`, { token: t.ADMIN, body: { rol: "TECNICO" } });
  const despues = await http("GET", "/api/usuarios", { token: t.AUX_RATELIMIT });
  const vuelta = await http("PUT", `/api/usuarios/${ids.userAuxRateLimit}`, { token: t.ADMIN, body: { rol: "GESTOR" } });
  const final = await http("GET", "/api/usuarios", { token: t.AUX_RATELIMIT });
  const okAcc15 = antes.status === 200 && cambio.status === 200 && despues.status === 403 && vuelta.status === 200 && final.status === 200;
  registrar({
    id: "ACC-15", rol: "GESTOR → TECNICO → GESTOR", request: "GET /api/usuarios con el mismo token antes y después de PUT /api/usuarios/:id {rol}",
    esperado: "200 → (cambio a TECNICO) 403 → (vuelta a GESTOR) 200, sin re-login", obtenido: `${antes.status} → ${cambio.status} → ${despues.status} → ${vuelta.status} → ${final.status}`,
    estado: okAcc15 ? "PASS" : "FAIL", hallazgo: okAcc15 ? "" : "el cambio de rol no rige en la siguiente petición",
    evidencia: `GET /api/usuarios → ${antes.status} | PUT /api/usuarios/${ids.userAuxRateLimit} → ${cambio.status} | GET /api/usuarios → ${despues.status} | PUT (restaurar) → ${vuelta.status} | GET /api/usuarios → ${final.status}`,
    prioridad: "P0", sospecha: "Backend/src/middlewares/auth.middleware.ts → authenticate (findAuthIdentity)",
  });

  // ACC-14 / ADM-08: usuario eliminado con token previo.
  restauraciones.push({ desc: "recrear qa.aux.eliminado (GESTOR)", fn: () => recrearUsuario("AUX_ELIMINADO", Role.GESTOR) });
  const previo = await http("GET", "/api/usuarios", { token: t.AUX_ELIMINADO });
  const borrado = await http("DELETE", `/api/usuarios/${ids.userAuxEliminado}`, { token: t.ADMIN });
  const tokenViejo = await http("GET", "/api/usuarios", { token: t.AUX_ELIMINADO });
  const relogin = await login(EMAILS.AUX_ELIMINADO, password("AUX_ELIMINADO"));
  const okAcc14 = previo.status === 200 && [200, 204].includes(borrado.status) && tokenViejo.status === 401 && relogin.status === 401;
  for (const id of ["ACC-14", "ADM-08"]) {
    registrar({
      id, rol: "ADMINISTRADOR elimina a GESTOR auxiliar", request: `DELETE /api/usuarios/${ids.userAuxEliminado}; luego GET /api/usuarios con su token previo y re-login`,
      esperado: "200 → token previo 401 → login 401", obtenido: `GET ${previo.status} → DELETE ${borrado.status} → GET ${tokenViejo.status} → login ${relogin.status}`,
      estado: okAcc14 ? "PASS" : "FAIL", hallazgo: okAcc14 ? "" : "el usuario eliminado conserva acceso",
      evidencia: `GET /api/usuarios → ${previo.status} | DELETE /api/usuarios/${ids.userAuxEliminado} → ${borrado.status} | GET /api/usuarios → ${tokenViejo.status} | POST /api/auth/login → ${relogin.status}`,
      prioridad: "P0", sospecha: "Backend/src/middlewares/auth.middleware.ts → authenticate",
    });
  }

  // ACC-13 / INM-09: inmobiliaria dada de baja.
  restauraciones.push({ desc: "inmobiliaria B → OPERATIVO", fn: async () => { await prisma.inmobiliaria.update({ where: { id: ids.inmoB }, data: { estadoOperativo: EstadoOperativo.OPERATIVO, fechaBaja: null } }); } });
  const bAntes = await http("GET", "/api/reservas", { token: t.INMO_B });
  const baja = await http("PATCH", `/api/inmobiliarias/${ids.inmoB}/eliminar`, { token: t.ADMIN });
  const bToken = await http("GET", "/api/reservas", { token: t.INMO_B });
  const bLogin = await login(EMAILS.INMO_B, password("INMO_B"));
  const mismoMensaje = bLogin.json?.message === "Credenciales inválidas";
  const alta = await http("PATCH", `/api/inmobiliarias/${ids.inmoB}/reactivar`, { token: t.ADMIN });
  const bLogin2 = await login(EMAILS.INMO_B, password("INMO_B"));
  const okAcc13 = bAntes.status === 200 && baja.status === 200 && bToken.status === 401 && bLogin.status === 401 && mismoMensaje && alta.status === 200 && bLogin2.status === 200;
  for (const id of ["ACC-13", "INM-09"]) {
    registrar({
      id, rol: "INMO_B (dada de baja por ADMINISTRADOR)", request: `PATCH /api/inmobiliarias/${ids.inmoB}/eliminar; token previo, login y reactivación`,
      esperado: "token previo 401; login 401 genérico; tras reactivar, login 200", obtenido: `GET ${bAntes.status} → baja ${baja.status} → token ${bToken.status} → login ${bLogin.status}${mismoMensaje ? " (genérico)" : ` ("${bLogin.json?.message}")`} → reactivar ${alta.status} → login ${bLogin2.status}`,
      estado: okAcc13 ? "PASS" : "FAIL", hallazgo: okAcc13 ? "" : "la baja de la inmobiliaria no corta el acceso o la reactivación no lo devuelve",
      evidencia: `PATCH /api/inmobiliarias/${ids.inmoB}/eliminar → ${baja.status} | GET /api/reservas → ${bToken.status} | POST /api/auth/login → ${bLogin.status} | PATCH …/reactivar → ${alta.status} | POST /api/auth/login → ${bLogin2.status}`,
      prioridad: "P0", sospecha: "Backend/src/services/auth.service.ts → login / authIdentity.service.ts",
    });
  }
}

async function casosRateLimit() {
  console.log("\n— Rate limit de login (al final: deja localhost bloqueado 15 min)");
  const intentos: Array<{ status: number; remaining: number | null }> = [];
  let bloqueo: Resp | null = null;
  for (let i = 0; i < 15; i++) {
    const r = await login(EMAILS.AUX_RATELIMIT, "password-incorrecta-rate-limit");
    intentos.push({ status: r.status, remaining: remainingRateLimit(r) });
    if (r.status === 429) {
      bloqueo = r;
      break;
    }
  }
  const fallidosAntes = loginsFallidos;
  const anterior = intentos[intentos.length - 2];
  const policy = bloqueo?.headers.get("ratelimit-policy") ?? "";
  const problemas: string[] = [];
  if (!bloqueo) problemas.push("no se obtuvo 429 tras 15 intentos fallidos");
  else {
    if (bloqueo.json?.code !== "TOO_MANY_REQUESTS") problemas.push(`code ${bloqueo.json?.code}`);
    if (anterior && anterior.remaining !== 0) problemas.push(`el 429 llegó con cupo restante ${anterior.remaining}`);
    if (fallidosAntes !== 10) notas.push(`ACC-05: el contador local registró ${fallidosAntes} intentos fallidos antes del 429 (esperado 10 con el backend recién iniciado).`);
    if (!/q=10/.test(policy) || !/w=900/.test(policy)) problemas.push(`RateLimit-Policy inesperada: "${policy}"`);
    if (bloqueo.headers.get("x-ratelimit-limit")) problemas.push("expone headers legacy X-RateLimit-*");
  }
  registrar({
    id: "ACC-05", rol: "anónimo (cuenta auxiliar)", request: "POST /api/auth/login repetido con password incorrecta",
    esperado: "429 TOO_MANY_REQUESTS al superar 10 fallidos en 15 min (policy q=10;w=900)", obtenido: bloqueo ? `429 tras ${fallidosAntes} fallidos en la ventana; policy "${policy}"` : problemas.join("; "),
    estado: problemas.length ? "FAIL" : "PASS", hallazgo: problemas.join("; "),
    evidencia: `${intentos.length} × POST /api/auth/login → ${intentos.map((x) => x.status).join(",")}`,
    prioridad: "P1", sospecha: "Backend/src/middlewares/loginRateLimit.middleware.ts",
  });

  const valido = await login(EMAILS.AUX_RATELIMIT, password("AUX_RATELIMIT"));
  registrar({
    id: "ACC-06", rol: "anónimo (cuenta auxiliar)", request: "POST /api/auth/login con la password correcta durante el bloqueo",
    esperado: "429 también con credenciales válidas mientras dura la ventana", obtenido: `${valido.status}${valido.json?.data?.token ? " con token" : ""}`,
    estado: valido.status === 429 && !valido.json?.data?.token ? "PASS" : "FAIL", hallazgo: valido.status === 429 ? "" : "un login válido pasa durante el bloqueo",
    evidencia: ev("POST", "/api/auth/login", valido.status), prioridad: "P1", sospecha: "Backend/src/middlewares/loginRateLimit.middleware.ts",
  });
  notas.push("ACC-05/06: el desbloqueo al vencer la ventana (15 min) no se automatiza; verificar a mano si la guía lo pide.");
}

// ===================
// Verificación final de restauración
// ===================

async function verificarRestauracion(ids: Ids) {
  const problemas: string[] = [];
  const b = await prisma.inmobiliaria.findUnique({ where: { id: ids.inmoB } });
  if (b?.estadoOperativo !== EstadoOperativo.OPERATIVO) problemas.push("inmobiliaria B no está OPERATIVO");
  const aux1 = await prisma.user.findUnique({ where: { email: EMAILS.AUX_ELIMINADO } });
  if (aux1?.role !== Role.GESTOR) problemas.push("qa.aux.eliminado no existe como GESTOR");
  const aux2 = await prisma.user.findUnique({ where: { email: EMAILS.AUX_RATELIMIT } });
  if (aux2?.role !== Role.GESTOR) problemas.push("qa.aux.ratelimit no es GESTOR");
  const tmpRes = await prisma.reserva.count({ where: { numero: { startsWith: "QA-TMP-" } } });
  const tmpPri = await prisma.prioridad.count({ where: { numero: { startsWith: "QA-TMP-" } } });
  const tmpPer = await prisma.persona.count({ where: { nombre: "TmpQA" } });
  if (tmpRes + tmpPri + tmpPer > 0) problemas.push(`quedan registros temporales (reservas ${tmpRes}, prioridades ${tmpPri}, personas ${tmpPer})`);
  const lote = await prisma.lote.findUnique({ where: { id: ids.loteDisponible } });
  if (lote?.estado !== EstadoLote.DISPONIBLE) problemas.push(`el lote ${ids.loteDisponible} quedó ${lote?.estado}`);
  return problemas;
}

// ===================
// Reportes
// ===================

type Caso = { id: string; estado: Estado; hallazgo: string; evidencia: string; prioridad?: Prioridad };

function consolidar(): Caso[] {
  const porId = new Map<string, Subcaso[]>();
  for (const s of subcasos) porId.set(s.id, [...(porId.get(s.id) ?? []), s]);
  const orden: Estado[] = ["FAIL", "BLOCKED", "PENDIENTE DE DECISIÓN", "PASS"];
  return [...porId.entries()].map(([id, ss]) => {
    const estado = orden.find((e) => ss.some((s) => s.estado === e)) ?? "PASS";
    const fallas = ss.filter((s) => s.estado !== "PASS");
    const prioridades = fallas.map((s) => s.prioridad).filter(Boolean) as Prioridad[];
    return {
      id,
      estado,
      hallazgo: fallas.map((s) => `[${s.rol}] ${s.hallazgo}`).join(" | "),
      evidencia: ss.map((s) => s.evidencia).join(" | "),
      prioridad: prioridades.sort()[0],
    };
  });
}

const csvField = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const mdCell = (v: string) => v.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

function fechaLocal(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function escribirReportes(casos: Caso[], problemasRestauracion: string[], inicio: Date) {
  const dir = path.resolve(BACKEND_DIR, "../docs/qa/resultados");
  fs.mkdirSync(dir, { recursive: true });
  const fecha = fechaLocal(inicio);

  const csv = ["ID;Estado;Ambiente;Hallazgo;Evidencia", ...casos.map((c) => [c.id, c.estado, "Local", c.hallazgo, c.evidencia].map(csvField).join(";"))];
  const csvPath = path.join(dir, `api-permisos-${fecha}.csv`);
  fs.writeFileSync(csvPath, "﻿" + csv.join("\n") + "\n", "utf8"); // BOM: Excel lo abre como UTF-8

  const totales = (["PASS", "FAIL", "BLOCKED", "PENDIENTE DE DECISIÓN"] as Estado[]).map((e) => [e, casos.filter((c) => c.estado === e).length] as const);
  const subTotales = (["PASS", "FAIL"] as Estado[]).map((e) => [e, subcasos.filter((s) => s.estado === e).length] as const);
  const fallas = subcasos.filter((s) => s.estado === "FAIL");
  const md: string[] = [
    `# Resultados QA · Permisos, aislamiento y sesión (API)`,
    "",
    `- **Fecha:** ${fecha} · **Ambiente:** Local (PostgreSQL 16 en Docker \`federala-qa-db\` + backend en ${API})`,
    `- **Generado por:** \`npm run qa:api\` (\`Backend/scripts/qa/api-permisos.qa.ts\`); datos de \`npm run seed:qa\`.`,
    `- **Casos:** ${casos.length} IDs de la guía, ${subcasos.length} subcasos ejecutados por HTTP.`,
    "",
    "## Totales por estado",
    "",
    "| Estado | Casos (ID) |",
    "|---|---|",
    ...totales.map(([e, n]) => `| ${e} | ${n} |`),
    "",
    `Subcasos: ${subTotales.map(([e, n]) => `${e} ${n}`).join(" · ")}.`,
    "",
    "## Resultado por caso",
    "",
    "| ID | Estado | Prioridad sugerida | Hallazgo |",
    "|---|---|---|---|",
    ...casos.map((c) => `| ${c.id} | ${c.estado} | ${c.prioridad ?? "—"} | ${mdCell(c.hallazgo || "—")} |`),
    "",
    "## Fallas (FAIL)",
    "",
    ...(fallas.length === 0
      ? ["Sin fallas."]
      : fallas.flatMap((s) => [
          `### ${s.id} · ${s.prioridad ?? "P2"} · ${s.rol}`,
          "",
          `- **Request:** \`${s.request}\``,
          `- **Esperado:** ${s.esperado}`,
          `- **Obtenido:** ${s.obtenido}`,
          `- **Pasos para reproducir:** ${s.pasos ?? `Ejecutar \`${s.request}\` como ${s.rol} contra el backend QA.`}`,
          `- **Archivo/función sospechada (sin corregir):** ${s.sospecha ?? "—"}`,
          "",
        ])),
    "## Detalle de subcasos",
    "",
    "| ID | Rol | Request | Esperado | Obtenido | Estado |",
    "|---|---|---|---|---|---|",
    ...subcasos.map((s) => `| ${s.id} | ${mdCell(s.rol)} | \`${mdCell(s.request)}\` | ${mdCell(s.esperado)} | ${mdCell(s.obtenido)} | ${s.estado} |`),
    "",
    "## Restauración de datos",
    "",
    ...resultadoRestauracion.map((r) => `- ${r}`),
    problemasRestauracion.length ? `- **Verificación final con problemas:** ${problemasRestauracion.join("; ")}` : "- Verificación final: datos QA restaurados (inmobiliaria B OPERATIVO, cuentas auxiliares GESTOR, sin registros temporales).",
    "",
    "## Notas",
    "",
    ...notas.map((n) => `- ${n}`),
    "- El rate limit de login quedó activo para localhost: reiniciar el backend QA antes de seguir con pruebas manuales.",
    "",
  ];
  const mdPath = path.join(dir, `api-permisos-${fecha}.md`);
  fs.writeFileSync(mdPath, md.join("\n"), "utf8");
  return { csvPath, mdPath, totales };
}

// ===================
// Main
// ===================

async function main() {
  const inicio = new Date();
  const health = await fetch(`${API}/health`).catch(() => null);
  if (health?.status !== 200) abort(`el backend QA no responde en ${API}/health. Levantarlo con: node --env-file=.env.qa dist/server.js`);
  const ids = await cargarIds();

  console.log(`\n=== qa:api contra ${API} (base ${process.env.QA_DB_NAME}) ===`);
  const tokens = {} as Tokens;
  for (const c of Object.keys(EMAILS) as Cuenta[]) tokens[c] = await loginOk(c);

  let problemasRestauracion: string[] = [];
  try {
    await casosSesion(tokens);
    await casosTransporte(tokens, ids);
    await casosPermisos(tokens, ids);
    await casosCrossTenant(tokens, ids);
    await casosSesionDestructivos(tokens, ids);
    await casosRateLimit();
  } finally {
    await restaurarTodo();
    problemasRestauracion = await verificarRestauracion(ids);
  }

  const casos = consolidar();
  const { csvPath, mdPath, totales } = escribirReportes(casos, problemasRestauracion, inicio);
  console.log(`\nTotales: ${totales.map(([e, n]) => `${e} ${n}`).join(" · ")}`);
  console.log(`Restauración: ${problemasRestauracion.length ? `CON PROBLEMAS: ${problemasRestauracion.join("; ")}` : "OK"}`);
  console.log(`CSV: ${path.relative(path.resolve(BACKEND_DIR, ".."), csvPath)}`);
  console.log(`MD:  ${path.relative(path.resolve(BACKEND_DIR, ".."), mdPath)}`);
  console.log("\n⚠ El rate limit de login quedó activo para localhost (15 min): reiniciá el backend QA antes de las pruebas manuales.\n");
  if (problemasRestauracion.length) process.exitCode = 2;
}

main()
  .catch((e) => {
    console.error("\n❌ ERROR en qa:api:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
