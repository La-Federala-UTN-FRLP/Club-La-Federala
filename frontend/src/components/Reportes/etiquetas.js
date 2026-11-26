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

/**
 * Texto cuando la consulta no devolvió ninguna fila. Es el mismo en los tres reportes: lo que
 * pasó es que el universo filtrado está vacío, y de qué universo se trata ya lo dice el título
 * de la tabla.
 */
export const TEXTO_VACIO = "No hay registros para estos filtros";

/** Rótulo del botón que baja el .xlsx. Compartido por el botón y por el aviso que lo nombra. */
export const BOTON_EXPORTAR = "Exportar a Excel";

/**
 * Aviso de que los filtros cambiaron después de generar.
 *
 * Dice las dos cosas a la vez a propósito: que lo que está en pantalla es la consulta anterior,
 * y que la exportación baja eso mismo y no los filtros nuevos. Se arma con los rótulos de los
 * dos botones para que el aviso no pueda terminar nombrando un botón que se llama distinto.
 */
export const TEXTO_DESACTUALIZADO =
  `Los filtros cambiaron. Lo que ves, y lo que baja «${BOTON_EXPORTAR}», sigue siendo la ` +
  `última consulta. Pulsá «${BOTON_GENERAR}» para actualizar.`;

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

/* ------------------------- Cuotas vencidas (39.4) ------------------------- */

// Un dato que el backend no manda. `fmtMontoMoneda` hace la misma comprobación en línea; no se
// la toca para que esta etapa agregue código y no reescriba el que ya está en main.
const sinDato = (valor) => valor == null || valor === "";

/**
 * Tramo de atraso → texto visible.
 *
 * Las claves son los tres valores exactos del contrato (`TRAMOS_ATRASO` de reporte.service.ts):
 * cadenas con guión y con signo, no identificadores, así que van entre comillas.
 */
export const ETIQUETA_TRAMO = {
  "1-30": "1 a 30 días",
  "31-60": "31 a 60 días",
  "+60": "Más de 60 días",
};

/**
 * Texto de un tramo.
 *
 * Un tramo que no esté en el mapa se devuelve tal como vino, convertido a texto: el contrato fija
 * tres valores, así que un cuarto es un dato que esta pantalla no conoce, y mostrarlo crudo deja
 * ver qué llegó en lugar de esconderlo. No lanza nunca.
 *
 * @param {string} tramo - "1-30", "31-60" o "+60"
 * @returns {string}
 */
export function etiquetaTramo(tramo) {
  return Object.hasOwn(ETIQUETA_TRAMO, tramo) ? ETIQUETA_TRAMO[tramo] : String(tramo);
}

/**
 * Un número con su sustantivo en la forma que corresponde: "1 cuota", "2 cuotas".
 *
 * No había un helper así: las vistas resolvían el plural con un ternario en el lugar donde lo
 * necesitaban (VistaVentas.jsx lo hace para "venta"/"ventas"). En cuotas vencidas hace falta para
 * días, cuotas y ventas, así que vale escribirlo una vez.
 *
 * @param {number} n
 * @param {string} singular - Forma para n === 1
 * @param {string} formaPlural - Forma para cualquier otro n (incluido 0)
 * @returns {string}
 */
export function plural(n, singular, formaPlural) {
  return `${n} ${n === 1 ? singular : formaPlural}`;
}

/**
 * Días de atraso de una cuota: "1 día", "80 días".
 *
 * `diasAtraso` es un entero >= 1 por contrato (una cuota que vence el día de corte todavía no está
 * vencida), así que cualquier otra cosa es un dato que no se puede rotular: se dice con el mismo
 * guión con el que la tabla marca una celda sin valor, en lugar de mostrar "0 días" o "1.5 días".
 *
 * @param {number} dias
 * @returns {string} El rótulo, o "—"
 */
export function etiquetaDiasAtraso(dias) {
  if (!Number.isInteger(dias) || dias < 1) return "—";
  return plural(dias, "día", "días");
}

/**
 * Posición de la cuota dentro de su plan: "14 de 36".
 *
 * Los dos números los informa el backend (`numeroCuota` y `cantidadCuotas` de la fila). Si falta
 * alguno no hay nada que ubicar, así que no se muestra media frase.
 *
 * @param {number} numeroCuota
 * @param {number} cantidadCuotas
 * @returns {string} "14 de 36", o "—"
 */
export function etiquetaCuotaDePlan(numeroCuota, cantidadCuotas) {
  if (sinDato(numeroCuota) || sinDato(cantidadCuotas)) return "—";
  return `${numeroCuota} de ${cantidadCuotas}`;
}

/** Tramo de atraso → sufijo de la clase CSS que lo pinta. */
export const CLASE_TRAMO = {
  "1-30": "corto",
  "31-60": "medio",
  "+60": "largo",
};

/**
 * Sufijo de clase de un tramo, para componer `reporte-insignia--tramo-<sufijo>`: la insignia de
 * atraso de la tabla se pinta con `reporte-insignia--tramo-corto`, `-medio`, `-largo` o
 * `-desconocido`. El mismo sufijo compone `reporte-tramo--<sufijo>`, que es lo que colorea los
 * segmentos y los puntos de la barra de antigüedad.
 *
 * Un tramo desconocido da "desconocido", que en el CSS queda neutro (gris), y no uno de los
 * tres: si el backend agregara un tramo, se vería sin color en lugar de pintado como un tramo
 * que no es.
 *
 * @param {string} tramo
 * @returns {"corto"|"medio"|"largo"|"desconocido"}
 */
export function sufijoTramo(tramo) {
  return Object.hasOwn(CLASE_TRAMO, tramo) ? CLASE_TRAMO[tramo] : "desconocido";
}
