// src/components/Reportes/Insignias.jsx
// Insignias de los reportes.
//
// Las de estado y subestado tienen el mismo aspecto y los mismos colores que las de la tabla
// de lotes (clases `tl-badge`), pero con el texto acentuado de etiquetas.js.
//
// La de tramo de atraso NO usa `tl-badge`: esa clase fuerza mayúsculas, y "MÁS DE 60 DÍAS"
// grita en una celda; además su variante `warn` es amarillo sobre crema, ilegible. Va con
// clases propias del reporte (`reporte-insignia`), definidas en Reportes.css.

import { getEstadoVariant } from "../Table/TablaLotes/cells/StatusBadge";
import {
  VARIANTE_ESTADO_VENTA,
  VARIANTE_SUBESTADO,
  etiquetaDiasAtraso,
  etiquetaEstado,
  etiquetaEstadoVenta,
  etiquetaSubestado,
  etiquetaTramo,
  sufijoTramo,
} from "./etiquetas";

function Insignia({ texto, variante }) {
  return <span className={`tl-badge tl-badge--${variante}`}>{texto}</span>;
}

/** Insignia de estado de lote, con el color que ya usa el resto de la app. */
export function InsigniaEstado({ value }) {
  return <Insignia texto={etiquetaEstado(value).toUpperCase()} variante={getEstadoVariant(value)} />;
}

/** Insignia de subestado de lote, con el color que ya usa el resto de la app. */
export function InsigniaSubestado({ value }) {
  return (
    <Insignia
      texto={etiquetaSubestado(value).toUpperCase()}
      variante={VARIANTE_SUBESTADO[value] ?? "muted"}
    />
  );
}

/** Insignia de estado de una venta (enum EstadoVenta). Un valor desconocido queda en gris. */
export function InsigniaVenta({ estado }) {
  return (
    <Insignia
      texto={etiquetaEstadoVenta(estado).toUpperCase()}
      variante={VARIANTE_ESTADO_VENTA[estado] ?? "muted"}
    />
  );
}

/**
 * Insignia del atraso de una cuota vencida: dice los días y el color dice el tramo.
 *
 * Los dos datos vienen de la misma fila y el backend ya los hace coincidir (`tramo` es el tramo
 * de `diasAtraso`), así que acá no se deriva uno del otro. El nombre del tramo va en `title`
 * porque en la insignia solo entran los días: un color por sí solo no se puede leer, y la
 * leyenda de la tarjeta de antigüedad es el otro lugar donde se explica.
 *
 * @param {object} props
 * @param {string} props.tramo - "1-30", "31-60" o "+60"
 * @param {number} props.diasAtraso - Entero >= 1
 */
export function InsigniaTramo({ tramo, diasAtraso }) {
  return (
    <span
      className={`reporte-insignia reporte-insignia--tramo-${sufijoTramo(tramo)}`}
      title={etiquetaTramo(tramo)}
    >
      {etiquetaDiasAtraso(diasAtraso)}
    </span>
  );
}
