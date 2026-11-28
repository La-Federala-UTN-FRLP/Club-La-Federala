// src/components/Reportes/PanelResumen.jsx
// Tarjeta "Resumen para la reunión" (40.4, etapa 5): vive en el flujo de la página, en
// columna junto al reporte activo (el acomodo lo hace el CSS, ver Reportes.css), con
// formulario propio, cliente del resumen con IA y los cuatro estados.
//
// Queda SIEMPRE montada en Reportes.jsx (nunca `{visible && <PanelResumen />}`): el botón del
// encabezado solo la esconde con `display: none` por CSS. Si se desmontara, cada vez que la
// persona la oculta para ver el reporte completo perdería el resumen ya generado y gastaría
// otro de los 20 pedidos diarios al volver a mostrarla.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Form } from "react-bootstrap";
import AvisoFraccionesTruncadas from "./AvisoFraccionesTruncadas";
import FiltrosReporte from "./FiltrosReporte";
import { ErrorReporte, IndicadorCarga, ResultadoReporte } from "./EstadosReporte";
import { DIAS_PERIODO_DEFAULT, validarPeriodo } from "./periodo";
import useCatalogoFracciones from "./useCatalogoFracciones";
import useReporte from "./useReporte";
import { getResumen } from "../../lib/api/reportes";
import { fmtFechaCalendario, hoyNegocio, sumarDias } from "../../lib/fechas";

const MONEDAS = ["USD", "ARS"];

/**
 * A dónde lleva cada punto del resumen, según su `tema`.
 *
 * El `enlace` que trae cada punto se IGNORA a propósito: está medido tres veces (Postman y dos
 * corridas locales) que el modelo siempre devuelve "/reportes" pelado, sin filtros, porque la
 * entrada que recibe no contiene ninguna ruta. Un tema que no esté acá se muestra sin enlace,
 * en lugar de inventarle un destino.
 *
 * Las claves y las etiquetas espejan el objeto `REPORTES` de `pages/Reportes.jsx`. La
 * duplicación es a propósito —ese archivo no se puede tocar en esta etapa— y queda anotada:
 * si allá cambia una etiqueta o una clave de reporte, hay que moverla también acá.
 */
const DESTINO_POR_TEMA = {
  Inventario: { to: "/reportes?reporte=inventario", texto: "Ver en Inventario de lotes" },
  Comercial: { to: "/reportes?reporte=ventas", texto: "Ver en Ventas por período" },
  Cobranzas: { to: "/reportes?reporte=cuotas-vencidas", texto: "Ver en Cuotas vencidas" },
};

/** Borrador inicial: los mismos últimos 30 días que VistaVentas, USD y sin fracción. */
function borradorInicial() {
  const hasta = hoyNegocio();
  return {
    desde: sumarDias(hasta, -(DIAS_PERIODO_DEFAULT - 1)),
    hasta,
    moneda: "USD",
    fraccion: "",
  };
}

const TEXTO_CARGANDO = "Generando el resumen…";
const TEXTO_ACTUALIZANDO = "Actualizando el resumen…";
const MENSAJE_ERROR = "No se pudo generar el resumen";
const AVISO_IA = "Resumen generado por IA. Verificá las cifras en los reportes.";

/**
 * @param {object} props
 * @param {boolean} props.visible - Si es false, la tarjeta sigue montada (con su estado
 *   intacto) pero se esconde con `display: none` desde `Reportes.css`.
 */
export default function PanelResumen({ visible }) {
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
    fetcher: getResumen,
    mensajeError: MENSAJE_ERROR,
    filtrosIniciales: borradorInicial,
  });

  const { fracciones, errorFracciones, truncado, totalFracciones } = useCatalogoFracciones();

  // El formulario solo mide casi toda la ventana: con el resumen generado dejaría el texto
  // abajo del borde. Se repliega solo al llegar un resultado y se vuelve a abrir a pedido.
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(true);

  // `datos` es un objeto nuevo por cada consulta que termina bien, así que esto corre una vez
  // por resultado. Abrir los filtros a mano no lo dispara: `datos` no cambió.
  useEffect(() => {
    if (datos !== null) setFiltrosAbiertos(false);
  }, [datos]);

  const cambiarFiltro = (campo) => (e) => cambiarCampo(campo, e.target.value);

  // Mismo criterio que las vistas: el período manda, y sin una moneda elegida tampoco hay nada
  // que pedir. `validarPeriodo` repite las reglas del backend; la moneda no tiene un validador
  // propio porque el único valor inválido posible es el vacío.
  const motivo = validarPeriodo(borrador) ?? (borrador.moneda === "" ? "Elegí una moneda" : null);

  // Sin resultado no hay nada que replegar: el formulario es todo lo que tiene la tarjeta.
  const filtrosVisibles = filtrosAbiertos || datos === null;

  /** El número visible de una fracción aplicada; su id es lo que viaja a la API. */
  const etiquetaFraccion = (id) => {
    if (id === "") return "Todas las fracciones";
    const fraccion = fracciones.find((f) => String(f.id) === String(id));
    return fraccion ? `Fracción ${fraccion.numero}` : "Fracción seleccionada";
  };

  return (
    <section
      className={`reporte-resumen-card${visible ? "" : " reporte-resumen-card--oculta"}`}
      aria-hidden={visible ? undefined : "true"}
    >
      <h2 className="reporte-resumen-card__titulo">Resumen para la reunión</h2>

      {filtrosVisibles ? (
        <FiltrosReporte
          onGenerar={generar}
          cargando={cargando}
          deshabilitado={motivo !== null}
          motivo={motivo ?? ""}
          desactualizado={desactualizado}
          textoBoton="Generar resumen"
        >
          <Form.Group className="reporte-filtro">
            <Form.Label htmlFor="res-desde">Desde</Form.Label>
            <Form.Control
              id="res-desde"
              type="date"
              value={borrador.desde}
              onChange={cambiarFiltro("desde")}
            />
          </Form.Group>

          <Form.Group className="reporte-filtro">
            <Form.Label htmlFor="res-hasta">Hasta</Form.Label>
            <Form.Control
              id="res-hasta"
              type="date"
              value={borrador.hasta}
              onChange={cambiarFiltro("hasta")}
            />
          </Form.Group>

          <Form.Group className="reporte-filtro">
            <Form.Label htmlFor="res-moneda">Moneda</Form.Label>
            <Form.Select id="res-moneda" value={borrador.moneda} onChange={cambiarFiltro("moneda")}>
              {MONEDAS.map((moneda) => (
                <option key={moneda} value={moneda}>
                  {moneda}
                </option>
              ))}
            </Form.Select>
          </Form.Group>

          <Form.Group className="reporte-filtro">
            <Form.Label htmlFor="res-fraccion">Fracción</Form.Label>
            {/* El value es el id de la fracción, que es lo que espera el parámetro `fraccion` de
                la API; el número es solo lo que se muestra. No son lo mismo. */}
            <Form.Select
              id="res-fraccion"
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
        </FiltrosReporte>
      ) : (
        /* Los filtros APLICADOS, no el borrador: son los que produjeron lo que se está
           leyendo. El borrador sigue intacto en el hook y vuelve tal cual al abrir. */
        <div className="reporte-resumen__aplicados">
          <p className="reporte-resumen__aplicados-texto">
            {fmtFechaCalendario(aplicados.desde)} – {fmtFechaCalendario(aplicados.hasta)} ·{" "}
            {aplicados.moneda} · {etiquetaFraccion(aplicados.fraccion)}
          </p>
          <button
            type="button"
            className="reporte-resumen__cambiar"
            onClick={() => setFiltrosAbiertos(true)}
          >
            Cambiar filtros
          </button>
        </div>
      )}

      {errorFracciones && (
        <Alert variant="warning" className="reportes-aviso">
          {errorFracciones} Podés generar el resumen sin filtrar por fracción.
        </Alert>
      )}

      {truncado && (
        <AvisoFraccionesTruncadas cantidad={fracciones.length} total={totalFracciones} />
      )}

      {aplicados === null && !cargando && (
        <p className="reporte-sin-consulta">Elegí un período y pulsá Generar resumen</p>
      )}

      {/* Solo la primera carga: con un resumen ya en pantalla, `ResultadoReporte` de abajo es
          el que avisa que se está regenerando, sin tapar el resultado anterior. */}
      {cargando && !datos && <IndicadorCarga texto={TEXTO_CARGANDO} />}

      {!cargando && error && <ErrorReporte mensaje={error} onReintentar={reintentar} />}

      {datos && !error && (
        <ResultadoReporte
          actualizando={cargando && datos !== null}
          textoActualizando={TEXTO_ACTUALIZANDO}
        >
          <div className="reporte-resumen__resultado">
            <section>
              <h3 className="reporte-resumen__rotulo">En pocas palabras</h3>
              <p className="reporte-resumen__texto">{datos.texto}</p>
            </section>

            <section>
              <h3 className="reporte-resumen__rotulo">Temas sugeridos para tratar</h3>
              <ol className="reporte-resumen__puntos">
                {(datos.puntos ?? []).map((punto, indice) => {
                  // `hasOwnProperty` y no un acceso pelado: el tema viene de la respuesta del
                  // modelo, así que "constructor" o "__proto__" no pueden caer en un destino.
                  const destino = Object.prototype.hasOwnProperty.call(
                    DESTINO_POR_TEMA,
                    punto.tema
                  )
                    ? DESTINO_POR_TEMA[punto.tema]
                    : null;

                  return (
                    <li key={indice} className="reporte-resumen__punto">
                      <p className="reporte-resumen__detalle">{punto.detalle}</p>
                      {destino && (
                        <Link to={destino.to} className="reporte-resumen__enlace">
                          {destino.texto}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>

            {datos.datosFaltantes?.length > 0 && (
              <section>
                <h3 className="reporte-resumen__rotulo">Datos que faltan</h3>
                <ul className="reporte-resumen__faltantes">
                  {datos.datosFaltantes.map((falta, indice) => (
                    <li key={indice}>{falta}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* El aviso de IA no es decorativo: el modelo interpreta los números, no los
                calcula, y quien lee tiene que saber que esto lo escribió una IA. */}
            <footer className="reporte-resumen__pie">
              <p>
                Generado con {datos.modelo} · Datos al {fmtFechaCalendario(datos.corte)}
              </p>
              <p>{AVISO_IA}</p>
            </footer>
          </div>
        </ResultadoReporte>
      )}
    </section>
  );
}
