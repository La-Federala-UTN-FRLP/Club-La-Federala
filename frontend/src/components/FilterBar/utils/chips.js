// Convierte los filtros aplicados en "chips" para mostrar en la UI
// y también tiene la función "nice" para formatear strings (ej: "NO_DISPONIBLE" -> "No Disponible")
export const nice = (s) =>
  (s ?? "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

export function chipsFrom(applied, D, isInmo) {
  const arr = [];
  if (applied.q) arr.push({ k: "q", label: `Buscar: ${applied.q}` });

  (applied.estado || [])
    .filter((v) => (isInmo ? v !== "NO_DISPONIBLE" : true))
    .forEach((v) => arr.push({ k: "estado", v, label: nice(v) }));

  (applied.subestado || []).forEach((v) => arr.push({ k: "subestado", v, label: nice(v) }));
  if (applied.ocupacion) {
    const ocupacionLabel = applied.ocupacion === 'ALQUILADO' ? 'Alquilado' : applied.ocupacion === 'NO_ALQUILADO' ? 'No alquilado' : nice(applied.ocupacion);
    arr.push({ k: "ocupacion", v: applied.ocupacion, label: `Ocupación: ${ocupacionLabel}` });
  }
  (applied.calle || []).forEach((v) => arr.push({ k: "calle", v, label: nice(v) }));
  (applied.fraccion || []).forEach((v) => arr.push({ k: "fraccion", v, label: `Fracción ${v}` }));

  if (applied.tipo) {
    const tipoLabel = applied.tipo === 'LOTE_VENTA' ? 'Lote Venta' : applied.tipo === 'ESPACIO_COMUN' ? 'Espacio Común' : applied.tipo;
    arr.push({ k: "tipo", v: applied.tipo, label: tipoLabel });
  }

  if (applied.sup && (applied.sup.min !== D.sup.min || applied.sup.max !== D.sup.max)) {
    arr.push({ k: "sup", label: `Sup ${applied.sup.min}–${applied.sup.max} m²` });
  }
  if (applied.precio && (applied.precio.min !== D.precio.min || applied.precio.max !== D.precio.max)) {
    arr.push({ k: "precio", label: `Precio ${applied.precio.min}–${applied.precio.max} USD` });
  }
  if (!isInmo && applied.deudor != null) {
    arr.push({ k: "deudor", label: applied.deudor ? "Solo deudor" : "Sin deuda" });
  }
  return arr;
}
