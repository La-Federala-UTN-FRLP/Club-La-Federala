// src/components/Reportes/TablaReportes.jsx
// Tabla de solo lectura para los reportes (39.2 a 39.4). A diferencia de TablaBase no tiene
// checkbox, selección, paginación ni selector de columnas: un reporte se muestra entero.
// Reutiliza las clases tl-* de la tabla de lotes para no inventar un estilo nuevo.

import "../Table/TablaLotes/TablaLotes.css";

/**
 * @typedef {object} ColumnaReporte
 * @property {string} clave - Identificador de la columna; sin `render`, es la clave de la fila
 * @property {string} titulo - Encabezado visible
 * @property {"left"|"right"|"center"} [align="left"] - Alineación de encabezado y celda
 * @property {(fila: object) => React.ReactNode} [render] - Contenido de la celda
 */

/**
 * @param {object} props
 * @param {ColumnaReporte[]} props.columnas
 * @param {object[]} props.filas
 * @param {string} props.gridTemplate - Valor de grid-template-columns: `.tl-tr` es grid y no
 *   define columnas propias, así que van inline (mismo enfoque que TablaBase).
 * @param {(fila: object, indice: number) => string|number} [props.filaKey] - Key de cada fila
 * @param {string} [props.vacio] - Texto cuando no hay filas
 */
export default function TablaReportes({
  columnas = [],
  filas = [],
  gridTemplate,
  filaKey,
  vacio = "No hay datos para mostrar.",
}) {
  const estiloGrilla = { gridTemplateColumns: gridTemplate };
  const sinFilas = filas.length === 0;

  return (
    <div className="tl-table">
      <div className="tl-thead">
        <div className="tl-tr" style={estiloGrilla}>
          {columnas.map((columna) => (
            <div key={columna.clave} className={`tl-th tl-th--${columna.align || "left"}`}>
              {columna.titulo}
            </div>
          ))}
        </div>
      </div>

      <div className="tl-tbody">
        {sinFilas && <div className="tl-empty">{vacio}</div>}

        {!sinFilas &&
          filas.map((fila, indice) => (
            <div
              key={filaKey ? filaKey(fila, indice) : indice}
              className="tl-tr"
              style={estiloGrilla}
            >
              {columnas.map((columna) => {
                const contenido = columna.render ? columna.render(fila) : fila[columna.clave];
                const vacia = contenido === null || contenido === undefined || contenido === "";
                return (
                  <div
                    key={columna.clave}
                    data-col={columna.clave}
                    className={`tl-td tl-td--${columna.align || "left"}`}
                  >
                    {vacia ? "—" : contenido}
                  </div>
                );
              })}
            </div>
          ))}
      </div>
    </div>
  );
}
