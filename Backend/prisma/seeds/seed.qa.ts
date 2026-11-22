/**
 * Seed QA (CCLF-28): datos para la Guía de QA funcional sobre la base LOCAL descartable.
 *
 * - Carga Backend/.env.qa (pisa cualquier variable ya cargada) y ABORTA si DATABASE_URL no apunta
 *   a localhost/127.0.0.1 o si la base conectada no es la de QA_DB_NAME.
 * - Idempotente: cada dato se busca por una clave natural (email, mapId, numero, nombreArchivo…)
 *   y se actualiza al estado esperado o se crea. Correrlo de nuevo devuelve los datos QA a ese estado.
 * - --base: antes corre seed:core, seed:personas y seed:lrv contra la misma base local. seed:lrv no
 *   es idempotente (crea la Fracción 3 sin upsert), así que solo se corre si esa fracción no existe.
 *
 * Uso (desde Backend/): npm run seed:qa            → solo datos QA (requiere los seeds base)
 *                       npm run seed:qa -- --base  → seeds base (si faltan) + datos QA
 */

import path from "path";
import { execSync } from "child_process";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import {
  PrismaClient,
  Prisma,
  Role,
  EstadoLote,
  TipoLote,
  NombreCalle,
  EstadoReserva,
  EstadoOperativo,
  OwnerPrioridad,
  EstadoPrioridad,
  EstadoVenta,
  EstadoCobro,
  TiposArchivos,
  EstadoAprobacionPlano,
  IdentificadorTipo,
  PersonaCategoria,
  EstadoAlquiler,
  EstadoPlanPago,
  TipoFinanciacion,
  Moneda,
  TipoCuota,
  EstadoCuota,
  MedioPago,
} from "../../src/generated/prisma";

const BACKEND_DIR = path.resolve(__dirname, "../..");
dotenv.config({ path: path.join(BACKEND_DIR, ".env.qa"), override: true, quiet: true });

// ===================
// Guard: solo base local
// ===================

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function assertLocalDatabaseUrl(raw: string | undefined): string {
  if (!raw) {
    abort("DATABASE_URL no está definida. ¿Existe Backend/.env.qa?");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    abort("DATABASE_URL no es una URL válida.");
  }
  if (!url.protocol.startsWith("postgres") || !LOCAL_HOSTS.has(url.hostname)) {
    abort(`DATABASE_URL apunta a "${url.hostname}", no a una base local. Este seed solo corre contra la base QA de Docker.`);
  }
  return raw;
}

function abort(message: string): never {
  console.error(`\n⛔ seed:qa abortado: ${message}\n`);
  process.exit(1);
}

const DATABASE_URL = assertLocalDatabaseUrl(process.env.DATABASE_URL);
if (process.env.DIRECT_URL) assertLocalDatabaseUrl(process.env.DIRECT_URL);

// URL explícita: no depende de que el cliente generado lea otro .env al importarse.
const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

async function assertQaDatabase() {
  const [row] = await prisma.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  const expected = process.env.QA_DB_NAME;
  if (!expected || row?.db !== expected) {
    abort(`la base conectada es "${row?.db}" y se esperaba QA_DB_NAME="${expected ?? "(sin definir)"}".`);
  }
}

// ===================
// Helpers
// ===================

const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (d: number) => new Date(Date.now() + d * DAY);

function requiredPassword(key: string): string {
  const value = process.env[key];
  if (!value || value.startsWith("<")) abort(`falta ${key} en Backend/.env.qa.`);
  return value;
}

const hashPassword = (plain: string) => bcrypt.hash(plain, 10);

// Tabla final "dato clave → ID → caso de la guía".
const resumen: Array<{ dato: string; id: number | string; casos: string }> = [];
const registrar = (dato: string, id: number | string, casos: string) => resumen.push({ dato, id, casos });

// ===================
// Seeds base (--base)
// ===================

async function runBaseSeeds() {
  const env = { ...process.env, DATABASE_URL, DIRECT_URL: process.env.DIRECT_URL ?? DATABASE_URL };
  const run = (script: string) => {
    console.log(`\n▶ npm run ${script} (base local)`);
    execSync(`npm run ${script}`, { cwd: BACKEND_DIR, env, stdio: "inherit" });
  };
  run("seed:core");
  run("seed:personas");
  const fraccion3 = await prisma.fraccion.findUnique({ where: { numero: 3 } });
  if (fraccion3) {
    console.log("\n↷ seed:lrv omitido: la Fracción 3 ya existe (seed:lrv no es idempotente).");
  } else {
    run("seed:lrv");
  }
}

async function assertBaseSeeds() {
  const [admin, persona, fraccion3] = await Promise.all([
    prisma.user.findUnique({ where: { email: "mariasantillan@gmail.com" } }),
    prisma.persona.findFirst({ where: { identificadorValor: "12345678" } }),
    prisma.fraccion.findUnique({ where: { numero: 3 } }),
  ]);
  if (!admin || !persona || !fraccion3) {
    abort("faltan los seeds base (seed:core, seed:personas, seed:lrv). Correr: npm run seed:qa -- --base");
  }
}

// ===================
// Usuarios e inmobiliarias
// ===================

type QaUserKey = "ADMIN" | "GESTOR" | "INMO_A" | "INMO_B" | "TECNICO" | "AUX_ELIMINADO" | "AUX_RATELIMIT";

const QA_USERS: Record<QaUserKey, { email: string; username: string; role: Role; passwordEnv: string; casos: string }> = {
  ADMIN: { email: "qa.admin@federala.test", username: "qa_admin", role: Role.ADMINISTRADOR, passwordEnv: "QA_PASS_ADMIN", casos: "ACC-01, ADM-*, LOT-40" },
  GESTOR: { email: "qa.gestor@federala.test", username: "qa_gestor", role: Role.GESTOR, passwordEnv: "QA_PASS_GESTOR", casos: "ADM-04/05/07, LOT-41" },
  INMO_A: { email: "qa.inmo.a@federala.test", username: "qa_inmo_a", role: Role.INMOBILIARIA, passwordEnv: "QA_PASS_INMO_A", casos: "LOT-03, PER-02/10, RES-*, PRI-*, DOC-11, ADM-16, GEN-10/12" },
  INMO_B: { email: "qa.inmo.b@federala.test", username: "qa_inmo_b", role: Role.INMOBILIARIA, passwordEnv: "QA_PASS_INMO_B", casos: "ACC-13, INM-09, datos ajenos para A" },
  TECNICO: { email: "qa.tecnico@federala.test", username: "qa_tecnico", role: Role.TECNICO, passwordEnv: "QA_PASS_TECNICO", casos: "LOT-04, LOT-41, PER-12, INM-14, ADM-16, GEN-10" },
  AUX_ELIMINADO: { email: "qa.aux.eliminado@federala.test", username: "qa_aux_eliminado", role: Role.GESTOR, passwordEnv: "QA_PASS_AUX_ELIMINADO", casos: "ACC-14, ADM-08 (se elimina y se recrea)" },
  AUX_RATELIMIT: { email: "qa.aux.ratelimit@federala.test", username: "qa_aux_ratelimit", role: Role.GESTOR, passwordEnv: "QA_PASS_AUX_RATELIMIT", casos: "ACC-15 (cambio de rol), ACC-05/06" },
};

async function upsertUser(key: QaUserKey) {
  const def = QA_USERS[key];
  const password = await hashPassword(requiredPassword(def.passwordEnv));
  const user = await prisma.user.upsert({
    where: { email: def.email },
    update: { username: def.username, role: def.role, password },
    create: { email: def.email, username: def.username, role: def.role, password },
  });
  registrar(`User ${key} (${def.email})`, user.id, def.casos);
  return user;
}

async function upsertInmobiliaria(userId: number, nombre: string, casos: string) {
  const inmob = await prisma.inmobiliaria.upsert({
    where: { userId },
    update: { nombre, razonSocial: `${nombre} SRL`, estadoOperativo: EstadoOperativo.OPERATIVO, fechaBaja: null, maxPrioridadesActivas: 5 },
    create: { userId, nombre, razonSocial: `${nombre} SRL`, contacto: "0000-000000", comxventa: 3, maxPrioridadesActivas: 5 },
  });
  registrar(`Inmobiliaria ${nombre}`, inmob.id, casos);
  return inmob;
}

// ===================
// Personas
// ===================

type PersonaDef = {
  tipo: IdentificadorTipo;
  valor: string;
  nombre?: string;
  apellido?: string;
  razonSocial?: string;
  inmobiliariaId?: number | null;
  estado?: EstadoOperativo;
  categoria?: PersonaCategoria;
  jefeDeFamiliaId?: number | null;
};

async function upsertPersona(def: PersonaDef, dato: string, casos: string) {
  const estado = def.estado ?? EstadoOperativo.OPERATIVO;
  const data = {
    nombre: def.nombre ?? null,
    apellido: def.apellido ?? null,
    razonSocial: def.razonSocial ?? null,
    inmobiliariaId: def.inmobiliariaId ?? null,
    estadoOperativo: estado,
    fechaBaja: estado === EstadoOperativo.ELIMINADO ? daysFromNow(-10) : null,
    categoria: def.categoria ?? PersonaCategoria.OPERATIVA,
    jefeDeFamiliaId: def.jefeDeFamiliaId ?? null,
    contacto: "0000-111111",
    updateAt: new Date(),
  };
  const persona = await prisma.persona.upsert({
    where: { identificadorTipo_identificadorValor: { identificadorTipo: def.tipo, identificadorValor: def.valor } },
    update: data,
    create: { identificadorTipo: def.tipo, identificadorValor: def.valor, ...data },
  });
  registrar(dato, persona.id, casos);
  return persona;
}

// ===================
// Lotes
// ===================

type LoteDef = {
  mapId?: string;          // clave natural (Lote{numero}-{fraccion}, coincide con el SVG del mapa)
  descripcion: string;     // clave natural cuando no hay mapId
  numero: number;
  fraccionId: number;
  estado: EstadoLote;
  propietarioId: number;
  tipo?: TipoLote;
  precio?: number | null;
  deuda?: boolean;
  alquiler?: boolean;
  nombreEspacioComun?: string;
  capacidad?: number;
  calle: NombreCalle;
  numeroCalle: number;
};

async function upsertLote(def: LoteDef, dato: string, casos: string) {
  const tipo = def.tipo ?? TipoLote.LOTE_VENTA;
  const data = {
    numero: def.numero,
    tipo,
    descripcion: def.descripcion,
    estado: def.estado,
    fraccionId: def.fraccionId,
    propietarioId: def.propietarioId,
    superficie: 500,
    precio: tipo === TipoLote.ESPACIO_COMUN ? null : (def.precio ?? 30000),
    deuda: def.deuda ?? false,
    alquiler: def.alquiler ?? false,
    nombreEspacioComun: def.nombreEspacioComun ?? null,
    capacidad: def.capacidad ?? null,
    inquilinoId: null,
  };
  const existing = def.mapId
    ? await prisma.lote.findUnique({ where: { mapId: def.mapId } })
    : await prisma.lote.findFirst({ where: { descripcion: def.descripcion, mapId: null } });

  const lote = existing
    ? await prisma.lote.update({ where: { id: existing.id }, data })
    : await prisma.lote.create({
        data: { ...data, mapId: def.mapId ?? null, ubicacion: { create: { calle: def.calle, numero: def.numeroCalle } } },
      });
  registrar(dato, lote.id, casos);
  return lote;
}

// ===================
// Reservas, prioridades, ventas
// ===================

type ReservaDef = {
  numero: string;
  loteId: number;
  clienteId: number;
  inmobiliaria: { id: number; nombre: string };
  estado: EstadoReserva;
  estadoOperativo?: EstadoOperativo;
  fechaReserva: Date;
  fechaFinReserva: Date;
  ofertaInicial: number;
  contraofertaCclf?: number;
};

async function upsertReserva(def: ReservaDef, dato: string, casos: string) {
  const eliminada = def.estadoOperativo === EstadoOperativo.ELIMINADO;
  const ofertaActual = def.contraofertaCclf ?? def.ofertaInicial;
  const data = {
    fechaReserva: def.fechaReserva,
    estado: def.estado,
    estadoPrevio: null,
    estadoOperativo: def.estadoOperativo ?? EstadoOperativo.OPERATIVO,
    fechaBaja: eliminada ? daysFromNow(-1) : null,
    loteId: def.loteId,
    clienteId: def.clienteId,
    inmobiliariaId: def.inmobiliaria.id,
    sena: Math.round(def.ofertaInicial * 0.1),
    ofertaInicial: def.ofertaInicial,
    ofertaActual,
    fechaFinReserva: def.fechaFinReserva,
    loteEstadoAlCrear: EstadoLote.DISPONIBLE,
    ventaId: null,
  };
  const reserva = await prisma.reserva.upsert({
    where: { numero: def.numero },
    update: data,
    create: { numero: def.numero, ...data },
  });

  // Historial de ofertas: se rehace en cada corrida (no tiene clave natural).
  await prisma.ofertaReserva.deleteMany({ where: { reservaId: reserva.id } });
  await prisma.ofertaReserva.create({
    data: {
      reservaId: reserva.id, monto: def.ofertaInicial, motivo: "Oferta inicial (QA)",
      ownerType: OwnerPrioridad.INMOBILIARIA, efectorId: def.inmobiliaria.id, nombreEfector: def.inmobiliaria.nombre,
      createdAt: def.fechaReserva,
    },
  });
  if (def.contraofertaCclf !== undefined) {
    await prisma.ofertaReserva.create({
      data: {
        reservaId: reserva.id, monto: def.contraofertaCclf, motivo: "Contraoferta CCLF (QA)",
        ownerType: OwnerPrioridad.CCLF, nombreEfector: "La Federala", createdAt: new Date(def.fechaReserva.getTime() + DAY),
      },
    });
  }
  registrar(dato, reserva.id, casos);
  return reserva;
}

type PrioridadDef = {
  numero: string;
  loteId: number;
  owner: OwnerPrioridad;
  inmobiliariaId: number | null;
  fechaInicio: Date;
  fechaFin: Date;
};

async function upsertPrioridad(def: PrioridadDef, dato: string, casos: string) {
  const data = {
    loteId: def.loteId,
    estado: EstadoPrioridad.ACTIVA,
    estadoOperativo: EstadoOperativo.OPERATIVO,
    ownerType: def.owner,
    inmobiliariaId: def.inmobiliariaId,
    fechaInicio: def.fechaInicio,
    fechaFin: def.fechaFin,
    loteEstadoAlCrear: EstadoLote.DISPONIBLE,
  };
  const prioridad = await prisma.prioridad.upsert({
    where: { numero: def.numero },
    update: data,
    create: { numero: def.numero, ...data },
  });
  registrar(dato, prioridad.id, casos);
  return prioridad;
}

type VentaDef = {
  numero: string;
  loteId: number;
  inmobiliariaId: number | null;
  compradorId: number;
  coCompradorIds?: number[];
  estado: EstadoVenta;
  estadoCobro: EstadoCobro;
  monto: number;
  tipoPago: string;
};

async function upsertVenta(def: VentaDef, dato: string, casos: string) {
  const compradores = [def.compradorId, ...(def.coCompradorIds ?? [])].map((id) => ({ id }));
  const data = {
    loteId: def.loteId,
    fechaVenta: daysFromNow(-20),
    monto: def.monto,
    estado: def.estado,
    estadoPrevio: null,
    estadoOperativo: EstadoOperativo.OPERATIVO,
    fechaBaja: null,
    estadoCobro: def.estadoCobro,
    tipoPago: def.tipoPago,
    compradorId: def.compradorId,
    inmobiliariaId: def.inmobiliariaId,
    plazoEscritura: def.estado === EstadoVenta.CON_BOLETO ? daysFromNow(60) : null,
    fechaEscrituraReal: def.estado === EstadoVenta.ESCRITURADO ? daysFromNow(-5) : null,
    fechaCancelacion: def.estado === EstadoVenta.CANCELADA ? daysFromNow(-10) : null,
    motivoCancelacion: def.estado === EstadoVenta.CANCELADA ? "Desistimiento del comprador (QA)" : null,
  };
  const venta = await prisma.venta.upsert({
    where: { numero: def.numero },
    update: { ...data, compradores: { set: compradores } },
    create: { numero: def.numero, ...data, compradores: { connect: compradores } },
  });
  registrar(dato, venta.id, casos);
  return venta;
}

// Plan v1 REEMPLAZADO + plan v2 VIGENTE con 3 cuotas: PAGA, PAGO_PARCIAL con recargo y PENDIENTE.
async function seedPagos(ventaId: number) {
  await prisma.pagoRegistrado.deleteMany({ where: { ventaId } });

  const planBase = { ventaId, moneda: Moneda.USD, fechaInicio: daysFromNow(-60), createdBy: QA_USERS.ADMIN.email };
  const planV1 = await prisma.planPago.upsert({
    where: { ventaId_version: { ventaId, version: 1 } },
    update: { estadoPlan: EstadoPlanPago.REEMPLAZADO, esVigente: false },
    create: {
      ...planBase, version: 1, nombre: "Plan original (QA)", estadoPlan: EstadoPlanPago.REEMPLAZADO, esVigente: false,
      tipoFinanciacion: TipoFinanciacion.CUOTAS_FIJAS, cantidadCuotas: 2, montoTotalPlanificado: 30000, montoFinanciado: 30000,
    },
  });
  const planV2 = await prisma.planPago.upsert({
    where: { ventaId_version: { ventaId, version: 2 } },
    update: { estadoPlan: EstadoPlanPago.VIGENTE, esVigente: true },
    create: {
      ...planBase, version: 2, nombre: "Plan reemplazo (QA)", estadoPlan: EstadoPlanPago.VIGENTE, esVigente: true,
      tipoFinanciacion: TipoFinanciacion.ANTICIPO_CUOTAS, cantidadCuotas: 3, montoAnticipo: 10000,
      montoTotalPlanificado: 30000, montoFinanciado: 20000,
    },
  });

  const cuotasV1 = [
    { numeroCuota: 1, monto: 15000, venc: -40 },
    { numeroCuota: 2, monto: 15000, venc: -10 },
  ];
  for (const c of cuotasV1) {
    await prisma.cuotaPlanPago.upsert({
      where: { planPagoId_numeroCuota: { planPagoId: planV1.id, numeroCuota: c.numeroCuota } },
      update: {},
      create: {
        planPagoId: planV1.id, numeroCuota: c.numeroCuota, tipoCuota: TipoCuota.CUOTA, fechaVencimiento: daysFromNow(c.venc),
        montoOriginal: c.monto, montoTotalExigible: c.monto, saldoPendiente: c.monto,
      },
    });
  }

  const cuotasV2 = [
    { numeroCuota: 1, tipo: TipoCuota.ANTICIPO, original: 10000, recargo: 0, pagado: 10000, estado: EstadoCuota.PAGA, venc: -30 },
    { numeroCuota: 2, tipo: TipoCuota.CUOTA, original: 10000, recargo: 500, pagado: 4000, estado: EstadoCuota.PAGO_PARCIAL, venc: -5 },
    { numeroCuota: 3, tipo: TipoCuota.CUOTA, original: 10000, recargo: 0, pagado: 0, estado: EstadoCuota.PENDIENTE, venc: 25 },
  ];
  const cuotas: Record<number, number> = {};
  for (const c of cuotasV2) {
    const exigible = c.original + c.recargo;
    const data = {
      tipoCuota: c.tipo, fechaVencimiento: daysFromNow(c.venc), montoOriginal: c.original, montoRecargoManual: c.recargo,
      montoTotalExigible: exigible, montoPagado: c.pagado, saldoPendiente: exigible - c.pagado, estadoCuota: c.estado,
      fechaPagoCompleto: c.estado === EstadoCuota.PAGA ? daysFromNow(-30) : null,
      motivoRecargo: c.recargo > 0 ? "Recargo por mora (QA)" : null,
      recargoAplicadoBy: c.recargo > 0 ? QA_USERS.ADMIN.email : null,
      fechaAplicacionRecargo: c.recargo > 0 ? daysFromNow(-2) : null,
    };
    const cuota = await prisma.cuotaPlanPago.upsert({
      where: { planPagoId_numeroCuota: { planPagoId: planV2.id, numeroCuota: c.numeroCuota } },
      update: data,
      create: { planPagoId: planV2.id, numeroCuota: c.numeroCuota, ...data },
    });
    cuotas[c.numeroCuota] = cuota.id;
  }

  await prisma.pagoRegistrado.createMany({
    data: [
      { ventaId, planPagoId: planV2.id, cuotaId: cuotas[1], fechaPago: daysFromNow(-30), monto: 10000, medioPago: MedioPago.TRANSFERENCIA, referencia: "QA-PAGO-1", registradoBy: QA_USERS.ADMIN.email },
      { ventaId, planPagoId: planV2.id, cuotaId: cuotas[2], fechaPago: daysFromNow(-3), monto: 4000, medioPago: MedioPago.EFECTIVO, referencia: "QA-PAGO-2", registradoBy: QA_USERS.ADMIN.email },
    ],
  });
  registrar("Plan de pago VIGENTE v2 (3 cuotas: PAGA, PAGO_PARCIAL+recargo, PENDIENTE)", planV2.id, "PAG-* (plan vigente, pago parcial, cuota paga, recargo)");
  registrar("Plan de pago REEMPLAZADO v1", planV1.id, "PAG-* (plan reemplazado)");
}

// ===================
// Archivos (solo metadata: el entorno QA no tiene storage)
// ===================

async function upsertArchivo(
  def: { nombre: string; tipo: TiposArchivos; loteId: number; ventaId?: number | null; aprobacion?: boolean },
  dato: string,
  casos: string,
) {
  const data = {
    linkArchivo: `qa/lote-${def.loteId}/${def.nombre}`,
    tipo: def.tipo,
    idLoteAsociado: def.loteId,
    ventaId: def.ventaId ?? null,
    uploadedBy: QA_USERS.ADMIN.email,
    estadoOperativo: EstadoOperativo.OPERATIVO,
    fechaBaja: null,
    deletedBy: null,
    estadoAprobacionComision: def.aprobacion ? EstadoAprobacionPlano.PENDIENTE : null,
    estadoAprobacionMunicipio: def.aprobacion ? EstadoAprobacionPlano.PENDIENTE : null,
  };
  const existing = await prisma.archivos.findFirst({ where: { nombreArchivo: def.nombre } });
  const archivo = existing
    ? await prisma.archivos.update({ where: { id: existing.id }, data })
    : await prisma.archivos.create({ data: { nombreArchivo: def.nombre, ...data } });
  registrar(dato, archivo.id, casos);
  return archivo;
}

// ===================
// Main
// ===================

async function main() {
  await assertQaDatabase();
  console.log(`\n=== SEED QA sobre ${process.env.QA_DB_NAME} (local) ===`);

  if (process.argv.includes("--base")) {
    await runBaseSeeds();
  }
  await assertBaseSeeds();

  // --- Cuentas ---
  const users = {} as Record<QaUserKey, { id: number }>;
  for (const key of Object.keys(QA_USERS) as QaUserKey[]) {
    users[key] = await upsertUser(key);
  }
  const inmoA = await upsertInmobiliaria(users.INMO_A.id, "QA Inmobiliaria A", "Tenant A");
  const inmoB = await upsertInmobiliaria(users.INMO_B.id, "QA Inmobiliaria B", "Tenant B (ajeno para A); ACC-13/INM-09");
  const A = { id: inmoA.id, nombre: inmoA.nombre };
  const B = { id: inmoB.id, nombre: inmoB.nombre };

  // --- Personas ---
  const pFisica = await upsertPersona({ tipo: IdentificadorTipo.DNI, valor: "90000001", nombre: "Fisica", apellido: "QA" }, "Persona física activa (global)", "PER-*");
  await upsertPersona({ tipo: IdentificadorTipo.CUIT, valor: "30900000011", razonSocial: "QA Juridica SA" }, "Persona jurídica (global)", "PER-*");
  const pClienteA = await upsertPersona({ tipo: IdentificadorTipo.DNI, valor: "90000002", nombre: "ClienteA", apellido: "QA", inmobiliariaId: A.id }, "Cliente de A", "PER-02, RES-*");
  const pClienteB = await upsertPersona({ tipo: IdentificadorTipo.DNI, valor: "90000003", nombre: "ClienteB", apellido: "QA", inmobiliariaId: B.id }, "Cliente de B (ajeno para A)", "PER-02, GEN-12");
  const pPropietario = await upsertPersona({ tipo: IdentificadorTipo.DNI, valor: "90000004", nombre: "Propietario", apellido: "QA" }, "Propietario de los lotes QA", "PER-*, LOT-*");
  await upsertPersona({ tipo: IdentificadorTipo.DNI, valor: "90000005", nombre: "InactivaA", apellido: "QA", inmobiliariaId: A.id, estado: EstadoOperativo.ELIMINADO }, "Persona inactiva (cliente de A)", "PER-* (inactiva)");
  const pInquilino = await upsertPersona({ tipo: IdentificadorTipo.DNI, valor: "90000006", nombre: "Inquilino", apellido: "QA" }, "Inquilino (alquiler activo)", "PER-*, LOT-* (alquiler)");
  const pTitular = await upsertPersona({ tipo: IdentificadorTipo.DNI, valor: "90000007", nombre: "Titular", apellido: "QA" }, "Titular de grupo familiar", "PER-* (grupo familiar)");
  await upsertPersona(
    { tipo: IdentificadorTipo.DNI, valor: "90000008", nombre: "Miembro", apellido: "QA", categoria: PersonaCategoria.MIEMBRO_FAMILIAR, jefeDeFamiliaId: pTitular.id },
    "Miembro familiar (del titular)", "PER-* (grupo familiar)",
  );
  const pCoComprador = await upsertPersona({ tipo: IdentificadorTipo.DNI, valor: "90000009", nombre: "CoComprador", apellido: "QA", inmobiliariaId: A.id }, "Co-comprador (venta INICIADA de A)", "VEN-*, PER-* (borrado con co-compra)");

  // --- Fracciones (4 y 7 existen en el SVG del mapa) ---
  const fraccion4 = await prisma.fraccion.upsert({ where: { numero: 4 }, update: {}, create: { numero: 4 } });
  const fraccion7 = await prisma.fraccion.upsert({ where: { numero: 7 }, update: {}, create: { numero: 7 } });
  registrar("Fracción 4", fraccion4.id, "LOT-*, MAP-*");
  registrar("Fracción 7", fraccion7.id, "LOT-*, MAP-*");

  // --- Lotes ---
  const prop = pPropietario.id;
  const lote = (n: number, estado: EstadoLote, extra: Partial<LoteDef> = {}): LoteDef => ({
    mapId: `Lote${n}-4`, descripcion: `[QA] Lote${n}-4`, numero: n, fraccionId: fraccion4.id, estado, propietarioId: prop,
    calle: NombreCalle.MILANO, numeroCalle: 400 + n, ...extra,
  });

  const lDisponible = await upsertLote(lote(1, EstadoLote.DISPONIBLE), "Lote DISPONIBLE", "LOT-*, RES-*, PRI-07");
  await upsertLote(lote(2, EstadoLote.DISPONIBLE, { deuda: true }), "Lote DISPONIBLE con deuda", "LOT-04 (filtro deudor)");
  await upsertLote(lote(3, EstadoLote.NO_DISPONIBLE), "Lote NO_DISPONIBLE", "LOT-03");
  const lVendidoEscr = await upsertLote(lote(4, EstadoLote.VENDIDO), "Lote VENDIDO (venta ESCRITURADO de A)", "VEN-*");
  const lReservadoA = await upsertLote(lote(5, EstadoLote.RESERVADO), "Lote RESERVADO (reserva ACTIVA de A)", "RES-*");
  const lPromo = await upsertLote(lote(6, EstadoLote.EN_PROMOCION, { precio: 28000 }), "Lote EN_PROMOCION (vigente)", "LOT-*");
  const lPriCclf = await upsertLote(lote(7, EstadoLote.CON_PRIORIDAD), "Lote CON_PRIORIDAD (CCLF)", "PRI-*");
  const lPriA = await upsertLote(lote(8, EstadoLote.CON_PRIORIDAD), "Lote CON_PRIORIDAD (A)", "PRI-*");
  const lPriB = await upsertLote(lote(9, EstadoLote.CON_PRIORIDAD), "Lote CON_PRIORIDAD (B)", "PRI-11");
  await upsertLote(
    lote(10, EstadoLote.DISPONIBLE, { tipo: TipoLote.ESPACIO_COMUN, nombreEspacioComun: "QA Club House", capacidad: 80 }),
    "Espacio común", "LOT-*",
  );
  const lAlquilado = await upsertLote(lote(11, EstadoLote.DISPONIBLE, { alquiler: true }), "Lote con alquiler ACTIVO", "LOT-* (ocupación)");
  const lResAAceptada = await upsertLote(lote(12, EstadoLote.RESERVADO), "Lote reserva ACEPTADA de A", "RES-*");
  const lResARechazada = await upsertLote(lote(13, EstadoLote.DISPONIBLE), "Lote reserva RECHAZADA de A", "RES-*");
  const lResAExpirada = await upsertLote(lote(14, EstadoLote.DISPONIBLE), "Lote reserva EXPIRADA de A", "RES-*");
  const lResAEliminada = await upsertLote(lote(15, EstadoLote.DISPONIBLE), "Lote reserva ELIMINADA de A", "RES-*");
  const lResBActiva = await upsertLote(lote(16, EstadoLote.RESERVADO), "Lote reserva ACTIVA de B", "RES-01, GEN-12");
  const lResBAceptada = await upsertLote(lote(17, EstadoLote.RESERVADO), "Lote reserva ACEPTADA de B", "RES-*");
  const lResBRechazada = await upsertLote(lote(18, EstadoLote.DISPONIBLE), "Lote reserva RECHAZADA de B", "RES-27");
  const lResBExpirada = await upsertLote(lote(19, EstadoLote.DISPONIBLE), "Lote reserva EXPIRADA de B", "RES-*");
  const lResBEliminada = await upsertLote(lote(20, EstadoLote.DISPONIBLE), "Lote reserva ELIMINADA de B", "RES-27");
  const lPriVencida = await upsertLote(lote(21, EstadoLote.CON_PRIORIDAD), "Lote con prioridad VENCIDA (job)", "JOB-04");
  const lVentaIniciada = await upsertLote(lote(22, EstadoLote.VENDIDO), "Lote venta INICIADA de A (sin plan)", "VEN-*, PAG-* (venta sin plan)");
  const lVentaCancelada = await upsertLote(lote(23, EstadoLote.DISPONIBLE), "Lote venta CANCELADA de A", "VEN-*");
  const lVentaB = await upsertLote(lote(25, EstadoLote.VENDIDO), "Lote venta CON_BOLETO de B (archivos de B)", "DOC-11, GEN-12");
  const lVentaPagos = await upsertLote(lote(26, EstadoLote.VENDIDO), "Lote venta CON_BOLETO de A (con pagos)", "PAG-*, DOC-11");
  const lPromoVencida = await upsertLote(lote(27, EstadoLote.EN_PROMOCION, { precio: 25000 }), "Lote con promoción VENCIDA (job)", "JOB-03");
  const lResVencida = await upsertLote(lote(28, EstadoLote.RESERVADO), "Lote con reserva VENCIDA (job)", "JOB-02");
  await upsertLote(
    { descripcion: "[QA] Lote sin mapId", numero: 50, fraccionId: fraccion7.id, estado: EstadoLote.DISPONIBLE, propietarioId: prop, calle: NombreCalle.LORCA, numeroCalle: 750 },
    "Lote sin mapId", "MAP-* (lote fuera del mapa)",
  );
  await upsertLote(
    { mapId: "Lote1-7", descripcion: "[QA] Lote1-7 sin asociaciones", numero: 1, fraccionId: fraccion7.id, estado: EstadoLote.DISPONIBLE, propietarioId: prop, calle: NombreCalle.LORCA, numeroCalle: 701 },
    "Lote SIN asociaciones (eliminable)", "LOT-40, LOT-41",
  );

  // --- Alquiler activo ---
  const alquiler = await prisma.alquiler.findFirst({ where: { loteId: lAlquilado.id, estado: EstadoAlquiler.ACTIVO } });
  const alq = alquiler
    ? await prisma.alquiler.update({ where: { id: alquiler.id }, data: { inquilinoId: pInquilino.id, fechaFin: null } })
    : await prisma.alquiler.create({ data: { loteId: lAlquilado.id, inquilinoId: pInquilino.id, fechaInicio: daysFromNow(-90) } });
  registrar("Alquiler ACTIVO", alq.id, "LOT-* (ocupación ALQUILADO)");

  // --- Promociones: vigente y vencida (JOB-03) ---
  for (const [loteP, precioPromo, fin, dato, casos] of [
    [lPromo, 26000, daysFromNow(20), "Promoción vigente", "LOT-*"],
    [lPromoVencida, 23000, daysFromNow(-1), "Promoción VENCIDA (activa, fin pasado)", "JOB-03"],
  ] as const) {
    const existing = await prisma.promocion.findFirst({ where: { loteId: loteP.id, explicacion: { startsWith: "[QA]" } } });
    const data = {
      precioAnterior: 30000, precioPromocional: precioPromo, estadoAnterior: EstadoLote.DISPONIBLE,
      inicio: daysFromNow(-10), fin, activa: true, explicacion: `[QA] ${dato}`,
    };
    const promo = existing
      ? await prisma.promocion.update({ where: { id: existing.id }, data })
      : await prisma.promocion.create({ data: { loteId: loteP.id, ...data } });
    registrar(dato, promo.id, casos);
  }

  // --- Reservas de A y de B ---
  const reservasDe = async (inm: typeof A, cliente: number, sufijo: "A" | "B", lotes: Record<string, { id: number }>) => {
    const r = {
      activa: await upsertReserva({ numero: `QA-RES-${sufijo}-ACTIVA`, loteId: lotes.activa.id, clienteId: cliente, inmobiliaria: inm, estado: EstadoReserva.ACTIVA, fechaReserva: daysFromNow(-2), fechaFinReserva: daysFromNow(10), ofertaInicial: 28000 }, `Reserva ACTIVA de ${sufijo}`, sufijo === "B" ? "RES-01, GEN-12" : "RES-*"),
      aceptada: await upsertReserva({ numero: `QA-RES-${sufijo}-ACEPTADA`, loteId: lotes.aceptada.id, clienteId: cliente, inmobiliaria: inm, estado: EstadoReserva.ACEPTADA, fechaReserva: daysFromNow(-8), fechaFinReserva: daysFromNow(5), ofertaInicial: 27000, contraofertaCclf: 29000 }, `Reserva ACEPTADA de ${sufijo} (con contraoferta)`, "RES-*"),
      rechazada: await upsertReserva({ numero: `QA-RES-${sufijo}-RECHAZADA`, loteId: lotes.rechazada.id, clienteId: cliente, inmobiliaria: inm, estado: EstadoReserva.RECHAZADA, fechaReserva: daysFromNow(-6), fechaFinReserva: daysFromNow(4), ofertaInicial: 15000 }, `Reserva RECHAZADA de ${sufijo}`, sufijo === "B" ? "RES-27 (eliminar ajena)" : "RES-*"),
      expirada: await upsertReserva({ numero: `QA-RES-${sufijo}-EXPIRADA`, loteId: lotes.expirada.id, clienteId: cliente, inmobiliaria: inm, estado: EstadoReserva.EXPIRADA, fechaReserva: daysFromNow(-30), fechaFinReserva: daysFromNow(-20), ofertaInicial: 20000 }, `Reserva EXPIRADA de ${sufijo}`, "RES-*"),
      eliminada: await upsertReserva({ numero: `QA-RES-${sufijo}-ELIMINADA`, loteId: lotes.eliminada.id, clienteId: cliente, inmobiliaria: inm, estado: EstadoReserva.CANCELADA, estadoOperativo: EstadoOperativo.ELIMINADO, fechaReserva: daysFromNow(-15), fechaFinReserva: daysFromNow(-8), ofertaInicial: 18000 }, `Reserva ELIMINADA (estadoOperativo) de ${sufijo}`, sufijo === "B" ? "RES-27 (reactivar ajena)" : "RES-*"),
    };
    return r;
  };
  await reservasDe(A, pClienteA.id, "A", { activa: lReservadoA, aceptada: lResAAceptada, rechazada: lResARechazada, expirada: lResAExpirada, eliminada: lResAEliminada });
  await reservasDe(B, pClienteB.id, "B", { activa: lResBActiva, aceptada: lResBAceptada, rechazada: lResBRechazada, expirada: lResBExpirada, eliminada: lResBEliminada });
  await upsertReserva(
    { numero: "QA-RES-A-VENCIDA", loteId: lResVencida.id, clienteId: pClienteA.id, inmobiliaria: A, estado: EstadoReserva.ACTIVA, fechaReserva: daysFromNow(-12), fechaFinReserva: daysFromNow(-1), ofertaInicial: 26000 },
    "Reserva ACTIVA VENCIDA (job)", "JOB-02",
  );

  // --- Prioridades ---
  await upsertPrioridad({ numero: "QA-PRI-CCLF", loteId: lPriCclf.id, owner: OwnerPrioridad.CCLF, inmobiliariaId: null, fechaInicio: daysFromNow(-1), fechaFin: daysFromNow(7) }, "Prioridad ACTIVA CCLF", "PRI-*");
  await upsertPrioridad({ numero: "QA-PRI-A", loteId: lPriA.id, owner: OwnerPrioridad.INMOBILIARIA, inmobiliariaId: A.id, fechaInicio: daysFromNow(-1), fechaFin: daysFromNow(7) }, "Prioridad ACTIVA de A", "PRI-*");
  await upsertPrioridad({ numero: "QA-PRI-B", loteId: lPriB.id, owner: OwnerPrioridad.INMOBILIARIA, inmobiliariaId: B.id, fechaInicio: daysFromNow(-1), fechaFin: daysFromNow(7) }, "Prioridad ACTIVA de B", "PRI-11, GEN-12");
  await upsertPrioridad({ numero: "QA-PRI-A-VENCIDA", loteId: lPriVencida.id, owner: OwnerPrioridad.INMOBILIARIA, inmobiliariaId: A.id, fechaInicio: daysFromNow(-5), fechaFin: daysFromNow(-1) }, "Prioridad ACTIVA VENCIDA (job)", "JOB-04");

  // --- Ventas ---
  await upsertVenta({ numero: "QA-VEN-A-INICIADA", loteId: lVentaIniciada.id, inmobiliariaId: A.id, compradorId: pClienteA.id, coCompradorIds: [pCoComprador.id], estado: EstadoVenta.INICIADA, estadoCobro: EstadoCobro.PENDIENTE, monto: 31000, tipoPago: "CONTADO" }, "Venta INICIADA de A (sin plan, con co-comprador)", "VEN-*, PAG-* (sin plan)");
  await upsertVenta({ numero: "QA-VEN-A-CANCELADA", loteId: lVentaCancelada.id, inmobiliariaId: A.id, compradorId: pClienteA.id, estado: EstadoVenta.CANCELADA, estadoCobro: EstadoCobro.PENDIENTE, monto: 29000, tipoPago: "CUOTAS" }, "Venta CANCELADA de A", "VEN-*");
  await upsertVenta({ numero: "QA-VEN-A-ESCRITURADO", loteId: lVendidoEscr.id, inmobiliariaId: A.id, compradorId: pClienteA.id, estado: EstadoVenta.ESCRITURADO, estadoCobro: EstadoCobro.PAGO_COMPLETO, monto: 32000, tipoPago: "TRANSFERENCIA" }, "Venta ESCRITURADO de A", "VEN-*");
  const ventaPagos = await upsertVenta({ numero: "QA-VEN-A-PAGOS", loteId: lVentaPagos.id, inmobiliariaId: A.id, compradorId: pClienteA.id, estado: EstadoVenta.CON_BOLETO, estadoCobro: EstadoCobro.EN_CURSO, monto: 30000, tipoPago: "CUOTAS" }, "Venta CON_BOLETO de A (con plan y pagos)", "PAG-*, VEN-17, DOC-11");
  const ventaB = await upsertVenta({ numero: "QA-VEN-B-BOLETO", loteId: lVentaB.id, inmobiliariaId: B.id, compradorId: pClienteB.id, estado: EstadoVenta.CON_BOLETO, estadoCobro: EstadoCobro.EN_CURSO, monto: 33000, tipoPago: "TRANSFERENCIA" }, "Venta CON_BOLETO de B", "DOC-11, GEN-12");
  await seedPagos(ventaPagos.id);

  // --- Archivos (metadata) ---
  await upsertArchivo({ nombre: "qa-imagen-lote1.jpg", tipo: TiposArchivos.IMAGEN, loteId: lDisponible.id }, "Archivo IMAGEN (lote disponible)", "DOC-*");
  await upsertArchivo({ nombre: "qa-plano-lote1.pdf", tipo: TiposArchivos.PLANO, loteId: lDisponible.id, aprobacion: true }, "Archivo PLANO con aprobaciones PENDIENTE", "DOC-18, DOC-24");
  await upsertArchivo({ nombre: "qa-boleto-a.pdf", tipo: TiposArchivos.BOLETO, loteId: lVentaPagos.id, ventaId: ventaPagos.id }, "Archivo BOLETO de A", "DOC-11");
  await upsertArchivo({ nombre: "qa-imagen-lote-b.jpg", tipo: TiposArchivos.IMAGEN, loteId: lVentaB.id }, "Archivo IMAGEN (lote de venta B)", "DOC-11");
  await upsertArchivo({ nombre: "qa-plano-lote-b.pdf", tipo: TiposArchivos.PLANO, loteId: lVentaB.id }, "Archivo PLANO (lote de venta B)", "DOC-11");
  await upsertArchivo({ nombre: "qa-boleto-b.pdf", tipo: TiposArchivos.BOLETO, loteId: lVentaB.id, ventaId: ventaB.id }, "Archivo BOLETO de B", "DOC-11, GEN-12");

  // seed:core deja User_id_seq en su máximo propio (15): sin este ajuste, el próximo alta de usuario
  // por API chocaría con un id QA existente.
  await prisma.$executeRaw`SELECT setval('"User_id_seq"', (SELECT MAX(id) FROM "User"), true)`;

  console.log("\n=== DATO CLAVE → ID → CASO DE LA GUÍA ===");
  console.table(resumen.map((r) => ({ "Dato clave": r.dato, ID: r.id, "Casos": r.casos })));
  console.log("\n✅ seed:qa completado (contraseñas en Backend/.env.qa, no se imprimen).\n");
}

main()
  .catch((e) => {
    console.error("\n❌ ERROR en seed:qa:", e instanceof Prisma.PrismaClientKnownRequestError ? `${e.code} ${JSON.stringify(e.meta)}` : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
