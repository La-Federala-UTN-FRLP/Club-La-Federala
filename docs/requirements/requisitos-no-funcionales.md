# Requisitos no funcionales

| ID | Categoría | Requisito | Criterio de validación | Estado |
|---|---|---|---|---|
| RNF-001 | Seguridad | Rutas protegidas con JWT y rol. | Pruebas de acceso. | Implementado |
| RNF-002 | Seguridad | Secretos por variables de entorno. | Sin claves en código/docs. | Implementado |
| RNF-003 | Trazabilidad | Bajas lógicas conservan fecha y estado. | Flujos desactivar/reactivar. | Implementado |
| RNF-004 | Mantenibilidad | Frontend separado en páginas, componentes, API y utilidades. | Revisión de `frontend/src`. | Implementado |
| RNF-005 | Mantenibilidad | Backend separado en rutas, controladores, servicios y middleware. | Revisión de `Backend/src`. | Implementado |
| RNF-006 | Disponibilidad | Reservas/promociones vencidas se procesan periódicamente. | Job ejecutable y configurable. | Implementado |
| RNF-007 | Compatibilidad | Frontend local con Vite y API configurable. | `npm run dev`. | Implementado |
| RNF-008 | Performance | API sin caché en recursos protegidos. | `Cache-Control: no-store`. | Implementado |
