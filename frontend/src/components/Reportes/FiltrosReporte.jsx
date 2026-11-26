// src/components/Reportes/FiltrosReporte.jsx
// Tarjeta de filtros de un reporte, compartida por los tres (39.2 a 39.4).
//
// Los campos los arma cada vista, porque son distintos en cada reporte, y entran por `children`.
// Acá viven lo que sí es igual en todos: la tarjeta, el submit y el botón.

import { Button } from "react-bootstrap";
import { BOTON_GENERAR, TEXTO_DESACTUALIZADO } from "./etiquetas";

/**
 * @param {object} props
 * @param {() => void} props.onGenerar - Se llama al enviar el formulario, ya sin el evento
 * @param {boolean} [props.cargando=false] - Consulta en vuelo: el botón queda deshabilitado
 *   hasta que termine, para que dos clics no disparen dos consultas superpuestas
 * @param {boolean} [props.deshabilitado=false] - Los filtros todavía no alcanzan para consultar
 *   (por ejemplo, un período incompleto)
 * @param {string} [props.motivo=""] - Qué falta, cuando está `deshabilitado`: se muestra debajo
 *   de los campos en lugar de dejar un botón gris y mudo
 * @param {React.ReactNode} [props.acciones] - Acciones extra, a la izquierda de "Generar
 *   reporte" (hoy, el botón de exportar). Van en el mismo grupo que él para compartir la
 *   alineación a la derecha y el gap del boceto.
 * @param {boolean} [props.desactualizado=false] - Los filtros cambiaron después de generar: se
 *   avisa debajo de los campos, sin deshabilitar ni bloquear nada
 * @param {React.ReactNode} props.children - Los campos del filtro
 */
export default function FiltrosReporte({
  onGenerar,
  cargando = false,
  deshabilitado = false,
  motivo = "",
  acciones = null,
  desactualizado = false,
  children,
}) {
  // Los filtros se aplican con el botón, no en vivo: cada consulta es un GET y el backend
  // recalcula los totales sobre el universo filtrado.
  const enviar = (e) => {
    e.preventDefault();
    onGenerar();
  };

  return (
    <form className="reporte-filtros-card" onSubmit={enviar}>
      <div className="reporte-filtros-card__campos">{children}</div>

      {/* Las acciones y Generar en un grupo, en el orden del boceto. Así el `margin-left: auto`
          que los empuja a la derecha vive en un solo lugar y no en cada botón. */}
      <div className="reporte-filtros-card__acciones">
        {acciones}

        <Button
          type="submit"
          variant="primary"
          className="reporte-filtros-card__boton"
          disabled={cargando || deshabilitado}
        >
          {BOTON_GENERAR}
        </Button>
      </div>

      {/* `role="status"` para que un lector de pantalla anuncie el motivo cuando aparece:
          si no, el botón se deshabilita sin que nada diga por qué. */}
      {deshabilitado && motivo !== "" && (
        <p className="reporte-filtros-card__motivo" role="status">
          {motivo}
        </p>
      )}

      {/* La marca de desactualizado es independiente del motivo y pueden convivir: dicen cosas
          distintas —uno es que falta algo para poder consultar, el otro que ya se consultó y los
          filtros se movieron después—. `role="status"` y no `alert`: no es un error. */}
      {desactualizado && (
        <p className="reporte-filtros-card__desactualizado" role="status">
          {/* Decorativo: lo que significa ya está en el texto que viene al lado. El color del
              trazo lo pone el CSS con `--reporte-aviso-icono`, no un atributo. */}
          <svg
            className="reporte-filtros-card__desactualizado-icono"
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
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16.5v.5" />
          </svg>
          {TEXTO_DESACTUALIZADO}
        </p>
      )}
    </form>
  );
}
