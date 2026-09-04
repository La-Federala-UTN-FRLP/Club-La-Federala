# Matriz de trazabilidad

| Necesidad | Requisito | Caso de uso | Archivo / módulo | Test asociado | Estado |
|---|---|---|---|---|---|
| Centralizar lotes | RF-002 | CU-002 | `lote.service.ts`, `Dashboard.jsx` | `lote.service.test.ts` | Implementado |
| Intermediación inmobiliaria | RF-003 | CU-003 | `reserva.service.ts`, `Reservas.jsx` | `reserva.service.test.ts` | Implementado |
| Ventas y cobros | RF-004, RF-005 | CU-004, CU-005 | `venta.service.ts`, `pago.service.ts` | `ventas.service.test.ts` | Implementado |
| Control de acceso | RF-001 | CU-001 | `auth.middleware.ts`, `rbac.js` | Pendiente de inventario específico | Implementado |
| Documentos | RF-007 | CU-007 | `file.service.ts`, `api/archivos.js` | Pendiente | Implementado |
| Personas | RF-008 | CU-008 | `persona.service.ts`, `Personas.jsx` | Pendiente | Implementado |
| Vencimientos | RF-010 | CU-010 | `jobs/runExpirations.ts` | Pendiente | Implementado |
