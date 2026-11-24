// src/components/Reportes/etiquetas.js
// Etiquetas y rótulos de los reportes (39.2 a 39.4).
//
// El resto de la app deriva el texto del enum con `toLowerCase()` + reemplazo de guiones
// bajos (StatusBadge.jsx y SubstatusBadge.jsx), y así pierde las tildes: "En promocion",
// "En construccion". Acá las etiquetas están escritas a mano y las claves son los valores
// del enum, de modo que no dependen de normalizar texto. Un valor que no esté en el mapa se
// muestra tal cual en lugar de romper.
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

const buscarEtiqueta = (mapa) => (valor) => {
  if (valor == null || valor === "") return "—";
  return mapa[valor] ?? String(valor);
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
