# Matriz de permisos por rol (RBAC)

Compara lo que permite el backend con lo que muestra el frontend, para cada rol. Sirve para definir el contrato en cada diferencia: las diferencias encontradas y la decisión de cada una están en [Diferencias y decisiones](#diferencias-y-decisiones).

- **Fecha del relevamiento:** 2026-11-25, sobre `main`.
- **Roles:** `ADMINISTRADOR` (ADMIN), `GESTOR`, `INMOBILIARIA` (INMO) y `TECNICO`.
- **Fuente:** el código, sin pruebas manuales. Cada fila tiene su referencia `archivo:línea`.
  - Backend: `Backend/src/routes/*.routes.ts` (roles de `authorize()`) y las reglas extra de `services/`, `controllers/` y `utils/`.
  - Frontend: `frontend/src/lib/auth/rbac.js` (permisos por rol), `rbac.ui.js` (módulos y helpers), `App.jsx` (rutas) y las condiciones de cada pantalla.
- Los endpoints son relativos a `/api`. `POST /auth/login` es público y no aparece en las tablas.

**Cómo leer las columnas**

- **ADMIN / GESTOR / INMOBILIARIA / TECNICO:** lo que acepta el backend. `Sí`, `No` o `Sí, solo propias` (la regla de tenant del service: lo de su inmobiliaria; lo ajeno responde 403 o 404).
- **Pantalla:** quién ve la acción en el frontend.
- **¿Coincide?:** `Sí`, `No (Dn)` (ver la diferencia n) o `Sin pantalla` (el backend lo expone, pero ninguna pantalla lo usa).

## Menú y rutas por rol

El menú lateral muestra un módulo si el rol tiene su permiso `*_ACCESS` (`rbac.ui.js:8-15`, `Sidebar.jsx:73`). Las rutas usan el mismo permiso con `<RequireRole>` (`App.jsx:37-89`). Una ruta no permitida muestra la pantalla 403.

| Módulo | Ruta | Permiso | ADMIN | GESTOR | INMOBILIARIA | TECNICO | Referencias |
|---|---|---|---|---|---|---|---|
| Lotes (tablero) | `/` | Solo sesión | Sí | Sí | Sí | Sí | `App.jsx:34` |
| Mapa | `/map` | Solo sesión (ver nota) | Sí | Sí | Sí | Sí | `App.jsx:35` |
| Prioridades | `/prioridades` | `PRIORITY_ACCESS` | Sí | Sí | Sí | No | `rbac.js:83`, `:105`, `:119`, `App.jsx:39` |
| Reservas | `/reservas` | `RES_ACCESS` | Sí | Sí | Sí | No | `rbac.js:71`, `:95`, `:115`, `App.jsx:71` |
| Ventas y pagos | `/ventas`, `/ventas/:ventaId/pagos` | `SALE_ACCESS` | Sí | Sí | No | No | `rbac.js:68`, `:93`, `App.jsx:55`, `:63` |
| Inmobiliarias | `/inmobiliarias` | `AGENCY_ACCESS` | Sí | Sí | No | No | `rbac.js:74`, `:97`, `App.jsx:47` |
| Personas | `/personas` | `PEOPLE_ACCESS` | Sí | Sí | Sí (Mis clientes) | Sí (solo lectura) | `rbac.js:80`, `:102`, `:117`, `:128`, `Sidebar.jsx:77-86`, `App.jsx:79` |
| Reportes | `/reportes` | `REPORTS_ACCESS` | Sí | Sí | No | No | `rbac.js:86`, `:108`, `App.jsx:87` |
| Mi Cuenta | Menú de usuario | `ACCOUNT_ACCESS` | Sí | Sí | Sí | Sí | `rbac.js:86`, `:108`, `:121`, `:130` |

## Campos visibles por rol

El backend filtra estos campos en la respuesta. La pantalla los oculta con la misma regla.

| Dato | ADMIN | GESTOR | INMOBILIARIA | TECNICO | Backend | Pantalla |
|---|---|---|---|---|---|---|
| Lotes `NO_DISPONIBLE` | Sí | Sí | No (lista sin ellos, detalle 404) | Sí | `lote.service.ts:217-219`, `:394` | Filtro de estado sin `NO_DISPONIBLE` (`rbac.ui.js:97-101`) |
| Deuda del lote | Sí | Sí | No | No | `lote.service.ts:51-62`, `:344-348`, `:415-420` | `canSeeDeuda` (`rbac.ui.js:112-114`, `LoteVerCard.jsx:308`, `TablaLotes.jsx:292`) |
| Filtro `deudor` | Sí | Sí | No (400) | No (400) | `lote.service.ts:228-232` | `canUseDeudorFilter` (`rbac.ui.js:104-108`, `FilterBarLotes.jsx:29`) |
| Ventas y reservas embebidas en el lote | Sí | Sí | No | No | `lote.service.ts:51-62` | No se muestran a esos roles |
| Documento del propietario e inquilino | Sí | Sí | No (se mantienen nombre y razón social) | Sí | `lote.service.ts:65-82` | Muestra lo que llega |
| Titular de prioridades del lote | Sí | Sí | Solo las propias (las ajenas llegan como `{ id }`) | Sí | `lote.service.ts:85-89` | Muestra lo que llega |
| Promoción activa de un lote `NO_DISPONIBLE` | Sí | Sí | No (responde sin promoción) | Sí | `promocion.service.ts:155` | Muestra lo que llega |
| Personas `ELIMINADO` | Sí | Sí | No (404) | No (404) | `persona.service.ts:461-468`, `:582-588` | Filtros de eliminadas solo ADMIN y GESTOR (`FilterBarPersonas.jsx:29`) |
| Asociaciones en el detalle de persona | Propietario, Inquilino, Reservas y Ventas (todas) | Propietario, Inquilino, Reservas y Ventas (todas) | Datos de la persona y Reservas solo con su inmobiliaria (lista y cantidad). No ve Propietario ni Inquilino, ni Ventas (no tiene `SALE_VIEW`) | Propietario e Inquilino. No ve Reservas ni Ventas (no tiene `RES_VIEW` ni `SALE_VIEW`) | `persona.service.ts:417-419`, `:432-433`, `:443-449` (listado de INMOBILIARIA) | Reservas muestra lo que llega. Para INMO no se dibujan Propietario ni Inquilino, y Ventas no se muestra sin `SALE_VIEW` (`PersonaVerCard.jsx:129`, `:135`, `:246`, `:374-382`, `:398-400`) |
| Archivos por tipo | Todos | Todos | `PLANO`, `IMAGEN` y documentos de venta propios | `PLANO` e `IMAGEN` | `file.auth.utils.ts:58-67`, `:89` | TECNICO solo ve la pestaña Planos (`LoteVerCard.jsx:321-323`) |

## Lotes

| Acción | Endpoint | ADMIN | GESTOR | INMOBILIARIA | TECNICO | Pantalla (qué ve cada rol) | ¿Coincide? | Referencias |
|---|---|---|---|---|---|---|---|---|
| Listar lotes | `GET /lotes` | Sí | Sí | Sí (sin `NO_DISPONIBLE`, campos filtrados) | Sí (campos filtrados) | Todos ven tablero y mapa | Sí | `lote.routes.ts:12-15`, `lote.service.ts:217-219`, `:344-348` |
| Ver lote | `GET /lotes/:id` | Sí | Sí | Sí (`NO_DISPONIBLE` responde 404) | Sí (campos filtrados) | Todos ven "Ver" | Sí | `lote.routes.ts:20-23`, `lote.service.ts:394`, `TablaLotes.jsx:420` |
| Crear lote | `POST /lotes` | Sí | Sí | No | No | "+ Agregar Lote" para ADMIN y GESTOR (`LOT_CREATE`) | Sí (D4) | `lote.routes.ts:28-31`, `rbac.ui.js:61`, `TablaLotes.jsx:421`, `:553` |
| Editar lote | `PUT /lotes/:id` | Sí | Sí | No | Sí (solo subestado, superficie y archivos) | ADMIN y GESTOR editan todo. TECNICO solo subestado y superficie. INMO no ve Editar | Sí | `lote.routes.ts:36-39`, `lote.service.ts:535-551`, `LoteEditarCard.jsx:171`, `LoteSidePanel.jsx:248-253` |
| Eliminar lote | `DELETE /lotes/:id` | Sí | No | No | No | "Eliminar Lote" solo ADMIN | Sí (D3) | `lote.routes.ts:45-48`, `rbac.js:92`, `rbac.ui.js:64`, `TablaLotes.jsx:719` |
| Aplicar promoción | `POST /lotes/:id/promociones/aplicar` | Sí | Sí | No | No | ADMIN y GESTOR (`LOT_PROMO`) | Sí | `lote.routes.ts:53-56`, `rbac.ui.js:65`, `TablaLotes.jsx:724` |
| Quitar promoción | `POST /lotes/:id/promociones/quitar` | Sí | Sí | No | No | ADMIN y GESTOR (`LOT_PROMO`) | Sí | `lote.routes.ts:62-65`, `rbac.ui.js:65`, `TablaLotes.jsx:724` |
| Ver promoción activa | `GET /lotes/:id/promociones/activa` | Sí | Sí | Sí (`NO_DISPONIBLE` responde sin promoción) | Sí | Todos ven el precio con promoción | Sí | `lote.routes.ts:70-73`, `promocion.service.ts:155` |

## Reservas

| Acción | Endpoint | ADMIN | GESTOR | INMOBILIARIA | TECNICO | Pantalla (qué ve cada rol) | ¿Coincide? | Referencias |
|---|---|---|---|---|---|---|---|---|
| Listar reservas | `GET /reservas` | Sí | Sí | Sí, solo propias | No | ADMIN, GESTOR e INMO | Sí | `reserva.routes.ts:13-16`, `reserva.service.ts:120-122` |
| Ver reserva | `GET /reservas/:id` | Sí | Sí | Sí, solo propias | No | "Ver Reserva" para ADMIN, GESTOR e INMO | Sí | `reserva.routes.ts:23-26`, `reserva.service.ts:177-183`, `TablaReservas.jsx:316` |
| Reservas de una inmobiliaria | `GET /reservas/inmob/:id` | Sí | Sí | Sí, solo su id | No | Ninguna pantalla lo usa | Sin pantalla | `reserva.routes.ts:31-34`, `reserva.service.ts:192-197` |
| Crear reserva | `POST /reservas` | Sí | Sí | Sí (con su inmobiliaria, no sobre `NO_DISPONIBLE` ni prioridad del Club) | No | ADMIN, GESTOR e INMO (tabla y "Reservar" del mapa) | Sí | `reserva.routes.ts:39-42`, `reserva.service.ts:226`, `:271-293`, `:321-327`, `Reservas.jsx:629`, `LoteSidePanel.jsx:239` |
| Editar reserva | `PUT /reservas/:id` | Sí | Sí | No | No | "Editar Reserva" (tabla y detalle) solo ADMIN y GESTOR | Sí (D1) | `reserva.routes.ts:47-50`, `rbac.js:115`, `TablaReservas.jsx:321-325`, `ReservaVerCard.jsx:163`, `Reservas.jsx:641` |
| Eliminar reserva | `PATCH /reservas/:id/eliminar` | Sí | Sí | Sí, solo propias | No | "Eliminar Reserva" solo ADMIN y GESTOR | No (D2) | `reserva.routes.ts:56-59`, `reserva.service.ts:714-716`, `Reservas.jsx:137`, `:626` |
| Reactivar reserva | `PATCH /reservas/:id/reactivar` | Sí | Sí | Sí, solo propias | No | "Reactivar Reserva" solo ADMIN y GESTOR | No (D2) | `reserva.routes.ts:65-68`, `reserva.service.ts:808-810`, `Reservas.jsx:627` |
| Ver ofertas | `GET /reservas/:id/ofertas` | Sí | Sí | Sí, solo propias | No | "Ver Ofertas" para ADMIN, GESTOR e INMO | Sí | `reserva.routes.ts:75-78`, `reserva.service.ts:868-870`, `TablaReservas.jsx:326-330` |
| Ofertar, aceptar o rechazar | `POST /reservas/:id/ofertas` | Sí | Sí | Sí, solo propias | No | ADMIN, GESTOR e INMO desde Ver Ofertas | Sí | `reserva.routes.ts:84-87`, `reserva.service.ts:896-898`, `OfertasReservaCard.jsx:105-108` |

## Prioridades

| Acción | Endpoint | ADMIN | GESTOR | INMOBILIARIA | TECNICO | Pantalla (qué ve cada rol) | ¿Coincide? | Referencias |
|---|---|---|---|---|---|---|---|---|
| Listar prioridades | `GET /prioridades` | Sí | Sí | Sí, solo propias | No | ADMIN, GESTOR e INMO | Sí | `prioridad.routes.ts:18-21`, `prioridad.service.ts:299-301` |
| Ver prioridad | `GET /prioridades/:id` | Sí | Sí | Sí, solo propias | No | ADMIN, GESTOR e INMO | Sí | `prioridad.routes.ts:29-32`, `prioridad.service.ts:577-584` |
| Crear prioridad | `POST /prioridades` | Sí | Sí | Sí (con su inmobiliaria, no sobre `NO_DISPONIBLE`) | No | ADMIN, GESTOR e INMO. Solo ADMIN y GESTOR eligen la inmobiliaria | Sí | `prioridad.routes.ts:40-43`, `prioridad.service.ts:142`, `:190-224`, `Prioridades.jsx:405`, `PrioridadCrearCard.jsx:540` |
| Editar prioridad | `PATCH /prioridades/:id` | Sí | Sí | Sí, solo propias (sin cambiar inmobiliaria ni fecha fin) | No | "Editar Prioridad" para ADMIN, GESTOR e INMO | Sí | `prioridad.routes.ts:52-55`, `prioridad.service.ts:749-762`, `:844-855`, `TablaPrioridades.jsx:200`, `PrioridadEditarCard.jsx:257`, `:276` |
| Cancelar prioridad | `PATCH /prioridades/:id/cancelar` | Sí | Sí | Sí, solo propias | No | Desde Editar Prioridad (ADMIN, GESTOR e INMO) | Sí | `prioridad.routes.ts:64-67`, `prioridad.service.ts:613-619`, `PrioridadEditarCard.jsx:332` |
| Finalizar prioridad | `PATCH /prioridades/:id/finalizar` | Sí | Sí | Sí, solo propias | No | Desde Editar Prioridad (ADMIN, GESTOR e INMO) | Sí | `prioridad.routes.ts:75-78`, `prioridad.service.ts:656-662`, `PrioridadEditarCard.jsx:330` |
| Expirar vencidas (manual) | `POST /prioridades/jobs/expire` | Sí | Sí | No | No | Ninguna pantalla tiene el botón (existe en la capa API) | Sin pantalla | `prioridad.routes.ts:86-89`, `lib/api/prioridades.js:256-258` |
| Eliminar prioridad | `PATCH /prioridades/:id/eliminar` | Sí | Sí | Sí, solo propias | No | "Eliminar Prioridad" para ADMIN y GESTOR. INMO no lo ve, por decisión | No (D5) | `prioridad.routes.ts:96-99`, `prioridad.service.ts:412`, `rbac.js:84`, `:106`, `TablaPrioridades.jsx:210` |
| Reactivar prioridad | `PATCH /prioridades/:id/reactivar` | Sí | Sí | Sí, solo propias | No | "Reactivar Prioridad" para ADMIN y GESTOR. INMO no lo ve, por decisión | No (D5) | `prioridad.routes.ts:107-110`, `prioridad.service.ts:504`, `rbac.js:84`, `:106`, `TablaPrioridades.jsx:210-219` |

## Ventas y pagos

| Acción | Endpoint | ADMIN | GESTOR | INMOBILIARIA | TECNICO | Pantalla (qué ve cada rol) | ¿Coincide? | Referencias |
|---|---|---|---|---|---|---|---|---|
| Listar ventas | `GET /ventas` | Sí | Sí | No | No | ADMIN y GESTOR | Sí | `ventas.routes.ts:19-22`, `rbac.js:68`, `:93` |
| Ventas de una inmobiliaria | `GET /ventas/inmobiliaria/:id` | Sí | Sí | Sí, solo su id | No | INMO no tiene el módulo Ventas | No (D8) | `ventas.routes.ts:27-30`, `venta.service.ts:169-174`, `rbac.js:111-122` |
| Ver venta | `GET /ventas/:id` | Sí | Sí | No | No | "Ver" para ADMIN y GESTOR | Sí | `ventas.routes.ts:36-39`, `TablaVentas.jsx:219` |
| Registrar venta | `POST /ventas` | Sí | Sí | No | No | ADMIN y GESTOR (tabla de ventas y tablero de lotes) | Sí | `ventas.routes.ts:44-47`, `Ventas.jsx:609`, `TablaLotes.jsx:423` |
| Editar venta | `PUT /ventas/:id` | Sí | Sí | No | No | ADMIN y GESTOR | Sí | `ventas.routes.ts:52-55`, `TablaVentas.jsx:221` |
| Eliminar venta | `PATCH /ventas/:id/eliminar` | Sí | Sí | No | No | ADMIN y GESTOR | Sí | `ventas.routes.ts:62-65`, `TablaVentas.jsx:223` |
| Reactivar venta | `PATCH /ventas/:id/reactivar` | Sí | Sí | No | No | ADMIN y GESTOR | Sí | `ventas.routes.ts:72-75`, `Ventas.jsx:177` |
| Ver pagos | `GET /ventas/:ventaId/pagos` | Sí | Sí | No | No | ADMIN y GESTOR | Sí | `ventas.routes.ts:83-86`, `App.jsx:53-57` |
| Registrar recargo | `POST /ventas/:ventaId/pagos/recargo` | Sí | Sí | No | No | ADMIN y GESTOR (`SALE_EDIT`) | Sí | `ventas.routes.ts:91-94`, `VentaPagosPage.jsx:446-629` |
| Registrar pago | `POST /ventas/:ventaId/pagos` | Sí | Sí | No | No | ADMIN y GESTOR (`SALE_EDIT`) | Sí | `ventas.routes.ts:100-103`, `VentaPagosPage.jsx:446-629` |
| Reemplazar plan de pagos | `POST /ventas/:ventaId/pagos/plan/reemplazar` | Sí | Sí | No | No | ADMIN y GESTOR (`SALE_EDIT`) | Sí | `ventas.routes.ts:109-112`, `VentaPagosPage.jsx:446-629` |
| Crear plan de pagos | `POST /ventas/:ventaId/pagos/plan` | Sí | Sí | No | No | ADMIN y GESTOR (`SALE_EDIT`) | Sí | `ventas.routes.ts:118-121`, `VentaPagosPage.jsx:446-629` |

`venta.service.ts` tiene ramas para INMOBILIARIA en eliminar y reactivar (`:495`, `:548`), pero las rutas solo aceptan ADMIN y GESTOR: nunca se ejecutan. Es la decisión cerrada de `backend.md` (Matriz RBAC: decisiones cerradas).

## Personas

| Acción | Endpoint | ADMIN | GESTOR | INMOBILIARIA | TECNICO | Pantalla (qué ve cada rol) | ¿Coincide? | Referencias |
|---|---|---|---|---|---|---|---|---|
| Listar personas | `GET /personas` | Sí | Sí | Sí (solo Mis clientes, sin eliminadas) | Sí (sin eliminadas) | Todos. INMO solo "Ver Mis Clientes" | Sí | `persona.routes.ts:13-16`, `persona.service.ts:404-415`, `:461-468`, `Sidebar.jsx:77-86` |
| Buscar por CUIL | `GET /personas/cuil/:cuil` | Sí | Sí | No | Sí | Ninguna pantalla lo usa (existe en la capa API) | Sin pantalla | `persona.routes.ts:23-26`, `lib/api/personas.js:149` |
| Ver persona | `GET /personas/:id` | Sí | Sí | No | Sí | ADMIN, GESTOR y TECNICO abren el detalle desde la API. Para INMO el frontend no pide el detalle, usa los datos de la lista y no muestra Propietario ni Inquilino | Sí (D6) | `persona.routes.ts:32-35`, `PersonaVerCard.jsx:56-63`, `:398-400` |
| Crear persona | `POST /personas` | Sí | Sí | Sí (queda asignada a su inmobiliaria) | No | ADMIN, GESTOR e INMO | Sí | `persona.routes.ts:43-46`, `persona.service.ts:621-628`, `Personas.jsx:323` |
| Editar persona | `PUT /personas/:id` | Sí | Sí | No | No | ADMIN y GESTOR (`PEOPLE_EDIT`) | Sí | `persona.routes.ts:52-55`, `Personas.jsx:127`, `PersonaVerCard.jsx:434` |
| Desactivar persona | `PATCH /personas/:id/desactivar` | Sí | Sí | No | No | ADMIN y GESTOR (`PEOPLE_DELETE`) | Sí | `persona.routes.ts:62-65`, `Personas.jsx:128` |
| Reactivar persona | `PATCH /personas/:id/reactivar` | Sí | Sí | No | No | ADMIN y GESTOR (`PEOPLE_DELETE`) | Sí | `persona.routes.ts:71-74`, `Personas.jsx:128` |
| Borrado definitivo | `DELETE /personas/:id` | Sí | No | No | No | Solo ADMIN | Sí | `persona.routes.ts:80-83`, `Personas.jsx:322` |
| Ver grupo familiar | `GET /personas/:id/grupo-familiar` | Sí | Sí | No | Sí | Solo ADMIN y GESTOR | No (D7) | `persona.routes.ts:89-92`, `Personas.jsx:324` |
| Agregar miembro | `POST /personas/:id/grupo-familiar/miembros` | Sí | Sí | No | No | Solo ADMIN y GESTOR | Sí | `persona.routes.ts:98-101`, `Personas.jsx:324` |
| Quitar miembro | `DELETE /personas/:id/grupo-familiar/miembros/:miembroId` | Sí | Sí | No | No | Solo ADMIN y GESTOR | Sí | `persona.routes.ts:108-111`, `Personas.jsx:324` |

## Inmobiliarias

| Acción | Endpoint | ADMIN | GESTOR | INMOBILIARIA | TECNICO | Pantalla (qué ve cada rol) | ¿Coincide? | Referencias |
|---|---|---|---|---|---|---|---|---|
| Listar inmobiliarias | `GET /inmobiliarias` | Sí | Sí | No | No | ADMIN y GESTOR | Sí | `inmobiliaria.routes.ts:10-13`, `App.jsx:47` |
| Ver inmobiliaria | `GET /inmobiliarias/:id` | Sí | Sí | No | No | ADMIN y GESTOR | Sí | `inmobiliaria.routes.ts:18-21`, `Inmobiliarias.jsx:238` |
| Crear inmobiliaria | `POST /inmobiliarias` | Sí | Sí | No | No | ADMIN y GESTOR | Sí | `inmobiliaria.routes.ts:26-29`, `Inmobiliarias.jsx:239`, `TablaInmobiliarias.jsx:416` |
| Editar inmobiliaria | `PUT /inmobiliarias/:id` | Sí | Sí | No | No | ADMIN y GESTOR | Sí | `inmobiliaria.routes.ts:34-37`, `Inmobiliarias.jsx:240`, `TablaInmobiliarias.jsx:256` |
| Dar de baja | `PATCH /inmobiliarias/:id/eliminar` | Sí | Sí | No | No | ADMIN y GESTOR | Sí | `inmobiliaria.routes.ts:43-46`, `Inmobiliarias.jsx:241`, `TablaInmobiliarias.jsx:323` |
| Reactivar | `PATCH /inmobiliarias/:id/reactivar` | Sí | Sí | No | No | ADMIN y GESTOR | Sí | `inmobiliaria.routes.ts:51-54`, `Inmobiliarias.jsx:242`, `TablaInmobiliarias.jsx:296` |

## Usuarios

No hay pantalla de ABM de usuarios: se valida por API (`npm run qa:api`). `rbac.js` define permisos `USERS_*` para ADMIN y GESTOR (`rbac.js:77-78`, `:99-100`), pero ninguna pantalla los usa.

| Acción | Endpoint | ADMIN | GESTOR | INMOBILIARIA | TECNICO | Pantalla (qué ve cada rol) | ¿Coincide? | Referencias |
|---|---|---|---|---|---|---|---|---|
| Listar usuarios | `GET /usuarios` | Sí | Sí | No | No | Sin pantalla | Sin pantalla | `usuario.routes.ts:10-13` |
| Ver usuario | `GET /usuarios/:id` | Sí | Sí | No | No | Sin pantalla | Sin pantalla | `usuario.routes.ts:17-20` |
| Crear usuario | `POST /usuarios` | Sí | Sí (no puede crear un ADMIN) | No | No | Sin pantalla | Sin pantalla | `usuario.routes.ts:25-28`, `backend.md` (Matriz RBAC: decisiones cerradas) |
| Editar usuario | `PUT /usuarios/:id` | Sí | Sí (no puede promover a ADMIN ni editar un ADMIN) | No | No | Sin pantalla | Sin pantalla | `usuario.routes.ts:33-36`, `backend.md` (Matriz RBAC: decisiones cerradas) |
| Eliminar usuario | `DELETE /usuarios/:id` | Sí | No | No | No | Sin pantalla | Sin pantalla | `usuario.routes.ts:43-46` |

## Archivos

La política por tipo es `canUserAccessArchivo` (`file.auth.utils.ts:89`): TECNICO solo `PLANO` e `IMAGEN`; INMOBILIARIA `PLANO`, `IMAGEN` y los documentos de venta (`BOLETO`, `ESCRITURA`, `OTRO`) de sus ventas. Ver también `backend.md` (Files: acceso por tipo y errores).

| Acción | Endpoint | ADMIN | GESTOR | INMOBILIARIA | TECNICO | Pantalla (qué ve cada rol) | ¿Coincide? | Referencias |
|---|---|---|---|---|---|---|---|---|
| Listar archivos de una venta | `GET /files/venta/:ventaId` | Sí | Sí | Sí, solo ventas propias | Sí (sin documentos de venta) | ADMIN y GESTOR desde Ventas | Sí | `files.routes.ts:25-28`, `file.controller.ts:168-174` |
| Listar archivos de un lote | `GET /files/lote/:idLoteAsociado` | Sí | Sí | Sí (filtrado por tipo, vacío si el lote es `NO_DISPONIBLE`) | Sí (solo `PLANO` e `IMAGEN`) | Todos desde el detalle del lote. TECNICO solo la pestaña Planos | Sí | `files.routes.ts:36-39`, `file.service.ts:154-200`, `LoteVerCard.jsx:321-323` |
| Ver metadata de un archivo | `GET /files/:id` | Sí | Sí | Sí (filtrado por tipo) | Sí (filtrado por tipo) | Todos desde Documentos | Sí | `files.routes.ts:47-50`, `file.controller.ts:27-50` |
| Firmar URL de descarga | `POST /files/:id/url` | Sí | Sí | Sí (filtrado por tipo) | Sí (filtrado por tipo) | Todos desde Documentos | Sí | `files.routes.ts:57-60`, `file.controller.ts:27-50` |
| Subir archivo | `POST /files` | Sí | Sí | No | Sí (solo `PLANO` e `IMAGEN`) | ADMIN, GESTOR y TECNICO | Sí | `files.routes.ts:99-102`, `file.controller.ts:91-92`, `LoteVerCard.jsx:312-315`, `Ventas.jsx:180` |
| Sustituir archivo | `POST /files/:id/sustituir` | Sí | Sí | No | Sí (solo `PLANO` e `IMAGEN`) | ADMIN, GESTOR y TECNICO | Sí | `files.routes.ts:90-93`, `DocumentoVerCard.jsx:408` |
| Aprobar plano | `PATCH /files/:id/aprobaciones` | Sí | Sí | No | Sí (solo Comisión, no Municipio) | Comisión: ADMIN, GESTOR y TECNICO. Municipio: ADMIN y GESTOR | Sí | `files.routes.ts:81-84`, `file.auth.utils.ts:121-129`, `DocumentoVerCard.jsx:93-94` |
| Eliminar archivo | `DELETE /files/:id` | Sí | Sí | No | No | ADMIN y GESTOR | Sí | `files.routes.ts:108-111`, `rbac.ui.js:126-128`, `LoteVerCard.jsx:316-319`, `LoteEditarCard.jsx:749` |
| Restaurar archivo | `POST /files/:id/restore` | Sí | Sí | No | No | ADMIN y GESTOR | Sí | `files.routes.ts:65-68`, `DocumentoVerCard.jsx:69-70` |
| Purgar archivo | `DELETE /files/:id/purge` | Sí | No | No | No | Solo ADMIN | Sí | `files.routes.ts:73-76`, `DocumentoVerCard.jsx:71` |

## Reportes

Todas las rutas usan `soloStaff` = ADMIN y GESTOR (`reportes.routes.ts:16`). La pantalla exige `REPORTS_ACCESS`, que tienen ADMIN y GESTOR (`App.jsx:87`).

| Acción | Endpoint | ADMIN | GESTOR | INMOBILIARIA | TECNICO | Pantalla (qué ve cada rol) | ¿Coincide? | Referencias |
|---|---|---|---|---|---|---|---|---|
| Ver inventario | `GET /reportes/inventario` | Sí | Sí | No | No | ADMIN y GESTOR | Sí | `reportes.routes.ts:19-23` |
| Exportar inventario | `GET /reportes/inventario.xlsx` | Sí | Sí | No | No | ADMIN y GESTOR | Sí | `reportes.routes.ts:26-30` |
| Ver ventas por período | `GET /reportes/ventas` | Sí | Sí | No | No | ADMIN y GESTOR | Sí | `reportes.routes.ts:33-37` |
| Exportar ventas | `GET /reportes/ventas.xlsx` | Sí | Sí | No | No | ADMIN y GESTOR | Sí | `reportes.routes.ts:40-44` |
| Ver cuotas vencidas | `GET /reportes/cuotas-vencidas` | Sí | Sí | No | No | ADMIN y GESTOR | Sí | `reportes.routes.ts:47-51` |
| Exportar cuotas vencidas | `GET /reportes/cuotas-vencidas.xlsx` | Sí | Sí | No | No | ADMIN y GESTOR | Sí | `reportes.routes.ts:54-58` |

## Fracciones y ubicaciones

No hay pantalla de ABM. El listado de fracciones se usa en el alta de lote y en Reportes.

| Acción | Endpoint | ADMIN | GESTOR | INMOBILIARIA | TECNICO | Pantalla (qué ve cada rol) | ¿Coincide? | Referencias |
|---|---|---|---|---|---|---|---|---|
| Listar fracciones | `GET /fracciones` | Sí | Sí | No | Sí | Alta de lote (solo ADMIN y GESTOR) y Reportes (ADMIN y GESTOR) | Sí | `fraccion.routes.ts:10-13`, `LoteCrearCard.jsx:133`, `lib/api/reportes.js:184` |
| Ver fracción | `GET /fracciones/:id` | Sí | Sí | No | Sí | Ninguna pantalla lo usa | Sin pantalla | `fraccion.routes.ts:18-21` |
| Crear fracción | `POST /fracciones` | Sí | Sí | No | No | Sin pantalla | Sin pantalla | `fraccion.routes.ts:27-30` |
| Editar fracción | `PUT /fracciones/:id` | Sí | Sí | No | No | Sin pantalla | Sin pantalla | `fraccion.routes.ts:36-39` |
| Eliminar fracción | `DELETE /fracciones/:id` | Sí | No | No | No | Sin pantalla | Sin pantalla | `fraccion.routes.ts:46-49` |
| Listar ubicaciones | `GET /ubicaciones` | Sí | Sí | No | Sí | Ninguna pantalla lo usa | Sin pantalla | `ubicacion.routes.ts:13-16` |
| Ver ubicación | `GET /ubicaciones/:id` | Sí | Sí | No | Sí | Ninguna pantalla lo usa | Sin pantalla | `ubicacion.routes.ts:21-24` |

## Diferencias y decisiones

Casos donde backend y pantalla no coincidían en el relevamiento. Las columnas Backend y Pantalla describen lo relevado; "Decisión" registra la opción elegida por el equipo.

| # | Caso | Backend | Pantalla | Opciones | Decisión |
|---|---|---|---|---|---|
| D1 | Editar reserva (INMOBILIARIA) | `PUT /reservas/:id` solo ADMIN y GESTOR (`reserva.routes.ts:47-50`). `updateReserva` tiene ramas para INMOBILIARIA (`reserva.service.ts:520`, `:569`) que nunca se ejecutan. | INMO tiene `RES_EDIT` y ve "Editar Reserva" (`rbac.js:115`, `TablaReservas.jsx:321-325`). El editor la limita a pasar a Cancelada (`ReservaEditarCard.jsx:216-219`). Al guardar, la API responde 403. | A: el backend acepta a INMOBILIARIA en `PUT`, solo sobre reservas propias y solo para cancelar. B: se quita `RES_EDIT` a INMOBILIARIA y no ve el botón. | B. INMOBILIARIA no edita reservas; el frontend no le muestra la acción (PR #362). |
| D2 | Eliminar y reactivar reserva (INMOBILIARIA) | `PATCH /reservas/:id/eliminar` y `/reactivar` aceptan INMOBILIARIA sobre reservas propias (`reserva.routes.ts:56-68`, `reserva.service.ts:714-716`, `:808-810`). | INMO no tiene `RES_DELETE`, así que no ve Eliminar ni Reactivar (`rbac.js:115`, `Reservas.jsx:137`, `:626-627`). | A: se da `RES_DELETE` a INMOBILIARIA y ve los botones sobre sus reservas. B: se saca a INMOBILIARIA de las dos rutas. | Ninguna: se mantiene el frontend; el backend conserva el permiso. |
| D3 | Eliminar lote (GESTOR) | `DELETE /lotes/:id` solo ADMIN (`lote.routes.ts:45-48`). | GESTOR tiene `LOT_DELETE` y ve "Eliminar Lote" (`rbac.js:92`, `TablaLotes.jsx:718`). La API responde 403. | A: el backend acepta también a GESTOR. B: se quita `LOT_DELETE` a GESTOR y no ve el botón. | B. GESTOR no elimina lotes; el frontend no le muestra la acción (PR #362). |
| D4 | Crear lote (GESTOR) | `POST /lotes` acepta ADMIN y GESTOR (`lote.routes.ts:28-31`). GESTOR tiene `LOT_CREATE` (`rbac.js:91`). | "+ Agregar Lote" se muestra si el rol contiene "admin" (`TablaLotes.jsx:266`, `:552`): GESTOR no lo ve. | A: el botón usa `LOT_CREATE` y GESTOR lo ve. B: el backend acepta solo ADMIN y se quita `LOT_CREATE` a GESTOR. | A. GESTOR crea lotes; el frontend le muestra "+ Agregar Lote" (PR #362). |
| D5 | Eliminar y reactivar prioridad (GESTOR e INMOBILIARIA) | `PATCH /prioridades/:id/eliminar` y `/reactivar` aceptan ADMIN, GESTOR e INMOBILIARIA (propias) (`prioridad.routes.ts:96-110`, `prioridad.service.ts:412`, `:504`). | Los botones dependen de `PRIORITY_DELETE`, que solo tiene ADMIN (`rbac.js:84`, `:106`, `:119`, `TablaPrioridades.jsx:210`). | A: se da `PRIORITY_DELETE` a GESTOR y a INMOBILIARIA (o solo a GESTOR). B: el backend acepta solo ADMIN. | A. ADMINISTRADOR y GESTOR eliminan y reactivan prioridades; INMOBILIARIA no: el frontend no le ofrece la acción (PR #362). El backend conserva el permiso sobre prioridades propias. |
| D6 | Ver detalle de persona (INMOBILIARIA) | `GET /personas/:id` acepta ADMIN, GESTOR y TECNICO (`persona.routes.ts:32-35`). | El detalle llama a ese endpoint, recibe 403 y muestra los datos de la fila de la lista (`PersonaVerCard.jsx:61-73`). | A: el backend acepta a INMOBILIARIA en `GET /personas/:id`, solo para sus clientes. B: para INMOBILIARIA la pantalla no pide el detalle y usa solo la lista. | B. Para INMOBILIARIA el frontend no pide el detalle y usa los datos de la lista (PR #362). |
| D7 | Ver grupo familiar (TECNICO) | `GET /personas/:id/grupo-familiar` acepta ADMIN, GESTOR y TECNICO (`persona.routes.ts:89-92`). | La acción Grupo familiar solo se muestra a ADMIN y GESTOR (`Personas.jsx:324`). | A: se muestra a TECNICO en solo lectura. B: se saca a TECNICO de la ruta. | Ninguna: se mantiene el frontend; el backend conserva el permiso. |
| D8 | Ventas de su inmobiliaria (INMOBILIARIA) | `GET /ventas/inmobiliaria/:id` acepta INMOBILIARIA con su propio id (`ventas.routes.ts:27-30`, `venta.service.ts:169-174`). | INMO no tiene el módulo Ventas (`rbac.js:111-122`). | A: se agrega una vista de ventas propias para INMOBILIARIA. B: se saca a INMOBILIARIA de la ruta. | Ninguna: fuera del alcance de esta entrega (funcionalidad nueva). |

## Notas

- **Mapa (inconsistencia solo del frontend):** después del login, la redirección a `/map` exige `REPORTS_ACCESS` (`rbac.ui.js:33`, usado en `AuthProvider.jsx:51`), pero la ruta `/map` no tiene `RequireRole` (`App.jsx:35`): cualquier rol con sesión entra navegando. No es una diferencia entre backend y pantalla.
- **TECNICO y archivos en Reservas (sin efecto):** `Reservas.jsx:140` incluye a TECNICO en `canUploadFiles`, pero TECNICO no tiene `RES_ACCESS` y no entra a Reservas, así que no tiene efecto.
