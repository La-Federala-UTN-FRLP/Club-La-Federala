// src/components/Reportes/etiquetas.js
// Etiquetas y rótulos de los reportes (39.2 a 39.4).
//
// El resto de la app deriva el texto del enum con `toLowerCase()` + reemplazo de guiones
// bajos (StatusBadge.jsx y SubstatusBadge.jsx), y así pierde las tildes: "En promocion",
// "En construccion". Acá las etiquetas están escritas a mano y las claves son los valores
// del enum, de modo que no dependen de normalizar texto. Un valor que no esté en el mapa se
// humaniza (ver `humanizar`) en lugar de salir crudo o de romper.
//
// Sin componentes en este archivo: los que usan estas etiquetas viven en Insignias.jsx.

/** EstadoLote → etiqueta visible. */
export const ETIQUETA_ESTADO = {
  OPERATIVO: "Operativo",
  ELIMINADO: "Eliminado",
  ALQUILADO: "Alquilado",
  CON_PRIORIDAD: "Con prioridad",
  DISPONIBLE: "Disponible",
  EN_PROMOCION: "En promoción",
  NO_DISPONIBLE: "No disponible",
  RESERVADO: "Reservado",
  VENDIDO: "Vendido",
};

/** SubestadoLote → etiqueta visible. */
export const ETIQUETA_SUBESTADO = {
  CONSTRUIDO: "Construido",
  NO_CONSTRUIDO: "No construido",
  EN_CONSTRUCCION: "En construcción",
};

/**
 * EstadoVenta → etiqueta visible.
 *
 * Son los cuatro valores del enum, que es lo que devuelve el reporte en `filas[].estado`. La
 * tabla de Ventas muestra además FINALIZADA, que no está en el enum: lo deriva de ESCRITURADO
 * más el pago completo. El reporte no puede derivarlo, porque la fila no trae el estado de
 * cobro, así que una venta finalizada se ve acá como "Escriturada".
 */
export const ETIQUETA_ESTADO_VENTA = {
  INICIADA: "Iniciada",
  CON_BOLETO: "Con boleto",
  ESCRITURADO: "Escriturada",
  CANCELADA: "Cancelada",
};

/**
 * Valor de enum sin etiqueta a mano → texto legible: `NUEVO_ESTADO` → "Nuevo estado".
 * Nunca se muestra el valor crudo: si el backend agrega un estado, se ve presentable hasta
 * que alguien le escriba la etiqueta (con tilde, si lleva).
 */
const humanizar = (valor) => {
  const texto = String(valor).toLowerCase().replace(/_/g, " ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

// `Object.hasOwn` en lugar de `mapa[valor]`: con el acceso directo, un valor como
// "constructor" o "toString" devolvería una función heredada del prototipo en vez de caer en
// `humanizar`, y la tabla intentaría renderizarla.
const buscarEtiqueta = (mapa) => (valor) => {
  if (valor == null || valor === "") return "—";
  return Object.hasOwn(mapa, valor) ? mapa[valor] : humanizar(valor);
};

export const etiquetaEstado = buscarEtiqueta(ETIQUETA_ESTADO);
export const etiquetaSubestado = buscarEtiqueta(ETIQUETA_SUBESTADO);
export const etiquetaEstadoVenta = buscarEtiqueta(ETIQUETA_ESTADO_VENTA);

// Colores del subestado: replica el mapa de SubstatusBadge, que no lo exporta. Son las
// mismas variantes de `tl-badge`, sin colores nuevos. El estado reusa `getEstadoVariant`.
export const VARIANTE_SUBESTADO = {
  CONSTRUIDO: "success",
  NO_CONSTRUIDO: "danger",
  EN_CONSTRUCCION: "warn",
};

// Colores del estado de una venta, todos variantes de `tl-badge` definidas en TablaLotes.css.
//
// ESCRITURADO va en violeta para que se lea igual que en la tabla de Ventas, que lo muestra de
// ese color. Ahí la variante se llama "purple" y NO está definida en el CSS: solo se ve porque
// ese componente trae estilos inline propios. "violet" sí existe como clase y es el mismo tono,
// así que una insignia que solo ponga clases, como las de los reportes, se ve bien.
export const VARIANTE_ESTADO_VENTA = {
  INICIADA: "info",
  CON_BOLETO: "warn",
  ESCRITURADO: "violet",
  CANCELADA: "danger",
};

/** Rótulo del botón que dispara la consulta. Compartido por los tres reportes. */
export const BOTON_GENERAR = "Generar reporte";

// Montos de los reportes. `currencyDisplay: "code"` da "USD 85.000,00" y "ARS 38.500.000,00";
// el default de es-AR para USD es el símbolo "US$", que se confunde con pesos. Los dos
// formateadores se arman una sola vez, al cargar el módulo.
const FORMATO_MONEDA = {
  ARS: new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", currencyDisplay: "code" }),
  USD: new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", currencyDisplay: "code" }),
};

/**
 * Monto en la moneda que indica el backend (`filas[].moneda` del reporte de ventas, `moneda`
 * del de cuotas vencidas). Las monedas no se convierten ni se suman entre sí.
 *
 * Una moneda que no sea ARS ni USD da "—": el enum `Moneda` solo tiene esas dos, así que un
 * tercer valor es un dato que esta pantalla no sabe mostrar y no se inventa un formato.
 *
 * @param {string|number|null|undefined} valor - Decimal como string, p. ej. "85000.00"
 * @param {"ARS"|"USD"} moneda
 * @returns {string} El monto formateado, o "—"
 */
export function fmtMontoMoneda(valor, moneda) {
  if (!Object.hasOwn(FORMATO_MONEDA, moneda)) return "—";
  if (valor == null || valor === "") return "—";
  const n = Number(valor);
  if (Number.isNaN(n)) return "—";
  return FORMATO_MONEDA[moneda].format(n);
}

/**
 * Precio de un lote, siempre en USD: `Lote.precio` es un decimal sin moneda en el schema y las
 * operaciones del club son en dólares.
 *
 * Sin precio cargado se dice así, en lugar del guión que la tabla usa para una celda vacía: que
 * un lote no tenga precio es un dato, no una celda sin llenar.
 */
export function fmtPrecioUsd(valor) {
  if (valor == null || valor === "") return "Sin precio";
  const monto = fmtMontoMoneda(valor, "USD");
  return monto === "—" ? "Sin precio" : monto;
}

/**
 * Etiqueta visible de un lote: "Lote 3-2", el mismo formato que usa el resto de la app.
 * `Lote.numero` es opcional en el schema; sin número no hay etiqueta que mostrar, así que se
 * dice explícitamente en vez de exponer el id interno de la base.
 */
export function etiquetaLote(fraccion, numero) {
  if (numero == null) return "Sin número";
  return `Lote ${fraccion}-${numero}`;
}
