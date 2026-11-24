// src/components/Reportes/Insignias.jsx
// Insignias de estado y subestado para los reportes. Mismo aspecto y mismos colores que las
// de la tabla de lotes (clases `tl-badge`), pero con el texto acentuado de etiquetas.js.

import { getEstadoVariant } from "../Table/TablaLotes/cells/StatusBadge";
import { VARIANTE_SUBESTADO, etiquetaEstado, etiquetaSubestado } from "./etiquetas";

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
