// src/components/Reportes/EstadosReporte.jsx
// Los tres estados de un reporte: cargando, error y resultado (39.5).
//
// Antes estaban escritos a mano en cada vista. Van juntos acá porque son las tres caras de lo
// mismo, y porque dos de ellos cambian respecto de lo que había:
//
// - El rótulo de carga ahora vive DENTRO de la región con `role="status"`. Antes el rol estaba
//   en el div del spinner, que está vacío: la región existía, pero su contenido nunca cambiaba,
//   así que un lector de pantalla no tenía nada que anunciar.
// - Al volver a generar, el resultado anterior ya no se reemplaza por el spinner: queda a la
//   vista, atenuado y sin interacción, con el aviso encima. El dato viejo seguía en memoria
//   (`datos` no se borra en el camino feliz), nada más que estaba escondido.

import { Alert, Button } from "react-bootstrap";

/**
 * Indicador de carga: el spinner y su rótulo.
 *
 * El spinner es `aria-hidden` porque es el dibujo de lo que el texto ya dice; la región viva es
 * el contenedor, que es lo que contiene el texto.
 *
 * @param {object} props
 * @param {string} props.texto - Qué se está cargando ("Cargando ventas…")
 */
export function IndicadorCarga({ texto }) {
  return (
    <div className="reportes-cargando" role="status">
      <div className="spinner-border" aria-hidden="true" />
      <span className="ms-2">{texto}</span>
    </div>
  );
}

/**
 * Error del reporte, con el botón para volver a pedirlo con los mismos filtros.
 *
 * `Alert` de react-bootstrap ya trae `role="alert"`, que es una región viva asertiva: no se le
 * agrega ningún rol encima.
 *
 * @param {object} props
 * @param {string} props.mensaje - Ya traducido por `parseApiError`
 * @param {() => void} props.onReintentar
 */
export function ErrorReporte({ mensaje, onReintentar }) {
  return (
    <Alert variant="danger" className="reporte-error">
      <span className="reporte-error__mensaje">{mensaje}</span>
      {/* `type="button"`: queda fuera de la tarjeta de filtros, pero el default de un <button>
          es "submit" y no hay razón para depender de dónde esté montado. */}
      <Button type="button" variant="outline-danger" size="sm" onClick={onReintentar}>
        Reintentar
      </Button>
    </Alert>
  );
}

/**
 * El resultado del reporte (tarjetas y tabla), con el estado de "actualizando" encima.
 *
 * Mientras se vuelve a consultar, el contenido no se desmonta: se atenúa y se le saca la
 * interacción, y el aviso va superpuesto para que no empuje nada hacia abajo. Así el número que
 * se estaba leyendo no salta de lugar ni hay que scrollear para ver que algo está pasando.
 *
 * @param {object} props
 * @param {boolean} [props.actualizando=false] - Consulta en vuelo sobre datos ya visibles
 * @param {string} props.textoActualizando - Rótulo del aviso superpuesto
 * @param {React.ReactNode} props.children - Las tarjetas y la tabla
 */
export function ResultadoReporte({ actualizando = false, textoActualizando, children }) {
  return (
    <div className="reporte-resultado">
      {actualizando && (
        <div className="reporte-resultado__aviso">
          <IndicadorCarga texto={textoActualizando} />
        </div>
      )}

      {/* `aria-busy` solo cuando corresponde: sin actualizar, el atributo no se escribe. */}
      <div
        className={`reporte-resultado__contenido${
          actualizando ? " reporte-resultado__contenido--actualizando" : ""
        }`}
        aria-busy={actualizando ? "true" : undefined}
      >
        {children}
      </div>
    </div>
  );
}
