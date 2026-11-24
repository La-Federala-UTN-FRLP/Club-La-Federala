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
 * Valor de enum sin etiqueta a mano → texto legible: `NUEVO_ESTADO` → "Nuevo estado".
 * Nunca se muestra el valor crudo: si el backend agrega un estado, se ve presentable hasta
 * que alguien le escriba la etiqueta (con tilde, si lleva).
 */
const humanizar = (valor) => {
  const texto = String(valor).toLowerCase().replace(/_/g, " ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

const buscarEtiqueta = (mapa) => (valor) => {
  if (valor == null || valor === "") return "—";
  return mapa[valor] ?? humanizar(valor);
};

export const etiquetaEstado = buscarEtiqueta(ETIQUETA_ESTADO);
export const etiquetaSubestado = buscarEtiqueta(ETIQUETA_SUBESTADO);

// Colores del subestado: replica el mapa de SubstatusBadge, que no lo exporta. Son las
// mismas variantes de `tl-badge`, sin colores nuevos. El estado reusa `getEstadoVariant`.
export const VARIANTE_SUBESTADO = {
  CONSTRUIDO: "success",
  NO_CONSTRUIDO: "danger",
  EN_CONSTRUCCION: "warn",
};

/** Rótulo del botón que dispara la consulta. Compartido por los tres reportes. */
export const BOTON_GENERAR = "Generar";

// Precio del inventario: `Lote.precio` es un decimal sin moneda en el schema y las operaciones
// del club son en USD. `currencyDisplay: "code"` da "USD 85.000,00"; el default de es-AR para
// USD es el símbolo "US$", que se confunde con pesos. El formateador se arma una sola vez.
const FORMATO_PRECIO_USD = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "USD",
  currencyDisplay: "code",
});

/**
 * Precio de un lote en USD. Sin precio cargado se dice así, en lugar del guión que la tabla
 * usa para una celda vacía: que un lote no tenga precio es un dato, no una celda sin llenar.
 */
export function fmtPrecioUsd(valor) {
  if (valor == null || valor === "") return "Sin precio";
  const n = Number(valor);
  if (Number.isNaN(n)) return "Sin precio";
  return FORMATO_PRECIO_USD.format(n);
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
