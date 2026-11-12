// components/FilterBar/FilterBarLotes.jsx
// Wrapper específico para lotes que usa FilterBarBase genérico

import { useMemo } from "react";
import FilterBarBase from "./FilterBarBase";
import { lotesFilterPreset } from "./presets/lotes.preset";
import { chipsFrom, nice } from "./utils/chips";
import { filterEstadoOptionsFor, canUseDeudorFilter } from "../../lib/auth/rbac.ui";
import { hasRole } from "../../lib/auth/rbac";

export default function FilterBarLotes({
  preset = lotesFilterPreset,
  variant = "dashboard",
  userRole = "GENERAL",
  onParamsChange,
  onSearchChange, // Callback opcional para búsqueda (manejo separado)
}) {
  const authUser = useMemo(() => ({ role: String(userRole).toUpperCase() }), [userRole]);
  // Catálogos desde preset, filtrados por RBAC (ALQUILADO removido como estado)
  const ALL_ESTADOS = useMemo(
    () => preset?.catalogs?.ESTADOS ?? ["DISPONIBLE", "NO_DISPONIBLE", "RESERVADO", "VENDIDO", "EN_PROMOCION"],
    [preset]
  );
  const ESTADOS = useMemo(
    () => filterEstadoOptionsFor(authUser, ALL_ESTADOS),
    [authUser, ALL_ESTADOS]
  );

  const canDeudor = canUseDeudorFilter(authUser);
  // isInmo y canDeudor no son equivalentes: TECNICO tampoco usa el filtro deudor.
  const isInmo = hasRole(authUser, "INMOBILIARIA");

  const SUBESTADOS = useMemo(
    () => preset?.catalogs?.SUBESTADOS ?? ["CONSTRUIDO", "EN_CONSTRUCCION", "NO_CONSTRUIDO"],
    [preset]
  );
  const CALLES = useMemo(() => preset?.catalogs?.CALLES ?? [
    "REINAMORA", "MACA", "ZORZAL", "CAUQUEN", "ALONDRA", "JACANA", "TACUARITO", 
    "JILGUERO", "GOLONDRINA", "CALANDRIA", "AGUILAMORA", "LORCA", "MILANO"
  ], [preset]);
  const FRACCIONES = useMemo(() => preset?.catalogs?.FRACCIONES ?? [
    "3", "4", "6", "7", "8", "11", "14", "15"
  ], [preset]);

  // Configuración de campos para lotes
  const fields = useMemo(() => [
    {
      id: 'q',
      type: 'search',
      label: 'Búsqueda',
      placeholder: 'Lote, propietario, ubicación...',
      defaultValue: ''
    },
    {
      id: 'estado',
      type: 'multiSelect',
      label: 'Estado',
      defaultValue: []
    },
    {
      id: 'ocupacion',
      type: 'singleSelect',
      label: 'Ocupación',
      defaultValue: null
    },
    {
      id: 'subestado',
      type: 'multiSelect',
      label: 'Subestado',
      defaultValue: []
    },
    {
      id: 'calle',
      type: 'multiSelect',
      label: 'Calle',
      defaultValue: [],
      useGrid: true
    },
    {
      id: 'fraccion',
      type: 'multiSelect',
      label: 'Fracción',
      defaultValue: [],
      useGrid: true
    },
    {
      id: 'tipo',
      type: 'singleSelect',
      label: 'Tipo',
      defaultValue: null
    },
    {
      id: 'sup',
      type: 'range',
      label: 'Superficie',
      defaultValue: { min: null, max: null }
    },
    {
      id: 'precio',
      type: 'range',
      label: 'Precio',
      defaultValue: { min: null, max: null }
    },
    ...(canDeudor ? [{
      id: 'deudor',
      type: 'singleSelect',
      label: 'Deudor',
      defaultValue: null
    }] : [])
  ], [canDeudor]);

  // Catálogos para lotes (filtrados por RBAC)
  const catalogs = useMemo(() => ({
    estado: ESTADOS,
    ocupacion: [
      { value: 'ALQUILADO', label: 'Alquilado' },
      { value: 'NO_ALQUILADO', label: 'No alquilado' }
    ],
    subestado: SUBESTADOS,
    calle: CALLES,
    fraccion: FRACCIONES,
    tipo: [
      { value: 'LOTE_VENTA', label: 'Lote Venta' },
      { value: 'ESPACIO_COMUN', label: 'Espacio Común' }
    ],
    ...(canDeudor ? { deudor: [true, false] } : {})
  }), [ESTADOS, SUBESTADOS, CALLES, FRACCIONES, canDeudor]);

  // Configuración de rangos para lotes
  const ranges = useMemo(() => ({
    sup: preset?.ranges?.sup ?? { minLimit: 0, maxLimit: 5000, step: 1, unit: "m²" },
    precio: preset?.ranges?.precio ?? { minLimit: 0, maxLimit: 300000, step: 100, unit: "USD" },
  }), [preset]);

  // Valores por defecto para lotes
  const defaults = useMemo(() => ({
    q: "",
    estado: [],
    ocupacion: null,
    subestado: [],
    calle: [],
    fraccion: [],
    tipo: null,
    sup: { min: null, max: null },
    precio: { min: null, max: null },
    ...(canDeudor ? { deudor: null } : {})
  }), [canDeudor]);

  // Configuración de vistas con RBAC
  const viewsConfig = useMemo(() => ({
    isInmo,
    sanitizeForRole: (filters) => {
      // Aplicar sanitización RBAC
      if (isInmo) {
        return {
          ...filters,
          estado: filters.estado?.filter(v => v !== "NO_DISPONIBLE") || [],
          deudor: null
        };
      }
      if (!canDeudor) {
        return { ...filters, deudor: null };
      }
      return filters;
    }
  }), [isInmo, canDeudor]);

  // Función para formatear opciones en el modal
  const optionFormatter = useMemo(() => ({
    estado: nice,
    ocupacion: (val) => val === 'ALQUILADO' ? 'Alquilado' : val === 'NO_ALQUILADO' ? 'No alquilado' : val,
    subestado: nice,
    calle: nice,
    fraccion: (val) => `Fracción ${val}`,
    tipo: (val) => val === 'LOTE_VENTA' ? 'Lote Venta' : val === 'ESPACIO_COMUN' ? 'Espacio Común' : val,
    deudor: (val) => val === true ? "Solo deudor" : val === false ? "Sin deuda" : val
  }), []);

  // Función para formatear chips (usando la existente)
  const chipsFormatter = useMemo(() => (appliedFilters, catalogs) => {
    return chipsFrom(appliedFilters, defaults, isInmo);
  }, [defaults, isInmo]);

  return (
    <FilterBarBase
      fields={fields}
      catalogs={catalogs}
      ranges={ranges}
      defaults={defaults}
      viewsConfig={viewsConfig}
      variant={variant}
      onParamsChange={onParamsChange}
      onSearchChange={onSearchChange}
      chipsFormatter={chipsFormatter}
      optionFormatter={optionFormatter}
    />
  );
}