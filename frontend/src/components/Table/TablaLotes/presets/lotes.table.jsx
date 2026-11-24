// src/components/TablaLotes/presets/lotes.table.jsx
import React from 'react';
// Reutiliza helpers y lo que hace es construir la configuración de la tabla para cada rol.

export const lotesTablePreset = {
  key: 'lotes',

  COLUMN_TEMPLATES_BY_ROLE: {
    admin:        ['id','estado','subestado','propietario','precio','deuda'],
    gestor:       ['id','estado','subestado','propietario','precio','deuda'],
    tecnico:      ['id','estado','subestado','superficie'],
    inmobiliaria: ['id','estado','propietario','ubicacion','precio'],
  },

  widthFor(id) {
    switch (id) {
      case 'id':         return '96px';
      case 'estado':     return '160px';
      case 'subestado':  return '170px';
      case 'propietario':return '220px';
      case 'ubicacion':  return '180px';
      case 'tipo':       return '140px';
      case 'fraccion':   return '120px';
      case 'inquilino':  return '200px';
      case 'ocupacion':  return '141px';
      case 'numPartida': return '120px';
      case 'descripcion':return 'minmax(280px,370px)';
      case 'superficie': return '120px';
      case 'precio':     return '140px';
      case 'deuda':      return '140px';
      default:           return 'minmax(140px,1fr)';
    }
  },

  // Construye las columnas con tus helpers 
  makeColumns({ cells = {}, fmt = {}, getters = {} } = {}) {
    const estadoBadge    = cells.estadoBadge;
    const subestadoBadge = cells.subestadoBadge;

    const fmtMoney = fmt.fmtMoney;
    const fmtM2    = fmt.fmtM2;
    const fmtM     = fmt.fmtM;

    const getPropietarioNombre = getters.getPropietarioNombre;
    const getUbicacion         = getters.getUbicacion;
    const getTipo              = getters.getTipo;
    const getFraccion          = getters.getFraccion;
    const getInquilino         = getters.getInquilino;
    const getOcupacion         = getters.getOcupacion;
    const getNumPartida        = getters.getNumPartida;
    const getLoteIdFormatted   = getters.getLoteIdFormatted;

    return [
      {
        id: 'id',
        titulo: 'ID',
        accessor: (l) => getLoteIdFormatted(l),
        align: 'center'
      },
      { id: 'estado',      titulo: 'Estado',      accessor: (l) => estadoBadge(l.estado),               align: 'center' },
      { id: 'subestado',   titulo: 'Subestado',   accessor: (l) => subestadoBadge(l.subestado),         align: 'center' },
      { id: 'propietario', titulo: 'Propietario', accessor: (l) => getPropietarioNombre(l),             align: 'center' },
      { id: 'precio',      titulo: 'Precio',      accessor: (l) => fmtMoney(l.precio),                  align: 'center' },
      {
        id: 'deuda',
        titulo: 'Deuda',
        accessor: (l) =>
          l.deuda == null ? (
            <span className="tl-badge tl-badge--muted">N/D</span>
          ) : l.deuda ? (
            <span className="tl-badge tl-badge--danger">DEUDOR</span>
          ) : (
            <span className="tl-badge tl-badge--success">AL DÍA</span>
          ),
        align: 'center',
      },
      { id: 'numPartida',  titulo: 'N° Partida',  accessor: (l) => getNumPartida(l),                   align: 'center' },
      { id: 'tipo',        titulo: 'Tipo',        accessor: (l) => getTipo(l),                          align: 'center' },
      { id: 'fraccion',    titulo: 'Fracción',    accessor: (l) => getFraccion(l),                      align: 'center' },
      { id: 'ubicacion',   titulo: 'Ubicación',   accessor: (l) => getUbicacion(l),                      align: 'center' },
      { id: 'superficie',  titulo: 'Superficie',  accessor: (l) => fmtM2(l.superficie ?? l.metros ?? l.m2), align: 'right' },
      { id: 'descripcion', titulo: 'Descripción', accessor: (l) => l.descripcion ?? '—',                align: 'left'   },
      { id: 'inquilino',   titulo: 'Inquilino',   accessor: (l) => getInquilino(l),                      align: 'center' },
      {
        id: 'ocupacion',
        titulo: 'Ocupación',
        accessor: (l) => {
          const ocupacion = getOcupacion(l);
          return ocupacion === 'ALQUILADO' ? (
            <span className="tl-badge tl-badge--indigo">Alquilado</span>
          ) : (
            <span className="tl-badge tl-badge--muted">No alquilado</span>
          );
        },
        align: 'center',
      },
    ];
  },
};
