// src/components/Reportes/VistaInventario.jsx
// Reporte de inventario de lotes (39.2): filtros, tarjetas de totales y tabla.
// Maneja su propia carga; el panel de Reportes solo lo monta.
//
// Los filtros se aplican con el botón, no en vivo: cada consulta es un GET al backend y
// el contrato recalcula los totales sobre el mismo universo filtrado.

import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Alert, Form } from "react-bootstrap";
import AvisoFraccionesTruncadas from "./AvisoFraccionesTruncadas";
import BotonExportar from "./BotonExportar";
import FiltrosReporte from "./FiltrosReporte";
import TablaReportes from "./TablaReportes";
import { ErrorReporte, IndicadorCarga, ResultadoReporte } from "./EstadosReporte";
import { InsigniaEstado, InsigniaSubestado } from "./Insignias";
import {
  etiquetaEstado,
  etiquetaLote,
  etiquetaSubestado,
  fmtPrecioUsd,
  TEXTO_VACIO,
} from "./etiquetas";
import useCatalogoFracciones from "./useCatalogoFracciones";
import useExportarReporte from "./useExportarReporte";
import useReporte from "./useReporte";
import { getInventario } from "../../lib/api/reportes";
import { fmtFechaCalendario } from "../../lib/fechas";

// Enum EstadoLote del backend menos dos valores, porque filtrar por ellos solo daría listas
// vacías: ELIMINADO lo excluye el inventario por contrato, y OPERATIVO quedó en el enum por
// arrastre de la estandarización de estados, sin ningún lote ni código que lo asigne.
const ESTADOS = [
  "ALQUILADO",
  "CON_PRIORIDAD",
  "DISPONIBLE",
  "EN_PROMOCION",
  "NO_DISPONIBLE",
  "RESERVADO",
  "VENDIDO",
];

const SUBESTADOS = ["CONSTRUIDO", "NO_CONSTRUIDO", "EN_CONSTRUCCION"];

const SIN_FILTROS = { fraccion: "", estado: "", subestado: "" };

// Los rótulos de los dos estados de carga y el fallback del mensaje de error, como constantes de
// módulo igual que el resto de los textos.
const TEXTO_CARGANDO = "Cargando inventario…";
const TEXTO_ACTUALIZANDO = "Actualizando inventario…";
const MENSAJE_ERROR = "No se pudo cargar el reporte de inventario";

const columnas = [
  {
    clave: "lote",
    titulo: "Lote",
    align: "left",
    render: (f) => etiquetaLote(f.fraccion, f.numero),
  },
  { clave: "fraccion", titulo: "Fracción", align: "center", render: (f) => `Fracción ${f.fraccion}` },
  { clave: "estado", titulo: "Estado", align: "center", render: (f) => <InsigniaEstado value={f.estado} /> },
  { clave: "subestado", titulo: "Subestado", align: "center", render: (f) => <InsigniaSubestado value={f.subestado} /> },
  {
    clave: "precio",
    titulo: "Precio",
    align: "right",
    render: (f) => fmtPrecioUsd(f.precio),
  },
  {
    clave: "accion",
    titulo: "Acción",
    align: "center",
    render: (f) => (
      <Link to={f.enlace} className="reportes-enlace">
        Ver lote
      </Link>
    ),
  },
];

// Proporcional en vez de columnas fijas: si fuera fijo, el sobrante se iría todo a la
// primera columna y dejaría un hueco entre el lote y su fracción.
const GRID_TEMPLATE =
  "minmax(150px, 1fr) minmax(110px, 0.7fr) minmax(140px, 0.9fr) minmax(150px, 0.9fr) minmax(120px, 0.8fr) minmax(100px, 0.6fr)";

/** Tarjeta de KPI: número grande, etiqueta y una leyenda opcional que aclara qué cuenta. */
function TarjetaKpi({ etiqueta, valor, leyenda, destacada = false }) {
  return (
    <div className={`reportes-kpi${destacada ? " reportes-kpi--destacada" : ""}`}>
      <div className="reportes-kpi__etiqueta">{etiqueta}</div>
      <div className="reportes-kpi__valor">{valor}</div>
      {leyenda && <div className="reportes-kpi__leyenda">{leyenda}</div>}
    </div>
  );
}

/** Resumen compacto: lista de pares etiqueta/valor bajo un título. */
function Resumen({ titulo, items }) {
  return (
    <div className="reportes-resumen">
      <h6 className="reportes-resumen__titulo">{titulo}</h6>
      {items.length === 0 ? (
        <p className="reportes-resumen__vacio">Sin datos.</p>
      ) : (
        <ul className="reportes-resumen__lista">
          {items.map((item) => (
            <li key={item.clave} className="reportes-resumen__item">
              <span className="reportes-resumen__etiqueta">{item.etiqueta}</span>
              <span className="reportes-resumen__valor">{item.valor}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function VistaInventario() {
  // `borrador` es lo que se ve en los selects; `aplicados` es lo que se consultó. A diferencia de
  // los otros dos reportes, acá sí hay algo razonable que mostrar sin que nadie pida nada —el
  // inventario completo—, así que la consulta sale al montar y `aplicados` nunca es null.
  const {
    borrador,
    cambiarCampo,
    aplicados,
    datos,
    cargando,
    error,
    desactualizado,
    generar,
    reintentar,
  } = useReporte({
    fetcher: getInventario,
    mensajeError: MENSAJE_ERROR,
    filtrosIniciales: SIN_FILTROS,
    consultarAlMontar: true,
  });

  const { fracciones, errorFracciones, truncado, totalFracciones } = useCatalogoFracciones();

  const { exportar, descargando, puedeExportar, motivoDeshabilitado } = useExportarReporte({
    ruta: "inventario",
    aplicados,
    datos,
    cargando,
  });

  const totales = datos?.totales;

  // Total del inventario: el contrato no lo trae como número suelto, sale de porEstado.
  const lotesEnInventario = useMemo(
    () => (totales?.porEstado ?? []).reduce((acc, e) => acc + e.cantidad, 0),
    [totales]
  );

  const cambiarFiltro = (campo) => (e) => cambiarCampo(campo, e.target.value);

  return (
    <div className="reportes-inventario">
      <FiltrosReporte
        onGenerar={generar}
        cargando={cargando}
        desactualizado={desactualizado}
        acciones={
          <BotonExportar
            onClick={exportar}
            deshabilitado={!puedeExportar}
            descargando={descargando}
            motivo={motivoDeshabilitado}
          />
        }
      >
        <Form.Group className="reporte-filtro">
          <Form.Label htmlFor="inv-fraccion">Fracción</Form.Label>
          <Form.Select
            id="inv-fraccion"
            value={borrador.fraccion}
            onChange={cambiarFiltro("fraccion")}
            disabled={fracciones.length === 0}
          >
            <option value="">Todas las fracciones</option>
            {fracciones.map((f) => (
              <option key={f.id} value={f.id}>
                Fracción {f.numero}
              </option>
            ))}
          </Form.Select>
        </Form.Group>

        <Form.Group className="reporte-filtro">
          <Form.Label htmlFor="inv-estado">Estado comercial</Form.Label>
          <Form.Select id="inv-estado" value={borrador.estado} onChange={cambiarFiltro("estado")}>
            <option value="">Todos los estados</option>
            {ESTADOS.map((estado) => (
              <option key={estado} value={estado}>
                {etiquetaEstado(estado)}
              </option>
            ))}
          </Form.Select>
        </Form.Group>

        <Form.Group className="reporte-filtro">
          <Form.Label htmlFor="inv-subestado">Subestado constructivo</Form.Label>
          <Form.Select
            id="inv-subestado"
            value={borrador.subestado}
            onChange={cambiarFiltro("subestado")}
          >
            <option value="">Todos los subestados</option>
            {SUBESTADOS.map((subestado) => (
              <option key={subestado} value={subestado}>
                {etiquetaSubestado(subestado)}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
      </FiltrosReporte>

      {errorFracciones && (
        <Alert variant="warning" className="reportes-aviso">
          {errorFracciones} Podés consultar el inventario sin filtrar por fracción.
        </Alert>
      )}

      {truncado && (
        <AvisoFraccionesTruncadas cantidad={fracciones.length} total={totalFracciones} />
      )}

      {/* La primera consulta no tiene nada que atenuar, así que el indicador va solo. */}
      {cargando && !datos && <IndicadorCarga texto={TEXTO_CARGANDO} />}

      {!cargando && error && <ErrorReporte mensaje={error} onReintentar={reintentar} />}

      {datos && !error && (
        <ResultadoReporte actualizando={cargando} textoActualizando={TEXTO_ACTUALIZANDO}>
          <p className="reportes-corte">Datos al {fmtFechaCalendario(datos.corte)}</p>

          <div className="reportes-kpis">
            <TarjetaKpi
              etiqueta="Lotes ofrecibles"
              valor={totales?.ofrecibles ?? 0}
              leyenda="Disponibles + en promoción"
              destacada
            />
            <TarjetaKpi etiqueta="Lotes en inventario" valor={lotesEnInventario} />
          </div>

          <div className="reportes-resumenes">
            <Resumen
              titulo="Por estado"
              items={(totales?.porEstado ?? []).map((e) => ({
                clave: e.estado,
                etiqueta: etiquetaEstado(e.estado),
                valor: e.cantidad,
              }))}
            />
            <Resumen
              titulo="Por fracción"
              items={(totales?.porFraccion ?? []).map((f) => ({
                clave: f.fraccionId,
                etiqueta: `Fracción ${f.fraccion}`,
                valor: `${f.cantidad} (${f.ofrecibles} ofrecibles)`,
              }))}
            />
            <Resumen
              titulo="Por subestado"
              items={(totales?.porSubestado ?? []).map((s) => ({
                clave: s.subestado,
                etiqueta: etiquetaSubestado(s.subestado),
                valor: s.cantidad,
              }))}
            />
          </div>

          <TablaReportes
            columnas={columnas}
            filas={datos.filas ?? []}
            gridTemplate={GRID_TEMPLATE}
            filaKey={(fila) => fila.loteId}
            vacio={TEXTO_VACIO}
          />
        </ResultadoReporte>
      )}
    </div>
  );
}
