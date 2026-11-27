// src/components/Reportes/useCatalogoFracciones.js
// Catálogo de fracciones para el filtro de un reporte (39.5).
//
// Era el mismo efecto escrito tres veces, byte a byte, en las tres vistas de Reportes. Se movió
// acá sin cambiarle nada: el mismo pedido, el mismo patrón `cancelado` y el mismo mensaje.
//
// El <Alert> del aviso y el <Form.Select> se quedan en cada vista: el aviso termina con el
// nombre del reporte ("…sin filtrar por fracción") y el select va entre los demás campos.

import { useEffect, useState } from "react";
import { getFraccionesReporte } from "../../lib/api/reportes";
import { parseApiError } from "../../lib/http/errors";

/**
 * @returns {{fracciones: Array<{id: number, numero: number}>, errorFracciones: string|null,
 *   truncado: boolean}}
 *   `fracciones` arranca vacío, que es lo que deshabilita el select hasta que llegue el
 *   catálogo, y `errorFracciones` en null. Un error no vacía la lista ni al revés. `truncado` es
 *   true solo cuando el backend informó un `total` válido y mayor que lo que se pudo listar: el
 *   límite de `GET /fracciones` (como máximo 10 por llamada) dejó fracciones sin mostrar.
 */
export default function useCatalogoFracciones() {
  const [fracciones, setFracciones] = useState([]);
  const [errorFracciones, setErrorFracciones] = useState(null);
  const [totalFracciones, setTotalFracciones] = useState(null);

  // Catálogo del filtro de fracción: se pide una vez y no depende de los filtros.
  useEffect(() => {
    let cancelado = false;
    getFraccionesReporte()
      .then(({ fracciones: lista, total }) => {
        if (!cancelado) {
          setFracciones(lista);
          setTotalFracciones(total);
        }
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

  // Sin un `total` válido no hay con qué comparar: queda sin truncar, en lugar de romper o
  // avisar de algo que no se puede confirmar.
  const truncado = totalFracciones !== null && totalFracciones > fracciones.length;

  return { fracciones, errorFracciones, truncado, totalFracciones };
}
