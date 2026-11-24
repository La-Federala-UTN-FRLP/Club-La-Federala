// src/components/Reportes/TarjetaKpi.jsx
// Tarjeta de KPI de los reportes: la misma estructura que la que hoy vive dentro de
// VistaInventario.jsx, para que migrarla sea reemplazar el componente local por este.
//
// Las clases llevan el prefijo `reporte-` (singular), no `reportes-`: así el estilo del boceto
// se aplica acá sin tocar lo que ya se ve en inventario, que migra aparte.

/**
 * Número grande con su rótulo y, si hace falta, una leyenda que aclara qué cuenta.
 *
 * @param {object} props
 * @param {string} props.etiqueta - Rótulo de arriba (p. ej. "Lotes ofrecibles")
 * @param {React.ReactNode} props.valor - El número, ya formateado por la vista
 * @param {string} [props.leyenda] - Aclaración opcional debajo del número
 * @param {boolean} [props.destacada=false] - Resalta la tarjeta principal del reporte
 */
export default function TarjetaKpi({ etiqueta, valor, leyenda, destacada = false }) {
  return (
    <div className={`reporte-kpi${destacada ? " reporte-kpi--destacada" : ""}`}>
      <div className="reporte-kpi__etiqueta">{etiqueta}</div>
      <div className="reporte-kpi__valor">{valor}</div>
      {leyenda && <div className="reporte-kpi__leyenda">{leyenda}</div>}
    </div>
  );
}
