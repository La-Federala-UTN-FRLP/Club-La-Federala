# Reglas de negocio

## RN-001 - La reserva bloquea temporalmente un lote
### Descripción
Una reserva registra el estado previo del lote y una fecha de finalización.
### Justificación
Evita inconsistencias de disponibilidad durante una negociación.
### Impacto en el sistema
`Reserva`, `Lote`, servicios y jobs de expiración.
### Ejemplo
Un lote disponible queda reservado hasta resolución o vencimiento.
### Estado
Vigente

## RN-002 - Una venta puede consumir una única reserva
### Descripción
Una reserva puede asociarse de forma única a una venta.
### Justificación
Mantiene la trazabilidad comercial.
### Impacto en el sistema
`Reserva`, `Venta` y servicio de ventas.
### Ejemplo
Al concretarse una venta desde una reserva, ambas quedan vinculadas.
### Estado
Vigente

## RN-003 - La inmobiliaria opera solo sus datos comerciales
### Descripción
El backend limita reservas y prioridades al alcance de la inmobiliaria.
### Justificación
Protege información entre agencias.
### Impacto en el sistema
JWT, autorización y servicios.
### Ejemplo
Una inmobiliaria no consulta reservas de otra.
### Estado
Vigente

## RN-004 - La eliminación lógica conserva historial operativo
### Descripción
Las entidades relevantes usan `estadoOperativo` y `fechaBaja`.
### Justificación
Preserva trazabilidad y relaciones.
### Impacto en el sistema
Lotes, personas, reservas, ventas, inmobiliarias, prioridades y archivos.
### Ejemplo
Una persona asociada se desactiva sin borrarse físicamente.
### Estado
Vigente

## RN-005 - Las promociones restauran el contexto del lote
### Descripción
Una promoción conserva precio y estado anteriores para restaurarlos al finalizar.
### Justificación
Una condición temporal no debe alterar el inventario permanentemente.
### Impacto en el sistema
`Promocion`, `Lote` y job de expiración.
### Ejemplo
Al vencer la promoción se recupera el precio previo.
### Estado
Vigente
