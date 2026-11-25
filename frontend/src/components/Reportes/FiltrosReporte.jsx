// src/components/Reportes/FiltrosReporte.jsx
// Tarjeta de filtros de un reporte, compartida por los tres (39.2 a 39.4).
//
// Los campos los arma cada vista, porque son distintos en cada reporte, y entran por `children`.
// Acá viven lo que sí es igual en todos: la tarjeta, el submit y el botón.

import { Button } from "react-bootstrap";
import { BOTON_GENERAR } from "./etiquetas";

/**
 * @param {object} props
 * @param {() => void} props.onGenerar - Se llama al enviar el formulario, ya sin el evento
 * @param {boolean} [props.cargando=false] - Consulta en vuelo: el botón queda deshabilitado
 *   hasta que termine, para que dos clics no disparen dos consultas superpuestas
 * @param {boolean} [props.deshabilitado=false] - Los filtros todavía no alcanzan para consultar
 *   (por ejemplo, un período incompleto)
 * @param {string} [props.motivo=""] - Qué falta, cuando está `deshabilitado`: se muestra debajo
 *   de los campos en lugar de dejar un botón gris y mudo
 * @param {React.ReactNode} props.children - Los campos del filtro
 */
export default function FiltrosReporte({
  onGenerar,
  cargando = false,
  deshabilitado = false,
  motivo = "",
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

      <Button
        type="submit"
        variant="primary"
        className="reporte-filtros-card__boton"
        disabled={cargando || deshabilitado}
      >
        {BOTON_GENERAR}
      </Button>

      {/* `role="status"` para que un lector de pantalla anuncie el motivo cuando aparece:
          si no, el botón se deshabilita sin que nada diga por qué. */}
      {deshabilitado && motivo !== "" && (
        <p className="reporte-filtros-card__motivo" role="status">
          {motivo}
        </p>
      )}
    </form>
  );
}
