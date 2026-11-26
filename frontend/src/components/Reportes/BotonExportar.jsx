// src/components/Reportes/BotonExportar.jsx
// Botón "Exportar a Excel" de la fila de filtros (39.5).
//
// Es un <button> propio y no el `Button` de react-bootstrap a propósito. `.btn` define su fondo,
// su borde y su sombra de foco con variables `--bs-btn-*`, y sus reglas `.btn:hover` y
// `.btn:focus-visible` empatan en especificidad con las de esta hoja: el estado pulsado o
// enfocado lo terminaría pintando Bootstrap. Sin `.btn` no hay nada que pisar, y los cuatro
// estados quedan definidos en un solo lugar.

import { BOTON_EXPORTAR } from "./etiquetas";

const TEXTO_DESCARGANDO = "Preparando archivo…";

/**
 * Ícono de hoja de cálculo. Decorativo: lo que significa ya lo dice el texto del botón, así que
 * se oculta en lugar de hacer que un lector de pantalla lea "imagen". El color del trazo lo pone
 * el CSS con `--reporte-excel-icono`, no un atributo.
 */
function IconoExcel() {
  return (
    <svg
      className="reporte-exportar__icono"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
      <path d="M9 13l4 5M13 13l-4 5" />
    </svg>
  );
}

/**
 * @param {object} props
 * @param {() => void} props.onClick
 * @param {boolean} [props.deshabilitado=false] - No hay nada exportable todavía
 * @param {boolean} [props.descargando=false] - El archivo se está preparando en el servidor
 * @param {string|null} [props.motivo] - Por qué está deshabilitado, para el `title`
 */
export default function BotonExportar({
  onClick,
  deshabilitado = false,
  descargando = false,
  motivo = null,
}) {
  return (
    <button
      type="button"
      className="reporte-exportar"
      onClick={onClick}
      // `descargando` también deshabilita acá y no solo en quien llama: el botón no depende de
      // que el estado de afuera se acuerde de sumar las dos condiciones.
      disabled={deshabilitado || descargando}
      aria-busy={descargando ? "true" : undefined}
      title={motivo ?? undefined}
    >
      {descargando ? (
        <span className="spinner-border spinner-border-sm" aria-hidden="true" />
      ) : (
        <IconoExcel />
      )}
      {descargando ? TEXTO_DESCARGANDO : BOTON_EXPORTAR}
    </button>
  );
}
