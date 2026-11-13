# Arquitectura backend

El backend usa Node.js, Express 5, TypeScript, Prisma y PostgreSQL. `src/app.ts` compone y exporta Express (CORS, JSON, logging, rutas y errores). `src/server.ts` es el lifecycle del **proceso web**: `listen` sobre `PORT` y cierre ordenado ante `SIGTERM`/`SIGINT`. No programa tareas. El proceso HTTP usa un único `PrismaClient` (`src/config/prisma.ts`). Las expiraciones corren en un **job one-shot** (`src/jobs/runExpirations.ts` → `node dist/jobs/runExpirations.js`).

## Arranque

El runtime de desarrollo y el productivo son distintos:

| | Desarrollo | Producción |
|---|---|---|
| Comando | `npm run dev` (`ts-node-dev` con watcher sobre `src/server.ts`) | `npm ci` → `npm run build` → `node dist/server.js` (`npm start`) |
| Docker | `docker-compose.yml`: target `deps` del Dockerfile, código montado por volumen, `npm run dev` | `Backend/Dockerfile`, stage final `runtime` (multi-stage): solo `dist` + dependencias de producción, `NODE_ENV=production`, usuario sin privilegios, `CMD ["node", "dist/server.js"]` |

Que `ts-node-dev` aparezca en `docker-compose.yml` no contradice lo anterior: compose es el entorno de desarrollo, no la imagen productiva.

`npm run build` genera Prisma Client en `src/generated/prisma`, compila TypeScript a `dist/` y copia el cliente (JS, runtime y binaries) a `dist/generated/prisma`. El mismo build deja el artefacto del job en `dist/jobs/runExpirations.js`; la misma imagen sirve para el job cambiando el comando a `node dist/jobs/runExpirations.js`.

**Build de la imagen sin `.env` ni secretos.** El stage `build` corre `npm run build` con `DATABASE_URL` y `DIRECT_URL` **dummy** (sintácticamente válidas) solo en ese comando: `prisma generate` no se conecta a ninguna base, y la imagen se construye desde un repo limpio (el `.env` está excluido por `.dockerignore`). No son secretos, no quedan en `ENV`/`ARG` y ese stage no forma parte de la imagen final. El runtime recibe las URLs reales por entorno; ninguna URL productiva queda horneada en la imagen.

## Health

`GET /health` es **liveness**: el proceso Node + Express responde HTTP. Devuelve `200` con `{"status":"ok"}` y `Cache-Control: no-store`. Es público (sin JWT). No consulta PostgreSQL, Prisma, Supabase ni otros servicios. No es readiness: una DB caída no hace “muerto” al proceso.

## Shutdown

`SIGTERM` e `SIGINT` disparan un cierre ordenado (idempotente): drena el HTTP server (`close` + `closeIdleConnections`), desconecta Prisma y deja `process.exitCode = 0` para que Node termine solo. Timeout defensivo de 10 s: `closeAllConnections()` y `process.exit(1)`. La lógica vive en `src/serverLifecycle.ts`; el arranque sigue en `src/server.ts`.

## Job de expiración

Proceso distinto al web. No sirve HTTP, no usa `PORT` y no importa Express. Contrato productivo: `npm run jobs:expirations:prod` → `node dist/jobs/runExpirations.js`. Ejecuta `expirePromotions`, `expireReservas` y `expirePrioridades` una vez, desconecta Prisma y termina con `exitCode` 0 (éxito) o 1 (fallo fatal, incluido error de disconnect). El scheduler concreto (quién dispara el proceso, y con qué cadencia) queda fuera de la aplicación; la cadencia observable actual era aproximadamente horaria (`0 * * * *`) y se preserva como expectativa de infra futura.

**Prioridades (D3).** `expirePrioridades` delega en `expirePrioridadesVencidas` (`prioridad.service.ts`), la misma operación que el endpoint manual `POST /api/prioridades/jobs/expire`: cada prioridad `ACTIVA` con `fechaFin` vencida pasa a `EXPIRADA` y el lote vuelve a su estado previo si sigue `CON_PRIORIDAD`.

**Una sola prioridad ACTIVA por lote.** La garantiza la base: índice único parcial `Prioridad_loteId_activa_key` (`loteId` donde `estado = ACTIVA`), creado a mano en la migración `20261113120000_prioridad_una_activa_por_lote` porque Prisma 6 no expresa índices parciales (un guard de tests impide que una migración futura lo elimine). De dos altas concurrentes para el mismo lote entra una; la otra responde `409` "Ya existe una prioridad ACTIVA para este lote".

**Transiciones concurrentes.** El alta inserta la prioridad y recién después marca el lote `CON_PRIORIDAD`, con un UPDATE condicionado al estado que validó: si el lote cambió en el medio (reserva, venta), responde `409` y no queda nada. Cancelar, finalizar y expirar escriben condicionadas a que la prioridad siga `ACTIVA` y restauran el lote en la misma transacción con un único UPDATE condicionado a `CON_PRIORIDAD`, sin leer antes. Si dos transiciones compiten (por ejemplo, el job expira mientras un usuario cancela), la segunda no pisa el estado ni vuelve a tocar el lote: el job la omite y cancelar/finalizar responden el mismo `400` que ante una prioridad que no está `ACTIVA`. Una prioridad nueva no puede insertarse mientras el cierre de la anterior no confirme (lo impide el índice), así que un cierre nunca libera un lote que ya tiene otra prioridad activa. Venta y reserva finalizan la prioridad activa con la misma escritura condicionada.

## Estructura

- `src/routes`: endpoints y cadena de middleware.
- `src/controllers`: adaptación HTTP y delegación.
- `src/services`: reglas de negocio y acceso con Prisma.
- `src/validations`: esquemas Zod para body, parámetros y query.
- `src/middlewares`: JWT, roles, validación, rate limit de login, logs y errores.
- `src/domain`: reglas/tipos de estados.
- `src/jobs`: expiración de promociones, reservas y prioridades.
- `prisma`: esquema, migraciones y seeds.

## Seguridad

Las rutas privadas usan `authenticate` y `authorize`. Los roles son `ADMINISTRADOR`, `GESTOR`, `INMOBILIARIA` y `TECNICO`. Las validaciones ocurren antes del controlador y `handleError` centraliza errores (ver "Contrato de errores").

Rutas públicas: solo `POST /api/auth/login` y `GET /health`. No existen `POST /api/auth/refresh` ni `GET /api/auth/me`.

### Autenticación: JWT + identidad vigente desde la DB

El JWT es una **prueba de identidad firmada**; la **DB es la fuente vigente de autorización**. `authenticate` (`src/middlewares/auth.middleware.ts`):

1. Lee `Authorization: Bearer <JWT>`. Sin header o sin el prefijo `Bearer ` → `401` (`Token no proporcionado`).
2. Verifica firma y expiración con `JWT_SECRET`. Token expirado → `401` (`Token expirado`); firma inválida o token malformado → `401` (`Token inválido`).
3. Obtiene el id de usuario del claim `sub` (o `id`, legacy): debe ser un entero positivo (number o string decimal canónico). Si no lo es → `401` (`Token inválido`).
4. Relee la identidad con `findAuthIdentity` (`src/services/authIdentity.service.ts`): `id`, `email`, `role` y la inmobiliaria asociada (`User ← Inmobiliaria.userId`). Nunca lee la password.
5. Usuario inexistente (por ejemplo, eliminado con un JWT todavía vigente) o usuario de una inmobiliaria dada de baja (`estadoOperativo = ELIMINADO`, D1) → `401` con el mismo mensaje que un token inválido. Un error de la DB no es un problema de credenciales: va al middleware de errores (`500` genérico).
6. Arma `req.user` con el rol y el `inmobiliariaId` **de la DB**. Los claims `role`, `email` e `inmobiliariaId` del token no se usan para autorizar.
7. `authorize(...roles)` compara contra `req.user.role`.

Consecuencias: un cambio de rol o de inmobiliaria rige desde el siguiente request autenticado, sin esperar a que venza el token, y un usuario eliminado deja de entrar. El costo es una lectura por PK en cada request autenticado. El modelo `User` no tiene un estado activo/inactivo: la única revocación es eliminar al usuario (o esperar el vencimiento del token, `JWT_EXPIRES_IN`, default `2h`).

**Login timing.** Con un email inexistente, `POST /auth/login` igual ejecuta `bcrypt.compare` contra un hash dummy constante del mismo costo (`DUMMY_PASSWORD_HASH`, cost 10, en `auth.service.ts`). Elimina la diferencia trivial de trabajo criptográfico entre "usuario inexistente" y "password incorrecta"; ambos responden `401 Credenciales inválidas`. No pretende ser una garantía absoluta contra la enumeración de usuarios.

### Inmobiliaria dada de baja (D1)

Una inmobiliaria con `estadoOperativo = ELIMINADO` sigue persistida (historial y reactivación), pero:

- Su usuario no puede loguearse: `401 Credenciales inválidas`, la misma respuesta que unas credenciales incorrectas, evaluada después de bcrypt. Un JWT emitido antes de la baja deja de servir en el siguiente request (`authenticate` → `401`).
- No participa en operaciones nuevas: asociarla al crear o al cambiar `inmobiliariaId` (ventas, reservas, prioridades, personas) responde `409` (`assertInmobiliariaAsignable` / `assertInmobiliariaOperativa`, `src/utils/inmobiliaria.utils.ts`). Los registros históricos que ya la referencian no se tocan.
- Los listados de inmobiliarias devuelven por defecto solo las `OPERATIVO`.
- Al reactivarla, su usuario recupera el acceso.

No hay `DELETE /api/inmobiliarias/:id`: la baja es lógica (`PATCH /api/inmobiliarias/:id/eliminar`) y reversible (`/reactivar`).

### Modelo Bearer-only

```text
login → token en localStorage (lf_token) → Authorization: Bearer → backend
```

No hay cookies de autenticación, ni `Set-Cookie`, ni refresh cookie. El frontend no envía `credentials: "include"` y el CORS del backend no habilita credentials. El helper general (`frontend/src/lib/http/http.js`) y los fetch directos de multipart y signed URLs (`lib/api/archivos.js`) agregan el header `Authorization`.

Como el navegador no adjunta credenciales de forma automática, el CSRF clásico basado en cookies no aplica a este modelo y no hay protección CSRF dedicada.

No hay refresh de sesión ni endpoint de identidad (`/auth/me`): el login devuelve el token y los datos del usuario. Un `401` significa token ausente, vencido o inválido; el helper HTTP del frontend limpia la sesión y redirige a `/login` sin interpretar el texto del body. Al vencer el token (`JWT_EXPIRES_IN`) hay que volver a loguearse.

### Rate limiting de login

Solo `POST /api/auth/login` (`src/middlewares/loginRateLimit.middleware.ts`, `express-rate-limit` 8.7.3). Va antes de la validación del body, así que también cuentan los intentos con body inválido. No mira el JWT, `req.user` ni el email.

- Ventana de 15 minutos y **10 intentos fallidos** por cliente; el siguiente (el 11.º) responde `429` con `{ success: false, code: 'TOO_MANY_REQUESTS', message }` sin llegar al login.
- `skipSuccessfulRequests`: un login exitoso (status < 400) no consume cupo. Una vez bloqueado, la password correcta también recibe `429` hasta que vence la ventana.
- Headers estándar `RateLimit`/`RateLimit-Policy` (`draft-8`); sin los legacy `X-RateLimit-*`.

Identificación del cliente (sin cambiar el `trust proxy` global de Express):

- **Render (`RENDER=true`, exactamente ese valor):** header `CF-Connecting-IP`, que Cloudflare escribe en cada request y sobrescribe lo que mande el cliente. Solo se acepta si es exactamente una IP válida (`net.isIP` después de recortar espacios); una lista, una IP con puerto, un valor vacío o un header repetido van al fallback.
- **Fallback (y fuera de Render):** `req.ip` → `socket.remoteAddress` → una key constante. En Render, `req.ip` es la IP del proxy: un bucket compartido, más restrictivo, pero nunca una key elegida por el cliente.
- `ipKeyGenerator` normaliza IPv4-mapped a IPv4 y agrupa IPv6 por `/56`.
- **`X-Forwarded-For` no se usa como key**: Cloudflare agrega entradas en lugar de reemplazarlo, así que su lado izquierdo lo controla quien llama.

Limitaciones: el store es en memoria (`MemoryStore`, por proceso) y se pierde al reiniciar. Alcanza con la única instancia actual; con varias instancias cada una contaría por separado (no hay protección distribuida) y habría que pasar a un store compartido. El contrato de client IP es específico de Render: al migrar a Cloud Run hay que revalidar la IP del cliente, el store compartido y `max-instances` antes de reutilizarlo (Cloud checkpoint, ver `docs/architecture/freeze-pre-cloud.md`).

### Matriz RBAC: decisiones cerradas

| Superficie | Regla |
|---|---|
| `GET/POST/PUT /usuarios` | `ADMINISTRADOR` y `GESTOR`. Un `GESTOR` administra usuarios comunes, pero no puede crear un `ADMINISTRADOR`, promover a nadie (ni a sí mismo) a `ADMINISTRADOR`, ni modificar un usuario que ya es `ADMINISTRADOR` → `403` sin escrituras. Editar un usuario inexistente → `404`. |
| `DELETE /usuarios/:id` | Solo `ADMINISTRADOR`. |
| `PATCH /ventas/:id/eliminar` y `/reactivar` | Solo `ADMINISTRADOR` y `GESTOR`. `INMOBILIARIA` (incluso sobre ventas propias) y `TECNICO` → `403`. |
| `PATCH /reservas/:id/eliminar` y `/reactivar` | `INMOBILIARIA` opera sobre las reservas de su inmobiliaria; las de otra → `403` sin escrituras. |
| `GET /lotes?deudor=…` | `TECNICO` no puede usar el filtro `deudor` (`400`, sin consultar la DB): el campo `deuda` se le oculta y el filtro permitiría inferirlo. La regla vive en `lote.service`, donde se arma el `where`. |

### Tenant de Prioridades

En toda operación de Prioridades (crear, listar, ver, actualizar, cancelar, finalizar, eliminar, reactivar), un usuario `INMOBILIARIA` **sin** `inmobiliariaId` responde `403`; nunca cae en el camino de `ADMINISTRADOR`/`GESTOR`. Con tenant, el listado filtra siempre por el tenant vigente (se ignora `?inmobiliariaId`) y las operaciones sobre una prioridad ajena responden `403`.

El ownership se valida **antes** que las reglas de estado: cancelar o finalizar una prioridad ajena responde `403` sin importar su estado, así que el status no revela el estado de prioridades de otra inmobiliaria. El motivo de negocio (`400`, por ejemplo "solo ACTIVA") solo se informa sobre prioridades propias.

### Files: acceso por tipo y errores

`canUserAccessArchivo` (`src/utils/file.auth.utils.ts`) es la política central por rol y tipo:

| Rol | Tipos accesibles |
|---|---|
| `ADMINISTRADOR`, `GESTOR` | Todos. |
| `TECNICO` | `PLANO` e `IMAGEN` (documentación técnica). `BOLETO`, `ESCRITURA` y `OTRO` (documentos de venta, comerciales o legales) y cualquier tipo no contemplado quedan denegados (lista blanca). |
| `INMOBILIARIA` | `PLANO` e `IMAGEN`; `BOLETO`, `ESCRITURA` y `OTRO` solo de ventas de su inmobiliaria (reglas 5.4). |

`OTRO` se trata como documento de venta porque el código lo define así: exige `ventaId` al subirlo y se guarda bajo `venta-{id}` en storage.

La política se consulta antes de exponer metadata o contenido y antes de cualquier efecto. El status depende de la operación:

- **Listados** (`GET /files/lote/:id`, `GET /files/venta/:ventaId`): los archivos no accesibles se filtran.
- **Detalle, signed URL, sustituir y aprobaciones de un archivo no accesible:** `404`, la misma convención que Files ya usaba con `INMOBILIARIA`; no se revela si el id existe ni qué tipo tiene. En sustituir y aprobaciones, la autorización por tipo va antes que las validaciones de estado y de tipo.
- **Upload** (`POST /files`) de un tipo no permitido: `403`, antes de consultar la venta o el storage (el tipo lo elige quien llama).

Errores de Files: usan el contrato de errores general (`{ success: false, code, message }`). Un error de dominio con `statusCode` 4xx conserva su status y su mensaje. Cualquier otro error es inesperado: `500` con `code: INTERNAL_ERROR` y un mensaje público fijo (por ejemplo, `Error al obtener archivos`), sin el objeto de error, stack, mensaje interno ni metadata de Prisma o Supabase; el detalle queda solo en el log del servidor. Las respuestas exitosas de Files no llevan `success` (ver el registro de deprecations).

## Validación de requests

Middlewares de `src/middlewares/validation.middleware.ts`; un dato inválido responde `400` con `{ success: false, code: 'VALIDATION_ERROR', message: 'Datos inválidos', errors: [{ field, message }] }`.

Estado final por parte del request:

| Parte | Middleware | Dónde queda el resultado de Zod | Cómo lo lee el controller |
|---|---|---|---|
| Body | `validate(schema)` | `req.body` (se reemplaza por el output de Zod) | `req.body` |
| Params | `validateParams(schema)` | `req.validated.params` (`req.params` sigue crudo) | `validatedParams(req, schema)` |
| Query | `validateQuery(schema)` | `req.validated.query` (`req.query` sigue crudo) | `validatedQuery(req, schema)` |

- `validate(schema)`: reemplaza `req.body` por el resultado de Zod.
- `validateParams(schema)`: en las rutas que lo usan, Zod valida y transforma los params y el resultado se conserva en `req.validated.params`. `req.params` sigue siendo el input HTTP crudo (strings). Los controllers migrados leen los params con `validatedParams(req, schema)`, con el mismo schema que la ruta; si la ruta no validó params o usó otro schema, lanza.
- `validateQuery(schema)`: igual que `validateParams`, pero para la query; el resultado se conserva en `req.validated.query` y los controllers lo leen con `validatedQuery(req, schema)`. En Express 5 `req.query` es un getter que re-parsea la URL en cada acceso, así que no se puede reemplazar ni mutar: el middleware anterior validaba pero el controller seguía viendo strings crudos y claves que el schema no declaraba. `req.validated.params` y `req.validated.query` conviven en el mismo request (`GET /ventas/inmobiliaria/:id` usa ambos).

Los controllers no reinterpretan los valores transformados (`Number(...)`, `parseInt(...)`, `=== 'true'`, casts) ni leen `req.params` ni `req.query` directamente: lo verifican `tests/unit/architecture/controllers.params.guard.test.ts` y `tests/unit/architecture/controllers.query.guard.test.ts`. Quien agregue una ruta con `validateParams` o `validateQuery` debe leerla con `validatedParams` / `validatedQuery` y el mismo objeto de schema; si la ruta no validó esa parte, o la validó con otro schema, lanza.

### Política de IDs HTTP (path y query)

Todas las rutas con parámetros de path usan `validateParams()` y sus controllers leen el resultado con `validatedParams(req, schema)`; ningún controller relee `req.params`. Lo garantizan `tests/unit/architecture/routes.params.guard.test.ts` (toda ruta con `:param` pasa por `validateParams`) y `tests/unit/architecture/controllers.params.guard.test.ts` (ningún controller lee `req.params`).

Los IDs numéricos de path (`/:id`, `/:ventaId`, `/:miembroId`, `/:idLoteAsociado`, …) y los IDs de query que representan PKs reales (`propietarioId`, `ubicacionId`, `loteId`, y `inmobiliariaId` en el listado de prioridades) siguen una única política, `positiveIntString` en `src/validations/params.validation.ts`: entero decimal positivo canónico dentro de int4 (`1` a `2147483647`), con output `number`. `0`, `-1`, `007`, `+5`, `1e2`, `0x10`, `1.5`, `" 12"` o `2147483648` responden `400`.

`GET /personas/cuil/:cuil` es la excepción deliberada: el CUIL no es un número. `cuilParamsSchema` (`persona.validation.ts`) lo mantiene como `string`: quita guiones, puntos y espacios y exige 11 dígitos. Se lee con `validatedParams(req, cuilParamsSchema)` como cualquier otro param.

### Contrato de query params

- **Claves desconocidas**: se descartan en silencio (sin `400`) y no llegan al controller ni al service. Los schemas de query no usan `.strict()` porque el frontend manda parámetros que el backend no declara (por ejemplo `estado` y `pageSize` a `/inmobiliarias`). Con el parser `simple` de Express 5, `foo[]=1` y `foo[bar]=1` son claves literales desconocidas, no arrays ni objetos.
- **Query repetida**: `?id=1&id=2` llega como array y ningún filtro admite varios valores, así que responde `400`.
- **Booleanos**: `booleanQuery` (`src/validations/query.validation.ts`) acepta únicamente `"true"` y `"false"` en minúscula y entrega un `boolean` (`deudor`, `includeInactive`, `includeDeleted`). `1`, `0`, `yes`, `TRUE`, `""` y los arrays responden `400`. No usar `z.coerce.boolean()`: convierte `"false"` en `true`.
- **Qué recibe el service**: el controller entrega al service lo que validó el schema de la ruta (`GET /lotes`) o un DTO explícito armado con los filtros del schema (reservas, ventas, prioridades). Como el schema declara solo los filtros que el service implementa, un filtro que el schema no declara no existe para el API: Zod lo descarta como clave desconocida.
- **Lectura en el controller**: `validateQuery()` + `validatedQuery(req, schema)` con el mismo schema que la ruta; ningún controller lee `req.query` (lo verifica `tests/unit/architecture/controllers.query.guard.test.ts`).

Filtros de query vigentes (todos implementados por su service):

| Ruta | Filtros |
|---|---|
| `GET /lotes` | `estado`, `subestado`, `tipo`, `ocupacion`, `propietarioId`, `ubicacionId`, `deudor` |
| `GET /reservas` | `estado`, `estadoOperativo`, `loteId` |
| `GET /ventas` | `estado`, `estadoOperativo`, `loteId` |
| `GET /ventas/inmobiliaria/:id` | `estadoOperativo` |

Otras rutas con query validada: `GET /personas`, `GET /inmobiliarias`, el listado de prioridades (que sí implementa `loteId` e `inmobiliariaId`) y `GET /files/venta/:ventaId` y `GET /files/lote/:idLoteAsociado` (`includeDeleted`).

### Contrato de body

Cada medio de entrada tiene su propia política; no se mezclan.

| Medio | Política | Dónde |
|---|---|---|
| Body JSON | number o string decimal; el output es siempre `number` | `src/validations/body.validation.ts` |
| Path y query | solo strings canónicos (`positiveIntString`) | `src/validations/params.validation.ts` |
| Multipart | todo campo llega como string: se valida con `positiveIntString` | `src/validations/filemeta.validation.ts` |

Se reemplazó `z.coerce.number()`, que usaba `Number()` sobre cualquier valor y convertía `null`, `""`, `false` y `[]` en `0`, `true` en `1` y `"1e2"` o `"0x10"` en números.

- **IDs de body JSON** (`idDelBody(entidad)`): number entero o string decimal canónico, entero positivo dentro de int4 (`1` a `2147483647`), output `number`. Se recortan los espacios externos de un string. Rechazan `null`, booleanos, arrays, objetos, `""`, `"0"`, `"-1"`, `"+5"`, `"007"`, `"1e2"` (notación científica), `"0x10"` (hexadecimal), `"1.5"`, `NaN`, `Infinity` y todo lo que supere `2147483647`. `optional()` y `nullable()` los define cada campo; el helper no los agrega.
- **Enteros positivos int4 que no son PK** (`enteroPositivoDelBody(mensaje)`): la misma regla con mensaje propio (por ejemplo `Fraccion.numero`). `idDelBody` delega en él.
- **Números generales** (`numeroDelBody(mensaje)`): number finito o string en notación decimal explícita (`"10"`, `" 10.5 "`, `"-1"`, `"007"`). Rechaza `null`, `""`, booleanos, arrays, `"1e2"`, `"0x10"`, `"+5"`, `".5"`, `"5."`, separadores de miles y coma decimal. No impone entero, signo ni rango: eso es regla de dominio de cada schema (`.pipe(z.number().int().min(0))`).
- **Columnas `Int` de Prisma**: los campos del body que se persisten en una columna `Int` y están controlados por el cliente tienen tope `2147483647` (`capacidad`, `numPartido`, número de lote, número de calle, `maxPrioridadesActivas`, IDs, etc.). Sin tope, un valor mayor llegaba a Prisma y terminaba en `500`.
- **`comxventa`** (inmobiliarias): porcentaje `0..100`. `null` significa "sin comisión" y se normaliza a `0` de forma explícita en el schema. `""`, `false` y `[]` ya no valen `0`.

### Multipart

`POST /files` valida `idLoteAsociado`, `tipo` y `ventaId` con `createFileMetadataSchema` antes del controller; los IDs son strings canónicos (`positiveIntString`) y el output ya es `number`. `ventaId` vacío (`""`) equivale a no enviarlo. El controller no vuelve a convertir con `Number()` ni `parseInt()`.

### Updates parciales

La convención histórica se mantiene: `PUT` es un update parcial y cada campo es opcional. Un update sin ningún campo válido (`{}` o solo claves desconocidas, que Zod descarta) responde `400` con `Debes enviar al menos un campo para actualizar`. Se evalúa sobre el resultado de Zod (`tieneAlgunCampo` / `ACTUALIZAR_SIN_CAMPOS`, en `body.validation.ts`). No se usa `.strict()`: un body con al menos un campo válido sigue funcionando aunque traiga además claves desconocidas, que se descartan. Aplica a lotes, ventas, usuarios, personas, fracciones, reservas, prioridades e inmobiliarias.

### Legacy eliminado

Dejaron de formar parte del API (el schema, la ruta y su controller se eliminaron):

- `GET /reservas/filtrarPorEstado`: era inalcanzable, `/:id` la capturaba antes.
- `PUT /files/:id` (actualización de metadata de archivos).
- `DELETE /ventas/:id` y `DELETE /reservas/:id`: eran alias de la baja lógica `PATCH /…/:id/eliminar`, que sigue vigente (D2).
- `DELETE /inmobiliarias/:id`: era un hard delete; D1 exige que la inmobiliaria persista y pueda reactivarse (D2).
- `POST /ubicaciones`, `PUT /ubicaciones/:id` y `DELETE /ubicaciones/:id`: Ubicaciones es de solo lectura; las ubicaciones se crean y modifican dentro del alta y la edición de lotes (decisión "Ubicaciones B").
- `registrar-boleto` y `registrar-escritura` de ventas, y `POST /auth/refresh` y `GET /auth/me`: el backend no los expone; el frontend dejó de llamarlos.

Una ruta retirada responde el `404` JSON global.
- Los filtros de query que ningún service implementaba: lotes (`superficieMin`, `superficieMax`, `fechaCreacionFrom`, `fechaCreacionTo`), reservas (`desde`, `hasta`, `clienteId`, `inmobiliariaId`, `sena`, `fechaFinReservaDesde`, `fechaFinReservaHasta`) y ventas (`compradorId`, `vendedorId`, `fechaVentaFrom`, `fechaVentaTo`, `montoMin`, `montoMax`). Si llegan en la URL se descartan como cualquier clave desconocida.
- Los schemas sin uso `queryUsuarioSchema`, `queryInmobiliariaSchema`, `fileMetadataSchema` e `identificadorSchema`, y `user.validation.ts`.

### Fracciones

`numero` es `Int @unique` en Prisma. El contrato HTTP lo recibe como entero positivo dentro de int4 (`5` y `"5"` válidos; `"05"`, `"1e2"`, `"+5"`, `5.5`, `0`, booleanos, `null` y valores mayores a `2147483647` responden `400`) y lo entrega siempre como `number`. Una fracción inexistente responde `404` y un número ya existente responde `409`, tanto al crear como al actualizar. Eliminar una fracción con lotes asociados sigue respondiendo `400`.

### Errores HTTP concretos de Files y Promociones

- **Multipart inválido**: un `MulterError` causado por el input del cliente (campo de archivo que no es `file`, demasiados archivos o partes, nombre o valor de campo fuera de límites) responde `400` en lugar de `500`. `LIMIT_FILE_SIZE` conserva su `400` con el mensaje de tamaño máximo (20 MB). Un error interno que no es de Multer sigue respondiendo `500`.
- **Archivo inexistente**: `POST /files/:id/restore` y `POST /files/:id/sustituir` responden `404`. Restaurar un archivo que no está eliminado, sustituir uno eliminado o sustituir un tipo no sustituible responden `400`. El status sale del `statusCode` que lanza `file.service`, no del texto del mensaje. En `POST /files/:id/sustituir`, `validateParams` se ejecuta antes que multer.
- **Promociones**: `aplicar` y `quitar` delegan los errores en el middleware global con `next(error)`; ya no responden de forma manual. Un error con `statusCode` conserva su status y mensaje, `P2002` responde `409`, `P2025` responde `404` y un error inesperado responde `500` genérico sin exponer su mensaje interno. Esos códigos Prisma se reconocen con `instanceof Prisma.PrismaClientKnownRequestError` del cliente generado en `src/generated/prisma`, que es la clase que ese cliente lanza. La clase homónima de `@prisma/client/runtime/library` es otra y no identifica estos errores.

### Listados (D5)

- Usuarios y Ubicaciones devuelven el listado completo (sin el `take: 10` anterior); en Ubicaciones `total` es la cantidad devuelta.
- Personas no trunca si no llega `limit` (el frontend no lo manda) y respeta un `limit` explícito, que no tiene un máximo funcional.
- Fracciones conserva su tope: el dominio admite como máximo 8.
- No hay paginación real en el backend (post-Cloud).

### Hard deletes vigentes

Quedan solo los que representan una capacidad real del dominio (D2):

| Endpoint | Guard |
|---|---|
| `DELETE /fracciones/:id` | `400` si la fracción tiene lotes. |
| `DELETE /usuarios/:id` | Solo `ADMINISTRADOR`; es la única forma de revocar el acceso de un usuario. |
| `DELETE /personas/:id` | Solo `ADMINISTRADOR`; `409` si la persona tiene lotes, alquileres, reservas o ventas, como comprador principal o como co-compradora, o si es titular de un grupo familiar con miembros. Corre en una transacción que bloquea la fila de la persona (`SELECT … FOR UPDATE`) antes de contar: una co-compra o un miembro agregados en paralelo se serializan con ese lock (el borrado los ve y responde `409`, o el alta falla por FK). Así la FK `CASCADE` de co-compras y la `SET NULL` de familia nunca se llevan una relación en silencio. |
| `DELETE /personas/:id/grupo-familiar/miembros/:miembroId` | `ADMINISTRADOR` y `GESTOR`; mismo borrado transaccional y mismos guards que el anterior. |
| `DELETE /files/:id/purge` | Solo `ADMINISTRADOR`; borra el registro y el objeto en storage. |
| `DELETE /lotes/:id` | Solo `ADMINISTRADOR`; solo lotes sin historia ni asociaciones. Con ventas, reservas (y sus ofertas), prioridades, promociones, alquileres o archivos, en cualquier estado → `409` `CONFLICT` sin borrar nada. El chequeo y el borrado corren en una transacción y el lote es lo único que se borra; si aparece una asociación entre ambos, la FK (`RESTRICT`) rechaza el DELETE y se responde el mismo `409`. Storage no se toca. La ubicación no bloquea (FK `SET NULL`): queda sin lote y puede reasignarse con `ubicacionId`. No hay baja lógica de lotes. |

### Grupo familiar (modelo plano)

Una familia tiene un único titular y N miembros directos; una persona pertenece como máximo a una familia. No hay familias anidadas ni ciclos:

- un miembro no puede ser titular: agregarle miembros (`POST /personas/:id/grupo-familiar/miembros`) o elegirlo como `jefeDeFamiliaId` al crear una persona responde `409`;
- un titular con miembros no puede pasar a ser miembro, y nadie es su propio jefe (regla del helper central `assertJefeDeFamiliaAsignable`);
- un `jefeDeFamiliaId` inexistente responde `400`;
- `PUT /personas/:id` no modifica el grupo familiar (`jefeDeFamiliaId` se ignora), así que ninguna persona existente pasa a ser miembro;
- el borrado de un titular con miembros responde `409`; un miembro se puede borrar si pasa los guards comerciales.

El miembro nuevo hereda la inmobiliaria del titular; si está `ELIMINADO`, `409` (D1).

## Contrato de errores (D4)

Toda respuesta de error usa:

```json
{ "success": false, "code": "NOT_FOUND", "message": "Texto público" }
```

- `errors: [{ field, message }]` solo en errores de validación (`code: VALIDATION_ERROR`).
- `code` por status: `BAD_REQUEST` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `PAYLOAD_TOO_LARGE` (413), `TOO_MANY_REQUESTS` (429), `INTERNAL_ERROR` (5xx). Los conflictos de Prisma usan `CONFLICT_UNIQUE` (P2002) y `CONFLICT_FK` (P2003, sin el nombre de la constraint: ese detalle va solo al log saneado); P2025 → `404`.
- Un error de dominio 4xx conserva su mensaje. Un 5xx, o cualquier error inesperado, responde `Error interno.` (o el mensaje fijo de Files) sin stack, mensaje interno ni metadata de Prisma o Supabase.
- `error` en los rechazos de `authenticate`/`authorize` repite `message`: es **legacy y deprecated**, se mantiene porque el frontend todavía lo lee.
- Ruta o método inexistente → `404` `{ success: false, code: 'NOT_FOUND', message: 'Ruta no encontrada' }` (`notFoundHandler`).
- Body JSON de más de **1 MB** → `413` `PAYLOAD_TOO_LARGE`; JSON mal formado → `400`. Archivos (multipart): hasta 20 MB, el exceso responde `400`.

## Logging

- **Requests:** una línea al terminar la respuesta con método, path, status y duración. Sin query string (puede traer búsquedas con PII). En `NODE_ENV=test` no se loguea.
- **Errores inesperados:** se loguean saneados (`safeErrorForLog`), nunca el objeto completo. De un error de Prisma se registran nombre, código, metadata estructural y stack, pero no el mensaje (puede traer la query y sus argumentos); de otros errores, el mensaje y el stack con credenciales y tokens redactados.
- **Prisma:** en producción el cliente solo loguea `warn` (ni queries ni el log `error` propio, que imprime el mensaje crudo). En desarrollo loguea `error`, `warn` y `query`.
- **Auth:** un JWT rechazado loguea solo el tipo de error, sin el token ni headers.
- Limitación conocida: los path params siguen en el path logueado (por ejemplo `/api/personas/cuil/:cuil`) y pueden contener PII. Reemplazarlos por la plantilla de la ruta queda post-Cloud.

## Inventario de API y OpenAPI

El contrato congelado son **78 operaciones `/api` + `GET /health` = 79 operaciones**, descriptas en `Backend/documents/documentacionApi.yaml` (OpenAPI 3.0.3, seguridad Bearer por operación y roles en `x-roles`). `tests/unit/openapi/openapi.contract.test.ts` compara la OpenAPI con las rutas montadas en runtime: cada ruta real debe estar documentada y viceversa, con la misma seguridad y los mismos roles que `authenticate`/`authorize`. Agregar, quitar o cambiar los roles de una ruta sin actualizar la OpenAPI rompe la suite.

## Variables relevantes

La configuración se valida con Zod en `src/config/env.ts`. Contratos separados:

### WebEnv (proceso HTTP)

Requeridas: `NODE_ENV` (`development` | `test` | `production`), `DATABASE_URL`, `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`. En `production`, también `FRONTEND_URL`.

Defaults: `PORT=3000`, `JWT_EXPIRES_IN=2h`, `SUPABASE_BUCKET=lotes-files`.

Reglas adicionales (el proceso no arranca si no se cumplen):

- `JWT_SECRET`: en `production`, al menos 32 caracteres (HS256). En development/test no se exige largo mínimo.
- `JWT_EXPIRES_IN`: duración positiva con unidad (`2h`, `30m`, `1d`). Un número sin unidad (`3600`) se rechaza: `jsonwebtoken` lo interpretaría como milisegundos.
- `FRONTEND_URL`: requerido en `production`; un único origin.
- `PORT`: entero entre 1 y 65535.

Rotar `JWT_SECRET` invalida todos los JWT emitidos: cada usuario tiene que volver a loguearse.

Carga local: `src/config/loadEnv.ts` lee `Backend/.env` sin sobrescribir variables ya inyectadas (shell, Docker, Cloud). Validación fail-fast en `src/config/bootstrapWeb.ts` antes de `listen`.

Secretos: `DATABASE_URL`, `JWT_SECRET`, `SUPABASE_SERVICE_KEY`. No loguear valores.

### JobEnv (expiraciones)

Solo `DATABASE_URL`. Validado al inicio de `runExpirationsCli`. Sin JWT, Supabase, `PORT` ni `FRONTEND_URL`.

### Tooling Prisma

`DIRECT_URL` figura en `prisma/schema.prisma` para `prisma validate` y las migraciones (`prisma migrate dev`, `prisma migrate deploy`); `prisma generate` no la requiere (Prisma 6.18). No forma parte de JobEnv ni se exige al job en runtime.

Nunca publicar valores reales en docs ni en Git.

## CORS / `FRONTEND_URL`

`FRONTEND_URL` es **un único origin** autorizado para browsers (sin path, sin CSV, matching exacto). Ejemplos: `http://localhost:5173` o `https://frontend.example.com`. Se recortan espacios externos de la variable; no se normaliza el header `Origin`.

Fuera de `production`, `http://localhost:5173` se admite automáticamente. En `production` no: hay que configurar `FRONTEND_URL` de forma explícita (requerido en WebEnv al arrancar). Las requests sin `Origin` (curl, Postman, server-to-server) no dependen de esta lista.

Configuración (`src/app.ts`):

- Métodos: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`. Headers permitidos: `Content-Type` y `Authorization`. Preflight → `204`.
- Origin permitido → `Access-Control-Allow-Origin` con ese origin. Origin no permitido → sin `Access-Control-Allow-Origin` (la respuesta no se rechaza en el servidor: es el navegador el que bloquea la lectura).
- Sin `Access-Control-Allow-Credentials`: la auth es Bearer en `Authorization`, sin cookies (ver "Modelo Bearer-only").

CORS es una política del navegador: decide qué origins pueden leer respuestas desde JavaScript. No protege el API frente a clientes HTTP arbitrarios (curl, scripts, server-to-server), que no aplican CORS. La seguridad del recurso la dan JWT + RBAC.
