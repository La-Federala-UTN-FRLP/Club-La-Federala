// src/components/Reportes/AvisoFraccionesTruncadas.jsx
// Aviso de que el selector de fracción no lista todas las que existen (39.6).
//
// GET /fracciones trae como máximo 10 (límite fijo del backend, sin un parámetro para pedir
// más) y manda `total` con el conteo real. Si hay más de 10, el selector queda incompleto y no
// hay otra forma de filtrar por esas fracciones desde esta pantalla: este aviso es lo único que
// lo dice.
//
// Mismo <Alert> que ya usan las tres vistas para el error de carga de fracciones, con la misma
// clase: es un aviso del mismo tipo y no hace falta un estilo nuevo.

import { Alert } from "react-bootstrap";

/**
 * @param {object} props
 * @param {number} props.cantidad - Cuántas fracciones lista el selector
 * @param {number} props.total - Cuántas existen en total
 */
export default function AvisoFraccionesTruncadas({ cantidad, total }) {
  return (
    <Alert variant="warning" className="reportes-aviso">
      El selector muestra {cantidad} de {total} fracciones. Las demás no se pueden filtrar desde
      esta pantalla.
    </Alert>
  );
}
