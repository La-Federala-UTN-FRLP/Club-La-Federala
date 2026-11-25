// src/components/Reportes/TarjetaTabla.jsx
// Tarjeta que envuelve la tabla de un reporte: título a la izquierda y un detalle a la derecha.
//
// `detalle` es texto libre que arma la vista ("9 ventas", "15 cuotas vencidas") y no un
// "Mostrando X de Y": ninguna de las tres listas del contrato está paginada, el backend
// devuelve el universo filtrado completo, así que X siempre sería igual a Y.

/**
 * @param {object} props
 * @param {string} props.titulo - Encabezado de la tarjeta
 * @param {string} [props.detalle=""] - Texto chico a la derecha del título
 * @param {React.ReactNode} props.children - La tabla (se espera un `<TablaReportes />`)
 */
export default function TarjetaTabla({ titulo, detalle = "", children }) {
  return (
    <section className="reporte-tabla-card">
      <header className="reporte-tabla-card__encabezado">
        <h2 className="reporte-tabla-card__titulo">{titulo}</h2>
        {detalle !== "" && <span className="reporte-tabla-card__detalle">{detalle}</span>}
      </header>

      {children}
    </section>
  );
}
