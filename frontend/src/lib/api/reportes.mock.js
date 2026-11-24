// src/lib/api/reportes.mock.js
// Datos simulados del módulo Reportes (contrato CCLF-37). TEMPORAL: se borra en la tarea 39.6
// junto con el import dinámico y la variable VITE_REPORTES_MOCK de reportes.js.
//
// - Las tres funciones devuelven la misma forma que `data` de la API real y lanzan el mismo
//   error 400 (VALIDATION_ERROR) ante parámetros inválidos.
// - Respetan los filtros y recalculan los totales a partir de las filas filtradas.
// - Las fechas de las ventas son relativas al día de corte (hoy en Buenos Aires), así que
//   siempre hay datos en los períodos recientes.
// - Montos: string decimal con 2 cifras; internamente se suman en centavos enteros.

const DELAY_MS = 400; // para poder ver el estado de carga

const ESTADOS_LOTE = [
  "OPERATIVO", "ELIMINADO", "ALQUILADO", "CON_PRIORIDAD", "DISPONIBLE",
  "EN_PROMOCION", "NO_DISPONIBLE", "RESERVADO", "VENDIDO",
];
const SUBESTADOS = ["CONSTRUIDO", "NO_CONSTRUIDO", "EN_CONSTRUCCION"];
const MONEDAS = ["ARS", "USD"];
const MAX_DIAS_PERIODO = 366;
const MS_POR_DIA = 86_400_000;

/* ------------------------------ utilidades ------------------------------ */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Día actual en America/Argentina/Buenos_Aires, YYYY-MM-DD. */
function fechaCorte() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const addDays = (ymd, n) => new Date(Date.parse(ymd) + n * MS_POR_DIA).toISOString().slice(0, 10);
const diasInclusivos = (desde, hasta) => Math.round((Date.parse(hasta) - Date.parse(desde)) / MS_POR_DIA) + 1;
const toCents = (s) => Math.round(Number(s) * 100);
const fromCents = (c) => (c / 100).toFixed(2);

const vacio = (v) => v === undefined || v === null || v === "";
const esFechaValida = (s) =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const esIdValido = (v) => /^[1-9]\d*$/.test(String(v));

/** Mismo contrato de error que el validador del backend (400 VALIDATION_ERROR). */
function validationError(errors) {
  const response = { success: false, code: "VALIDATION_ERROR", message: "Datos inválidos", errors };
  const err = new Error(response.message);
  err.statusCode = 400;
  err.response = response;
  return err;
}

/** Valida el filtro `fraccion` (opcional; es el id, no el número visible) y lo devuelve como número, o null. */
function parseFraccion(valor, errors) {
  if (vacio(valor)) return null;
  if (!esIdValido(valor)) {
    errors.push({ field: "fraccion", message: "Debe ser un entero positivo" });
    return null;
  }
  return Number(valor);
}

/* ------------------------------- inventario ------------------------------ */
// Id de cada fracción según su número visible. Distintos a propósito: si algo confunde
// `fraccionId` con `fraccion`, el filtro no devuelve filas y se nota.
const FRACCION_ID = { 1: 11, 2: 12, 3: 13 };

// [loteId, fracción (número visible), nro de lote, estado, subestado, precio]
// Solo LOTE_VENTA. El lote 9040 tiene numero y precio nulos (Lote.numero y Lote.precio son
// anulables en Prisma): la interfaz tiene que tolerarlo.
//
// Los loteId viven en 9001+ a propósito: con ids bajos chocaban con los de la base real, y
// "Ver lote" abría un lote verdadero que no tenía nada que ver con el reporte simulado.
const LOTES = [
  [9001, 1, 1, "VENDIDO", "CONSTRUIDO", "92000.00"],
  [9002, 1, 2, "DISPONIBLE", "CONSTRUIDO", "88000.00"],
  [9003, 1, 3, "DISPONIBLE", "NO_CONSTRUIDO", "54000.00"],
  [9004, 1, 4, "VENDIDO", "CONSTRUIDO", "95000.00"],
  [9005, 1, 5, "RESERVADO", "EN_CONSTRUCCION", "61000.00"],
  [9006, 1, 6, "EN_PROMOCION", "NO_CONSTRUIDO", "49500.00"],
  [9008, 1, 8, "VENDIDO", "EN_CONSTRUCCION", "72000.00"],
  [9040, 1, null, "NO_DISPONIBLE", "NO_CONSTRUIDO", null],
  [9020, 2, 41, "VENDIDO", "CONSTRUIDO", "85000.00"],
  [9021, 2, 42, "VENDIDO", "CONSTRUIDO", "87000.00"],
  [9022, 2, 43, "CON_PRIORIDAD", "NO_CONSTRUIDO", "56000.00"],
  [9023, 2, 44, "VENDIDO", "EN_CONSTRUCCION", "78000.00"],
  [9028, 2, 45, "DISPONIBLE", "CONSTRUIDO", "85000.00"],
  [9029, 2, 46, "VENDIDO", "CONSTRUIDO", "79900.00"],
  [9030, 2, 47, "RESERVADO", "CONSTRUIDO", "91000.00"],
  [9031, 2, 48, "ALQUILADO", "CONSTRUIDO", "98000.00"],
  [9050, 3, 101, "DISPONIBLE", "NO_CONSTRUIDO", "43000.00"],
  [9051, 3, 102, "VENDIDO", "NO_CONSTRUIDO", "43500.00"],
  [9052, 3, 103, "VENDIDO", "NO_CONSTRUIDO", "44000.00"],
  [9053, 3, 104, "EN_PROMOCION", "EN_CONSTRUCCION", "52000.00"],
  [9054, 3, 105, "RESERVADO", "NO_CONSTRUIDO", "45000.00"],
  [9055, 3, 106, "NO_DISPONIBLE", "NO_CONSTRUIDO", "46000.00"],
  [9056, 3, 107, "VENDIDO", "CONSTRUIDO", "69000.00"],
  [9057, 3, 108, "DISPONIBLE", "CONSTRUIDO", "71000.00"],
].map(([loteId, fraccion, numero, estado, subestado, precio]) => ({
  loteId,
  numero,
  fraccionId: FRACCION_ID[fraccion],
  fraccion,
  estado,
  subestado,
  precio,
}));

const LOTE_POR_ID = new Map(LOTES.map((l) => [l.loteId, l]));

/**
 * Catálogo de fracciones del inventario simulado, con los mismos ids que usan sus filas.
 * Equivale a GET /fracciones, normalizado a { id, numero }.
 * @returns {Promise<Array<{id: number, numero: number}>>}
 */
export async function getFracciones() {
  await sleep(DELAY_MS);
  return Object.entries(FRACCION_ID)
    .map(([numero, id]) => ({ id, numero: Number(numero) }))
    .sort((a, b) => a.numero - b.numero);
}

const ordenEn = (lista, valor) => lista.indexOf(valor);

/** Cuenta filas por `campo` y devuelve [{[campo]: valor, cantidad}] solo con cantidades > 0. */
function contarPor(filas, campo, comparar) {
  const cuenta = new Map();
  filas.forEach((f) => cuenta.set(f[campo], (cuenta.get(f[campo]) ?? 0) + 1));
  return [...cuenta.entries()]
    .sort(([a], [b]) => comparar(a, b))
    .map(([valor, cantidad]) => ({ [campo]: valor, cantidad }));
}

/** Ofrecible: DISPONIBLE o EN_PROMOCION, con cualquier subestado. */
const esOfrecible = (f) => f.estado === "DISPONIBLE" || f.estado === "EN_PROMOCION";

/** Totales por fracción, agrupados por id y ordenados por número visible. */
function totalesPorFraccion(filas) {
  const porId = new Map();
  filas.forEach((f) => {
    const t = porId.get(f.fraccionId) ?? { fraccionId: f.fraccionId, fraccion: f.fraccion, cantidad: 0, ofrecibles: 0 };
    t.cantidad += 1;
    if (esOfrecible(f)) t.ofrecibles += 1;
    porId.set(f.fraccionId, t);
  });
  return [...porId.values()].sort((a, b) => a.fraccion - b.fraccion || a.fraccionId - b.fraccionId);
}

/** Mismo orden que el backend: número de fracción, número de lote (null al final), id. */
function compararLotes(a, b) {
  if (a.fraccion !== b.fraccion) return a.fraccion - b.fraccion;
  if (a.numero !== b.numero) {
    if (a.numero === null) return 1;
    if (b.numero === null) return -1;
    return a.numero - b.numero;
  }
  return a.loteId - b.loteId;
}

/**
 * Inventario de lotes (GET /reportes/inventario).
 * @param {{fraccion?: number|string, estado?: string, subestado?: string}} [filtros]
 */
export async function getInventario({ fraccion, estado, subestado } = {}) {
  await sleep(DELAY_MS);

  const errors = [];
  const fraccionId = parseFraccion(fraccion, errors);
  if (!vacio(estado) && !ESTADOS_LOTE.includes(estado)) {
    errors.push({ field: "estado", message: `Valor inválido. Opciones: ${ESTADOS_LOTE.join(", ")}` });
  }
  if (!vacio(subestado) && !SUBESTADOS.includes(subestado)) {
    errors.push({ field: "subestado", message: `Valor inválido. Opciones: ${SUBESTADOS.join(", ")}` });
  }
  if (errors.length) throw validationError(errors);

  const filas = LOTES
    .filter((l) => fraccionId == null || l.fraccionId === fraccionId)
    .filter((l) => vacio(estado) || l.estado === estado)
    .filter((l) => vacio(subestado) || l.subestado === subestado)
    .sort(compararLotes)
    .map((l) => ({
      loteId: l.loteId,
      numero: l.numero,
      fraccionId: l.fraccionId,
      fraccion: l.fraccion,
      estado: l.estado,
      subestado: l.subestado,
      precio: l.precio,
      enlace: `/?lote=${l.loteId}`,
    }));

  return {
    corte: fechaCorte(),
    totales: {
      porEstado: contarPor(filas, "estado", (a, b) => ordenEn(ESTADOS_LOTE, a) - ordenEn(ESTADOS_LOTE, b)),
      porFraccion: totalesPorFraccion(filas),
      porSubestado: contarPor(filas, "subestado", (a, b) => ordenEn(SUBESTADOS, a) - ordenEn(SUBESTADOS, b)),
      ofrecibles: filas.filter(esOfrecible).length,
    },
    filas,
  };
}

/* --------------------------------- ventas -------------------------------- */
// [ventaId, numero, loteId, altaHaceDias, escrituraHaceDias, cancelacionHaceDias, estado, montoUSD]
// Los desplazamientos son días antes del corte (null = sin esa fecha).
// Las ventas 291-294 son antiguas: solo entran en períodos largos y alimentan las cuotas en ARS.
const VENTAS = [
  [291, "CCLF-2025-04", 9021, 300, 290, null, "ESCRITURADO", "87000.00"],
  [292, "CCLF-2025-09", 9008, 280, 270, null, "ESCRITURADO", "72000.00"],
  [293, "CCLF-2025-15", 9051, 250, 240, null, "ESCRITURADO", "43500.00"],
  [294, "CCLF-2025-21", 9029, 200, 190, null, "ESCRITURADO", "79900.00"],
  [301, "CCLF-2026-01", 9001, 105, 80, null, "ESCRITURADO", "92000.00"],
  [302, "CCLF-2026-02", 9004, 98, 64, null, "ESCRITURADO", "95000.00"],
  [303, "CCLF-2026-03", 9020, 75, 35, null, "ESCRITURADO", "85000.00"],
  [304, "CCLF-2026-04", 9023, 60, 8, null, "ESCRITURADO", "78000.00"],
  [305, "CCLF-2026-05", 9050, 52, null, 30, "CANCELADA", "43000.00"],
  [306, "CCLF-2026-06", 9056, 44, 12, null, "ESCRITURADO", "69000.00"],
  [307, "CCLF-2026-07", 9052, 40, null, null, "CON_BOLETO", "44000.00"],
  [308, "CCLF-2026-08", 9030, 28, null, null, "CON_BOLETO", "91000.00"],
  [309, "CCLF-2026-09", 9054, 24, null, null, "INICIADA", "45000.00"],
  [310, "CCLF-2026-10", 9002, 18, null, 6, "CANCELADA", "88000.00"],
  [311, "CCLF-2026-11", 9005, 9, null, null, "INICIADA", "61000.00"],
  [312, "CCLF-2026-12", 9003, 22, null, 3, "CANCELADA", "54000.00"],
  [313, "CCLF-2026-13", 9057, 70, null, 55, "CANCELADA", "71000.00"],
].map(([ventaId, numero, loteId, altaOff, escOff, cancOff, estado, monto]) => ({
  ventaId, numero, loteId, altaOff, escOff, cancOff, estado, montoCents: toCents(monto),
}));

const VENTA_POR_ID = new Map(VENTAS.map((v) => [v.ventaId, v]));

/** Ventas con sus fechas absolutas, calculadas contra el día de corte. */
function ventasHidratadas(corte, fraccionId) {
  const dia = (off) => (off == null ? null : addDays(corte, -off));
  return VENTAS
    .map((v) => {
      const lote = LOTE_POR_ID.get(v.loteId);
      return {
        ventaId: v.ventaId,
        numero: v.numero,
        loteId: v.loteId,
        loteNumero: lote.numero,
        fraccionId: lote.fraccionId, // solo para filtrar: no va en la fila
        fraccion: lote.fraccion,
        fechaAlta: dia(v.altaOff),
        fechaEscritura: dia(v.escOff),
        fechaCancelacion: dia(v.cancOff),
        estado: v.estado,
        montoCents: v.montoCents,
      };
    })
    .filter((v) => fraccionId == null || v.fraccionId === fraccionId);
}

/**
 * Ventas por período (GET /reportes/ventas). `desde` y `hasta` obligatorios, desde <= hasta,
 * máximo 366 días inclusive.
 * @param {{desde?: string, hasta?: string, fraccion?: number|string}} [filtros]
 */
export async function getVentas({ desde, hasta, fraccion } = {}) {
  await sleep(DELAY_MS);

  const errors = [];
  const fraccionId = parseFraccion(fraccion, errors);
  if (!esFechaValida(desde)) errors.push({ field: "desde", message: "Fecha inválida (formato YYYY-MM-DD)" });
  if (!esFechaValida(hasta)) errors.push({ field: "hasta", message: "Fecha inválida (formato YYYY-MM-DD)" });
  if (esFechaValida(desde) && esFechaValida(hasta)) {
    if (desde > hasta) {
      errors.push({ field: "hasta", message: "`desde` no puede ser posterior a `hasta`" });
    } else if (diasInclusivos(desde, hasta) > MAX_DIAS_PERIODO) {
      errors.push({ field: "hasta", message: `El período no puede superar ${MAX_DIAS_PERIODO} días` });
    }
  }
  if (errors.length) throw validationError(errors);

  const corte = fechaCorte();
  const periodo = { desde, hasta };
  // Tramo de igual duración que termina el día anterior a `desde`.
  const dias = diasInclusivos(desde, hasta);
  const periodoAnterior = { desde: addDays(desde, -dias), hasta: addDays(desde, -1) };

  const ventas = ventasHidratadas(corte, fraccionId);
  const enPeriodo = (fecha, p) => fecha != null && fecha >= p.desde && fecha <= p.hasta;

  // Cada tarjeta cuenta la venta por su propia fecha: iniciadas por alta, escrituradas por
  // escritura real y canceladas por cancelación. Una venta puede sumar en más de una tarjeta.
  const tarjeta = (campoFecha) => {
    const actuales = ventas.filter((v) => enPeriodo(v[campoFecha], periodo));
    const anteriores = ventas.filter((v) => enPeriodo(v[campoFecha], periodoAnterior));
    const suma = (lista) => lista.reduce((acc, v) => acc + v.montoCents, 0);
    return {
      cantidad: actuales.length,
      montoUSD: fromCents(suma(actuales)),
      cantidadAnterior: anteriores.length,
      montoUSDAnterior: fromCents(suma(anteriores)),
    };
  };

  const filas = ventas
    .filter((v) =>
      enPeriodo(v.fechaAlta, periodo) || enPeriodo(v.fechaEscritura, periodo) || enPeriodo(v.fechaCancelacion, periodo))
    .sort((a, b) => (a.fechaAlta < b.fechaAlta ? 1 : a.fechaAlta > b.fechaAlta ? -1 : b.ventaId - a.ventaId))
    .map((v) => ({
      ventaId: v.ventaId,
      numero: v.numero,
      loteId: v.loteId,
      loteNumero: v.loteNumero,
      fraccion: v.fraccion,
      fechaAlta: v.fechaAlta,
      fechaEscritura: v.fechaEscritura,
      fechaCancelacion: v.fechaCancelacion,
      estado: v.estado,
      montoUSD: fromCents(v.montoCents),
      enlace: `/ventas?openId=${v.ventaId}`,
    }));

  return {
    corte,
    periodo,
    periodoAnterior,
    tarjetas: {
      iniciadas: tarjeta("fechaAlta"),
      escrituradas: tarjeta("fechaEscritura"),
      canceladas: tarjeta("fechaCancelacion"),
    },
    otrasMonedas: [], // la entidad Venta no tiene moneda: siempre vacío
    filas,
  };
}

/* ----------------------------- cuotas vencidas ---------------------------- */
// [ventaId, moneda, cantidadCuotas, valorCuota, números de cuota impagas]
// La cuota n de una venta vence (altaHaceDias - 30 * n) días antes del corte, así que
// diasAtraso sale de la edad de la venta. La cuota 2 de la venta 304 vence justo el día de
// corte (60 - 30 * 2 = 0): NO está vencida y por eso no figura en la lista.
const PLANES = [
  [301, "USD", 36, "1200.00", [1, 2, 3]],
  [302, "USD", 36, "1250.00", [1, 2, 3]],
  [303, "USD", 24, "1500.00", [1, 2]],
  [304, "USD", 36, "1000.00", [1]],
  [306, "USD", 24, "900.00", [1]],
  [307, "USD", 12, "600.00", [1]],
  [294, "USD", 48, "800.00", [3, 4, 5, 6]],
  [291, "ARS", 60, "450000.00", [6, 7, 8, 9]],
  [292, "ARS", 60, "380000.00", [6, 7, 8, 9]],
  [293, "ARS", 48, "210000.00", [5, 6, 7, 8]],
];

const TRAMOS = ["1-30", "31-60", "+60"];
const tramoDe = (diasAtraso) => (diasAtraso <= 30 ? "1-30" : diasAtraso <= 60 ? "31-60" : "+60");

/** Todas las cuotas vencidas de los planes (con ids estables), antes de filtrar. */
function cuotasVencidas() {
  let cuotaId = 900;
  const filas = [];
  PLANES.forEach(([ventaId, moneda, cantidadCuotas, valor, impagas]) => {
    const venta = VENTA_POR_ID.get(ventaId);
    const lote = LOTE_POR_ID.get(venta.loteId);
    const valorCents = toCents(valor);
    impagas.forEach((numeroCuota) => {
      const diasAtraso = venta.altaOff - 30 * numeroCuota;
      // Saldo = cuota + recargo por mora (0,15 % por día de atraso).
      const saldoCents = valorCents + Math.round((valorCents * diasAtraso * 15) / 10000);
      filas.push({
        cuotaId: cuotaId++,
        moneda,
        ventaId,
        ventaNumero: venta.numero,
        loteId: venta.loteId,
        loteNumero: lote.numero,
        fraccionId: lote.fraccionId, // solo para filtrar: no va en la fila
        fraccion: lote.fraccion,
        numeroCuota,
        cantidadCuotas,
        diasAtraso,
        saldoCents,
      });
    });
  });
  return filas;
}

/**
 * Cuotas vencidas (GET /reportes/cuotas-vencidas). `moneda` obligatoria: ARS y USD no se mezclan.
 * @param {{moneda?: "ARS"|"USD", fraccion?: number|string}} [filtros]
 */
export async function getCuotasVencidas({ moneda, fraccion } = {}) {
  await sleep(DELAY_MS);

  const errors = [];
  const fraccionId = parseFraccion(fraccion, errors);
  if (vacio(moneda)) {
    errors.push({ field: "moneda", message: "La moneda es obligatoria (ARS o USD)" });
  } else if (!MONEDAS.includes(moneda)) {
    errors.push({ field: "moneda", message: `Valor inválido. Opciones: ${MONEDAS.join(", ")}` });
  }
  if (errors.length) throw validationError(errors);

  const corte = fechaCorte();
  const seleccion = cuotasVencidas()
    .filter((c) => c.moneda === moneda)
    .filter((c) => fraccionId == null || c.fraccionId === fraccionId)
    .sort((a, b) => b.diasAtraso - a.diasAtraso || a.cuotaId - b.cuotaId);

  const total = (lista) => lista.reduce((acc, c) => acc + c.saldoCents, 0);

  return {
    corte,
    moneda,
    saldoVencido: fromCents(total(seleccion)),
    cuotas: seleccion.length,
    ventas: new Set(seleccion.map((c) => c.ventaId)).size,
    // Siempre los tres tramos, aunque alguno quede en cero.
    tramos: TRAMOS.map((tramo) => {
      const delTramo = seleccion.filter((c) => tramoDe(c.diasAtraso) === tramo);
      return { tramo, cuotas: delTramo.length, saldo: fromCents(total(delTramo)) };
    }),
    filas: seleccion.map((c) => ({
      cuotaId: c.cuotaId,
      ventaId: c.ventaId,
      ventaNumero: c.ventaNumero,
      loteId: c.loteId,
      loteNumero: c.loteNumero,
      fraccion: c.fraccion,
      numeroCuota: c.numeroCuota,
      cantidadCuotas: c.cantidadCuotas,
      fechaVencimiento: addDays(corte, -c.diasAtraso),
      diasAtraso: c.diasAtraso,
      tramo: tramoDe(c.diasAtraso),
      saldoPendiente: fromCents(c.saldoCents),
      enlace: `/ventas/${c.ventaId}/pagos`,
    })),
  };
}
