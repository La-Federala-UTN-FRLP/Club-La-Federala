// src/components/Reportes/VistaInventario.jsx
// Reporte de inventario de lotes (39.2): filtros, tarjetas de totales y tabla.
// Maneja su propia carga; el panel de Reportes solo lo monta.
//
// Los filtros se aplican con el botón, no en vivo: cada consulta es un GET al backend y
// el contrato recalcula los totales sobre el mismo universo filtrado.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Form } from "react-bootstrap";
import TablaReportes from "./TablaReportes";
import { InsigniaEstado, InsigniaSubestado } from "./Insignias";
import {
  BOTON_GENERAR,
  etiquetaEstado,
  etiquetaLote,
  etiquetaSubestado,
  fmtPrecioUsd,
} from "./etiquetas";
import { getInventario, getFraccionesReporte } from "../../lib/api/reportes";
import { parseApiError } from "../../lib/http/errors";
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
  // `borrador` es lo que se ve en los selects; `aplicados` es lo que se consultó.
  const [borrador, setBorrador] = useState(SIN_FILTROS);
  const [aplicados, setAplicados] = useState(SIN_FILTROS);

  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [fracciones, setFracciones] = useState([]);
  const [errorFracciones, setErrorFracciones] = useState(null);

  // Catálogo del filtro de fracción: se pide una vez y no depende de los filtros.
  useEffect(() => {
    let cancelado = false;
    getFraccionesReporte()
      .then((lista) => {
        if (!cancelado) setFracciones(lista);
      })
      .catch((err) => {
        if (!cancelado) {
          setErrorFracciones(parseApiError(err, "No se pudieron cargar las fracciones"));
        }
      });
    return () => {
      cancelado = true;
    };
  }, []);

  // Carga del reporte: al montar sin filtros y después cada vez que se aplican.
  // `cancelado` descarta la respuesta si los filtros cambian antes de que llegue.
  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    getInventario(aplicados)
      .then((data) => {
        if (!cancelado) setDatos(data);
      })
      .catch((err) => {
        if (!cancelado) {
          setDatos(null);
          setError(parseApiError(err, "No se pudo cargar el reporte de inventario"));
        }
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [aplicados]);

  const totales = datos?.totales;

  // Total del inventario: el contrato no lo trae como número suelto, sale de porEstado.
  const lotesEnInventario = useMemo(
    () => (totales?.porEstado ?? []).reduce((acc, e) => acc + e.cantidad, 0),
    [totales]
  );

  const cambiarFiltro = (campo) => (e) =>
    setBorrador((prev) => ({ ...prev, [campo]: e.target.value }));

  // Objeto nuevo en cada clic a propósito: con la misma referencia React descarta el setState
  // y el efecto no vuelve a correr, así que Generar no consultaba de nuevo con los mismos
  // filtros. Cada clic es una consulta, que es lo que el botón promete.
  const aplicarFiltros = (e) => {
    e.preventDefault();
    setAplicados({ ...borrador });
  };

  return (
    <div className="reportes-inventario">
      <form className="reporte-filtros-card" onSubmit={aplicarFiltros}>
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

        <Button
          type="submit"
          variant="primary"
          className="reporte-filtros-card__boton"
          disabled={cargando}
        >
          {BOTON_GENERAR}
        </Button>
      </form>

      {errorFracciones && (
        <Alert variant="warning" className="reportes-aviso">
          {errorFracciones} Podés consultar el inventario sin filtrar por fracción.
        </Alert>
      )}

      {cargando && (
        <div className="reportes-cargando">
          <div className="spinner-border" role="status" />
          <span className="ms-2">Cargando inventario…</span>
        </div>
      )}

      {!cargando && error && <Alert variant="danger">{error}</Alert>}

      {!cargando && !error && datos && (
        <>
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
            vacio="No hay lotes que coincidan con los filtros."
          />
        </>
      )}
    </div>
  );
}
