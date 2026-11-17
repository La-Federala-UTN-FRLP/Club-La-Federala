# Freeze pre-Cloud

Estado del software al cerrar el Final Hardening, antes del checkpoint Cloud. Separa tres cosas que no hay que mezclar:

- **Deprecations:** contratos legacy que siguen en la API y tienen un destino.
- **Cloud checkpoint:** trabajo de infraestructura que no es deuda del software.
- **Post-Cloud:** mejoras de software que quedan fuera del freeze.

El contrato congelado es la OpenAPI `Backend/documents/documentacionApi.yaml`: **78 operaciones `/api` + `GET /health` = 79 operaciones**, verificadas contra las rutas reales por `Backend/tests/unit/openapi/openapi.contract.test.ts`. Las auditorías anteriores al Final Hardening hablaban de 85 rutas: ese número es histórico (incluía aliases y hard deletes retirados por D2 y el ABM de Ubicaciones retirado por "Ubicaciones B").

## Registro de deprecations

Cada entrada sigue en la API porque un consumidor actual la usa o porque cambiarla rompe el contrato. Ninguna se elimina en el freeze.

| Contrato | Comportamiento actual | Por qué se mantiene | Destino |
|---|---|---|---|
| `error` en rechazos de auth | `authenticate`/`authorize` responden `{ success, code, message, error }`; `error` repite `message`. OpenAPI: `deprecated: true`. | El frontend todavía lo lee como fallback de `message` (`lib/api/ventas.js`, `lib/api/reservas.js`). | Post-Cloud: el frontend lee solo `message`; se quita en la próxima versión breaking. |
| `UrlFirmada.signedURL` | `GET /files/:id/url` devuelve `signedUrl` y `signedURL` (mismo valor). | El frontend lee `signedURL` primero (`lib/api/archivos.js`). | Post-Cloud: el frontend pasa a `signedUrl`; se quita en la próxima versión breaking. |
| `cantidadVentas`, `cantidadReservas` | Listado de inmobiliarias: iguales a `ventasTotales` / `reservasTotales`. | Los usa la UI de inmobiliarias. | Post-Cloud: migrar la UI; quitar en la próxima versión breaking. |
| `alquiler` (body de lotes) | Se acepta como alias legacy de `ocupacion`. | Compatibilidad de requests; el frontend todavía lo considera como fallback de lectura. | Próxima versión breaking. |
| `compradorId` (body de ventas) | Se acepta como alias legacy de `compradores`. | El alta de ventas del frontend todavía lo envía. | Post-Cloud: el frontend envía solo `compradores`; quitar en la próxima versión breaking. |
| `VITE_API_BASE` | El frontend la lee solo si falta `VITE_API_BASE_URL`. | Entornos que todavía la tengan configurada. | Post-Cloud, una vez confirmada `VITE_API_BASE_URL` en el hosting definitivo. |
| `CONFLICT` vs `CONFLICT_UNIQUE` | Un 409 de dominio usa `CONFLICT`; un P2002 de Prisma que llega al handler global usa `CONFLICT_UNIQUE` (y P2003, `CONFLICT_FK`, sin detalle del campo). | Ambos documentados en la OpenAPI; unificarlos cambia `code` para los clientes. | Próxima versión breaking (decidir un único code o un conjunto cerrado). |
| Envoltorio de usuarios | `POST /usuarios` devuelve `data.usuario`; `PUT /usuarios/:id` devuelve `data.user`. | Contrato vigente consumido así por el frontend. | Post-Cloud (normalización usuario/user). |
| Decimal | Entidades sin DTO (lotes, reservas, ofertas, promociones, ventas, plan recién creado) serializan los montos como string; pagos, reemplazo de plan y comisión, como number (D6). | Normalizar requiere DTOs en todas las respuestas. | Post-Cloud (DTO de Decimal). |
| Enums de request vs response | Lotes reciben etiquetas (`Disponible`, `Lote Venta`, `En Promoción`) y devuelven el enum de Prisma (`DISPONIBLE`, `LOTE_VENTA`, …). | El frontend envía etiquetas y lee enums. | Post-Cloud (normalización de enums). |
| Respuestas de Files | Las respuestas exitosas no llevan `success`; los listados son arrays sin envoltorio. Los errores sí usan el contrato D4. | Contrato vigente del frontend de archivos. | Próxima versión breaking. |
| `total` de inmobiliarias | `total` cuenta todas las inmobiliarias, sin el filtro de `estadoOperativo`; en otros listados `total` es la cantidad devuelta. | Lo fija un test de contrato y está documentado así en la OpenAPI. | Próxima versión breaking. |
| `Archivo.url` | Los archivos exponen `url` (path de storage, no una URL pública firmada). | La UI lo usa para detectar archivos con contenido (`LoteVerCard`, `LoteImageUploader`, `archivos.js`); no es un dato sensible. | Post-Cloud (minimizar o reemplazar por un flag). |

## Borrado de lotes

Decisión de producto: `DELETE /api/lotes/:id` es un hard delete **solo para lotes realmente eliminables**. Si el lote tiene ventas, reservas (y con ellas sus ofertas), prioridades, promociones, alquileres o archivos, en cualquier estado (incluidos los dados de baja), responde `409` `CONFLICT` y no borra nada. Ya no se borra historia comercial ni metadata de archivos, así que no quedan objetos huérfanos en storage por este endpoint. No hay baja lógica de lotes.

La ubicación del lote no bloquea: su FK es `SET NULL`, queda sin lote asignado y puede reasignarse a otro lote con `ubicacionId`.

## Invariantes bajo concurrencia

- **Prioridades:** un lote tiene como máximo una prioridad `ACTIVA`, garantizado por la base con el índice único parcial `Prioridad_loteId_activa_key` (migración `20261113120000_prioridad_una_activa_por_lote`). El alta inserta la prioridad y después marca el lote `CON_PRIORIDAD` con un UPDATE condicionado al estado validado. Cancelar, finalizar y expirar sacan la prioridad de `ACTIVA` con un UPDATE condicionado y restauran el lote con un único UPDATE condicionado a `CON_PRIORIDAD`. Un cierre tardío nunca libera un lote que ya tiene otra prioridad activa. Venta y reserva finalizan la prioridad activa con la misma escritura condicionada.
- **Personas:** el borrado definitivo (y el de un miembro familiar) bloquea la fila de la persona (`SELECT … FOR UPDATE`) antes de contar sus asociaciones. Una co-compra o un miembro familiar creados en paralelo se serializan con ese lock: o el borrado los ve y responde `409`, o el alta falla por FK. Nunca se pierde una relación por la FK `CASCADE` de co-compras ni por la `SET NULL` de familia. La FK de `_VentaCompradores` no se cambió: es la tabla implícita de Prisma y un `prisma migrate dev` futuro la revertiría a `CASCADE`.
- **Grupo familiar plano:** un titular y N miembros directos; un miembro no puede ser titular, un titular con miembros no puede pasar a ser miembro y nadie es su propio jefe. `PUT /personas` no modifica el jefe de familia.

Pruebas contra PostgreSQL real: `npm run test:integration` con `TEST_DATABASE_URL` apuntando a una base descartable con las migraciones aplicadas (la vacía en cada test). No forman parte de `npm test`.

## Auditoría adversarial final

| Hallazgo | Estado | Resolución |
|---|---|---|
| F1 — Docker build sin `.env` falla por `DIRECT_URL` | FIXED (no reproducido como fallo; build blindado) | `prisma generate` (Prisma 6.18) no exige las URLs: la build limpia sin `.env` pasaba. Las exigen `prisma validate` y `migrate`. Igual el stage `build` recibe URLs dummy solo en su comando: no son secretos, no quedan en `ENV`/`ARG` ni en la imagen final. |
| F2 — carrera Prioridad/Lote | FIXED | Índice único parcial y escrituras condicionadas (ver arriba). Tests de integración con interleavings forzados. |
| F3 — DELETE Persona vs alta como co-comprador | FIXED | Lock de fila + conteo + DELETE en una transacción, compartido con el borrado de miembros familiares. |
| F4 — semántica familiar | FIXED — modelo familiar plano | Helper central de invariantes; alta de persona y de miembro validadas; DELETE de titular con miembros → `409`. |
| F5 — logging de Supabase y `field` del P2003 | FIXED | El error de Supabase al purgar se loguea con `safeErrorForLog`. `CONFLICT_FK` ya no expone `field` (nombre interno de la constraint); el detalle va al log saneado. |
| F6 — Jest y `--forceExit` | NOTE | `--forceExit` no es necesario: `npx jest` termina solo (exit 0) y `--runInBand --detectOpenHandles` no reporta handles. Con workers en paralelo, a veces Jest avisa que fuerza la salida de un worker. Un diagnóstico por archivo no encontró handles persistentes (servers, timers ni sockets) al terminar ninguno de los 82 archivos. |

## Cloud checkpoint

No es deuda del software freeze: es trabajo de la migración a Cloud. No se implementa nada de esto antes del checkpoint.

- Despliegue en Cloud Run (servicio web) con la imagen `runtime` del Dockerfile.
- Cloud SQL, `prisma migrate deploy` en el pipeline y `DIRECT_URL` para migraciones.
- Secret Manager para `DATABASE_URL`, `JWT_SECRET` y `SUPABASE_SERVICE_KEY`.
- Cloud Scheduler + Cloud Run Job para `node dist/jobs/runExpirations.js` (cadencia esperada: horaria).
- IP real del cliente detrás de Cloud Run y decisión de `trust proxy` (el contrato actual, `CF-Connecting-IP`, es específico de Render).
- Store compartido de rate limit y comportamiento con varias instancias; `max-instances`.
- Probes de readiness y startup (`GET /health` es solo liveness).
- Logging estructurado para Cloud Logging.
- Hosting del frontend (Firebase u otro).
- `FRONTEND_URL` definitivo y `VITE_API_BASE_URL` definitivo.
- Fallback del frontend a `/api` relativo cuando falta `VITE_API_BASE_URL` (en un hosting sin proxy no hay backend detrás).
- Optimización del tamaño de la imagen, si las métricas lo justifican.

## Backlog post-Cloud

Mejoras de software, fuera del freeze y separadas de la infraestructura:

- Prisma 7 (resuelve también el `npm audit` residual del backend).
- Normalización de Decimal con DTOs.
- Normalización de los envoltorios usuario/user.
- Normalización de enums request/response.
- Retiro de los campos deprecated del registro anterior.
- Minimización de `Archivo.url`.
- Code splitting y tamaño del bundle del frontend.
- Lint masivo.
- Código muerto del frontend: `SidePanel`, `RoleSwitcher` (no se importa en ningún lado; con él muere `VITE_AUTH_USE_MOCK`, que todavía figura en `docker-compose.yml`).
- Logs de requests con la plantilla de la ruta en lugar del path (los path params pueden contener PII).
- Paginación real en los listados.

## `npm audit` residual

Al cerrar el freeze (`npm audit --omit=dev`):

- **Frontend:** 0 vulnerabilidades de producción.
- **Backend:** 4 high, todas en la cadena de Prisma CLI: `deepmerge-ts` y `effect`, a través de `@prisma/config` y `prisma`. `npm audit` solo ofrece resolverlas con `prisma@7`, un cambio mayor.

Las advertencias restantes se aceptan antes de Cloud porque su remediación requiere la migración mayor a Prisma 7 (post-Cloud).

## Chequeos manuales de despliegue

El código no toca Render ni Vercel: estos valores hay que verificarlos a mano en cada plataforma. Este documento no afirma que ya estén configurados.

### Render (backend)

- `NODE_ENV=production`.
- `JWT_SECRET` de al menos 32 caracteres (si no, el proceso no arranca).
- `JWT_EXPIRES_IN` con unidad, por ejemplo `2h` (un número sin unidad no arranca).
- `FRONTEND_URL` = el origin exacto del frontend desplegado (sin path ni barra final).
- `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` presentes.
- Comando de arranque: `node dist/server.js` (o `npm start`) después de `npm ci && npm run build`; nunca `npm run dev`.
- **Antes de aplicar la migración `20261113120000_prioridad_una_activa_por_lote`**, correr contra la base de producción (solo lectura) y confirmar que devuelve 0 filas:

  ```sql
  SELECT "loteId", count(*) FROM "public"."Prioridad"
  WHERE "estado" = 'ACTIVA' GROUP BY "loteId" HAVING count(*) > 1;
  ```

  Si devuelve filas, la migración se detiene con un error explícito y no crea el índice: hay que resolver a mano qué prioridad sigue `ACTIVA` en cada lote. La migración no borra ni modifica datos.

Si se rota `JWT_SECRET`, todos los JWT emitidos antes quedan inválidos y cada usuario tiene que volver a loguearse.

### Vercel (frontend)

- `VITE_API_BASE_URL=https://<backend>/api`, **con** `/api`. Sin esta variable el build usa `/api` relativo al dominio del frontend.
- Ninguna variable legacy (`VITE_API_URL`, `VITE_AUTH_REFRESH_*`, `VITE_AUTH_ME_PATH`, `VITE_AUTH_LOGIN_PATH`).

## `.env` local

Los `.env` locales no están versionados y no se modifican desde el repositorio. Cada desarrollador debe revisar su `frontend/.env` / `frontend/.env.local` y borrar, si todavía están, `VITE_AUTH_REFRESH_*`, `VITE_AUTH_ME_PATH`, `VITE_AUTH_LOGIN_PATH` y `VITE_API_URL`: el código ya no las lee. Las variables vigentes están en `frontend/.env.example` y `Backend/.env.example`.
