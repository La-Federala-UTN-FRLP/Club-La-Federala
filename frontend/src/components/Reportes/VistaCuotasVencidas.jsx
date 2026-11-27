// src/components/Reportes/VistaCuotasVencidas.jsx
// Reporte de cuotas vencidas (39.4): filtros con la moneda obligatoria, saldo vencido,
// antigüedad de la deuda y tabla. Maneja su propia carga; el panel de Reportes solo lo monta.
//
// La moneda no es un filtro más: el reporte vive en una sola moneda y el backend no convierte,
// así que ARS y USD nunca se suman ni se muestran juntos. Todo lo que se ve está formateado con
// la moneda de la RESPUESTA y no con la del borrador: si alguien mueve el selector después de
// generar, los números siguen siendo los de la consulta que se hizo, hasta el próximo Generar.
//
// La pantalla no recalcula cifras: el saldo vencido, las cuotas, las ventas y los saldos por
// tramo se muestran tal como los manda el backend. Lo único derivado es el ancho de los
// segmentos de la barra de antigüedad, que es escala de dibujo y no un dato informado.

import { useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { Alert, Form } from "react-bootstrap";
import AvisoFraccionesTruncadas from "./AvisoFraccionesTruncadas";
import FiltrosReporte from "./FiltrosReporte";
import BotonExportar from "./BotonExportar";
import TarjetaKpi from "./TarjetaKpi";
import TarjetaTabla from "./TarjetaTabla";
import TablaReportes from "./TablaReportes";
import { ErrorReporte, IndicadorCarga, ResultadoReporte } from "./EstadosReporte";
import { InsigniaTramo } from "./Insignias";
import {
  etiquetaCuotaDePlan,
  etiquetaLote,
  etiquetaTramo,
  fmtMontoMoneda,
  plural,
  sufijoTramo,
  TEXTO_VACIO,
} from "./etiquetas";
import useCatalogoFracciones from "./useCatalogoFracciones";
import useReporte from "./useReporte";
import useExportarReporte from "./useExportarReporte";
import { getCuotasVencidas } from "../../lib/api/reportes";
import { fmtFechaCalendario } from "../../lib/fechas";

// Los dos valores del enum `Moneda`. USD va primero porque es el que viene elegido: un selector
// que abre con su segunda opción activa se lee peor que uno que abre con la primera.
const MONEDAS = ["USD", "ARS"];

// El reporte necesita una moneda para existir, así que el borrador arranca con una elegida. La
// fracción es opcional y vacía significa "todas" (buildQuery no manda los parámetros vacíos).
const BORRADOR_INICIAL = { moneda: "USD", fraccion: "" };

/** Rótulo exacto que pide CCLF-37 para la columna del saldo: incluye recargos sin desglosar. */
const TITULO_SALDO = "Saldo (incluye recargos)";

// Los rótulos de los dos estados de carga y el fallback del mensaje de error, como constantes de
// módulo igual que el resto de los textos.
const TEXTO_CARGANDO = "Cargando cuotas vencidas…";
const TEXTO_ACTUALIZANDO = "Actualizando cuotas vencidas…";
const MENSAJE_ERROR = "No se pudo cargar el reporte de cuotas vencidas";

/**
 * Selector de moneda: un segmented control de dos opciones.
 *
 * Es un `radiogroup` y no dos botones sueltos porque elegir la moneda es elegir una de dos
 * alternativas excluyentes, no disparar dos acciones. Eso trae el teclado que corresponde: un
 * solo tabstop (roving tabindex: solo la opción activa es alcanzable con Tab) y las flechas
 * para moverse entre las opciones, con el foco siguiendo a la selección.
 */
function SelectorMoneda({ valor, onCambiar, idEtiqueta }) {
  const opciones = useRef([]);

  const mover = (paso) => {
    const actual = MONEDAS.indexOf(valor);
    const siguiente = (actual + paso + MONEDAS.length) % MONEDAS.length;
    onCambiar(MONEDAS[siguiente]);
    // En un radiogroup la flecha mueve el foco y la selección a la vez.
    opciones.current[siguiente]?.focus();
  };

  const alPresionar = (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      mover(1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      mover(-1);
    }
  };

  return (
    <div className="reporte-moneda" role="radiogroup" aria-labelledby={idEtiqueta}>
      {MONEDAS.map((moneda, indice) => {
        const activa = moneda === valor;
        return (
          <button
            key={moneda}
            // `type="button"`: adentro de la tarjeta de filtros, que es un <form>, el default
            // sería "submit" y tocar la moneda dispararía la consulta.
            type="button"
            role="radio"
            aria-checked={activa}
            tabIndex={activa ? 0 : -1}
            ref={(el) => {
              opciones.current[indice] = el;
            }}
            className={`reporte-moneda__opcion${activa ? " reporte-moneda__opcion--activa" : ""}`}
            onClick={() => onCambiar(moneda)}
            onKeyDown={alPresionar}
          >
            {moneda}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Antigüedad de la deuda: una barra de tres tramos y su leyenda.
 *
 * El ancho de cada segmento es un `flex-grow` igual al saldo del tramo, así que los reparte el
 * navegador en proporción y acá no se suma ni se divide nada: es la escala del dibujo, no una
 * cifra. Un tramo en cero no dibuja segmento —no hay nada que mostrar— pero sí figura en la
 * leyenda con su cero, que es información: dice que ese tramo está limpio.
 */
function TarjetaAntiguedad({ tramos, moneda }) {
  const conSaldo = tramos.filter((t) => Number(t.saldo) > 0);

  return (
    <section className="reporte-antiguedad">
      <header className="reporte-antiguedad__encabezado">
        <h3 className="reporte-antiguedad__titulo">Antigüedad de la deuda</h3>
        <span className="reporte-antiguedad__nota">Por saldo</span>
      </header>

      {/* La barra es el dibujo de lo que la leyenda dice con palabras y números, así que para un
          lector de pantalla no agrega nada y se oculta en lugar de hacerlo leer tres divs. */}
      {conSaldo.length > 0 && (
        <div className="reporte-antiguedad__barra" aria-hidden="true">
          {conSaldo.map((t) => (
            <div
              key={t.tramo}
              className={`reporte-antiguedad__segmento reporte-tramo--${sufijoTramo(t.tramo)}`}
              style={{ flexGrow: Number(t.saldo) }}
            />
          ))}
        </div>
      )}

      <ul className="reporte-antiguedad__leyenda">
        {tramos.map((t) => (
          <li key={t.tramo} className="reporte-antiguedad__item">
            <span className="reporte-antiguedad__etiqueta">
              <span
                className={`reporte-antiguedad__punto reporte-tramo--${sufijoTramo(t.tramo)}`}
                aria-hidden="true"
              />
              {etiquetaTramo(t.tramo)}
            </span>
            <span className="reporte-antiguedad__saldo">{fmtMontoMoneda(t.saldo, moneda)}</span>
            <span className="reporte-antiguedad__cuotas">
              {plural(t.cuotas, "cuota", "cuotas")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Columnas de la tabla. Se arman con la moneda de la respuesta porque la celda del saldo la
 * necesita: el contrato informa una sola moneda por reporte y no hay nada que convertir.
 */
function columnasDe(moneda) {
  return [
    { clave: "venta", titulo: "Venta", align: "left", render: (f) => f.ventaNumero },
    {
      clave: "lote",
      titulo: "Lote",
      align: "left",
      // Mismo helper que las otras dos vistas: un lote sin número dice "Sin número".
      render: (f) => etiquetaLote(f.fraccion, f.loteNumero),
    },
    {
      clave: "cuota",
      titulo: "Cuota",
      align: "center",
      render: (f) => etiquetaCuotaDePlan(f.numeroCuota, f.cantidadCuotas),
    },
    {
      clave: "vencimiento",
      titulo: "Vencimiento",
      align: "center",
      render: (f) => fmtFechaCalendario(f.fechaVencimiento),
    },
    {
      clave: "atraso",
      titulo: "Atraso",
      align: "center",
      render: (f) => <InsigniaTramo tramo={f.tramo} diasAtraso={f.diasAtraso} />,
    },
    {
      clave: "saldo",
      titulo: TITULO_SALDO,
      align: "right",
      render: (f) => fmtMontoMoneda(f.saldoPendiente, moneda),
    },
    {
      clave: "accion",
      titulo: "Acción",
      align: "center",
      // El enlace lo arma el backend (`/ventas/<id>/pagos`); acá no se reconstruye.
      render: (f) => (
        <Link to={f.enlace} className="reportes-enlace">
          Ver pagos
        </Link>
      ),
    },
  ];
}

// Proporcional, como en las otras dos vistas: con columnas fijas el sobrante se iría todo a la
// primera. El mínimo del saldo es el más alto porque su encabezado es el más largo.
const GRID_TEMPLATE =
  "minmax(120px, 0.9fr) minmax(100px, 0.8fr) minmax(85px, 0.6fr) minmax(105px, 0.7fr) " +
  "minmax(100px, 0.7fr) minmax(150px, 1.1fr) minmax(95px, 0.6fr)";

export default function VistaCuotasVencidas() {
  // `borrador` es lo que se ve en los filtros; `aplicados` es lo que se consultó. Arranca en
  // null: la moneda es obligatoria y hay una elegida, pero el reporte se pide cuando la persona
  // lo pide, así que abrir la pestaña no dispara ninguna consulta.
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
    fetcher: getCuotasVencidas,
    mensajeError: MENSAJE_ERROR,
    filtrosIniciales: BORRADOR_INICIAL,
  });

  const { fracciones, errorFracciones, truncado, totalFracciones } = useCatalogoFracciones();

  const { exportar, descargando, puedeExportar, motivoDeshabilitado } = useExportarReporte({
    ruta: "cuotas-vencidas",
    aplicados,
    datos,
    cargando,
  });

  // La moneda de la respuesta, que es la que manda en pantalla. Mientras no hay datos no hay
  // moneda que mostrar, y las columnas tampoco se usan.
  const moneda = datos?.moneda;
  const columnas = useMemo(() => columnasDe(moneda), [moneda]);

  const cambiarFraccion = (e) => cambiarCampo("fraccion", e.target.value);

  const cambiarMoneda = (valor) => cambiarCampo("moneda", valor);

  return (
    <div className="reporte-cuotas">
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
        <Form.Group className="reporte-filtro reporte-filtro--moneda">
          {/* `as="span"`: un radiogroup no es un control etiquetable, así que el rótulo se
              asocia con aria-labelledby y no con un <label for>, que no apuntaría a nada. */}
          <Form.Label as="span" id="cv-moneda-etiqueta">
            Moneda
          </Form.Label>
          <SelectorMoneda
            valor={borrador.moneda}
            onCambiar={cambiarMoneda}
            idEtiqueta="cv-moneda-etiqueta"
          />
        </Form.Group>

        <Form.Group className="reporte-filtro">
          <Form.Label htmlFor="cv-fraccion">Fracción</Form.Label>
          {/* El value es el id de la fracción, que es lo que espera el parámetro `fraccion` de
              la API; el número es solo lo que se muestra. No son lo mismo. */}
          <Form.Select
            id="cv-fraccion"
            value={borrador.fraccion}
            onChange={cambiarFraccion}
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
      </FiltrosReporte>

      {errorFracciones && (
        <Alert variant="warning" className="reportes-aviso">
          {errorFracciones} Podés consultar las cuotas vencidas sin filtrar por fracción.
        </Alert>
      )}

      {truncado && (
        <AvisoFraccionesTruncadas cantidad={fracciones.length} total={totalFracciones} />
      )}

      {aplicados === null && !cargando && (
        <p className="reporte-sin-consulta">Elegí la moneda y pulsá Generar</p>
      )}

      {/* La primera consulta no tiene nada que atenuar, así que el indicador va solo. */}
      {cargando && !datos && <IndicadorCarga texto={TEXTO_CARGANDO} />}

      {!cargando && error && <ErrorReporte mensaje={error} onReintentar={reintentar} />}

      {datos && !error && (
        <ResultadoReporte actualizando={cargando} textoActualizando={TEXTO_ACTUALIZANDO}>
          <p className="reportes-corte">Datos al corte del {fmtFechaCalendario(datos.corte)}</p>

          <div className="reporte-cuotas-resumen">
            <TarjetaKpi
              etiqueta="Saldo vencido"
              valor={fmtMontoMoneda(datos.saldoVencido, moneda)}
              leyenda={`${plural(datos.cuotas, "cuota", "cuotas")} en ${plural(
                datos.ventas,
                "venta",
                "ventas"
              )}`}
              destacada
            />
            <TarjetaAntiguedad tramos={datos.tramos ?? []} moneda={moneda} />
          </div>

          <TarjetaTabla
            titulo={`Cuotas vencidas en ${moneda}`}
            detalle={`${plural(datos.cuotas, "cuota", "cuotas")}, de mayor a menor atraso`}
          >
            <TablaReportes
              columnas={columnas}
              filas={datos.filas ?? []}
              gridTemplate={GRID_TEMPLATE}
              filaKey={(fila) => fila.cuotaId}
              vacio={TEXTO_VACIO}
            />
          </TarjetaTabla>
        </ResultadoReporte>
      )}
    </div>
  );
}
