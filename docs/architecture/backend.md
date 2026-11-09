# Arquitectura backend

El backend usa Node.js, Express 5, TypeScript, Prisma y PostgreSQL. `src/app.ts` compone y exporta Express (CORS, JSON, logging, rutas y errores). `src/server.ts` es el lifecycle del **proceso web**: `listen` sobre `PORT` y cierre ordenado ante `SIGTERM`/`SIGINT`. No programa tareas. El proceso HTTP usa un único `PrismaClient` (`src/config/prisma.ts`). Las expiraciones corren en un **job one-shot** (`src/jobs/runExpirations.ts` → `node dist/jobs/runExpirations.js`).

## Arranque

- **Desarrollo:** `npm run dev` — TypeScript con watcher sobre `src/server.ts`.
- **Producción:** `npm run build` && `npm start` — JavaScript compilado (`node dist/server.js`), sin `ts-node-dev`.

`npm run build` genera Prisma Client en `src/generated/prisma`, compila TypeScript a `dist/` y copia el cliente (JS, runtime y binaries) a `dist/generated/prisma`. El mismo build deja el artefacto del job en `dist/jobs/runExpirations.js`.

## Health

`GET /health` es **liveness**: el proceso Node + Express responde HTTP. Devuelve `200` con `{"status":"ok"}` y `Cache-Control: no-store`. Es público (sin JWT). No consulta PostgreSQL, Prisma, Supabase ni otros servicios. No es readiness: una DB caída no hace “muerto” al proceso.

## Shutdown

`SIGTERM` e `SIGINT` disparan un cierre ordenado (idempotente): drena el HTTP server (`close` + `closeIdleConnections`), desconecta Prisma y deja `process.exitCode = 0` para que Node termine solo. Timeout defensivo de 10 s: `closeAllConnections()` y `process.exit(1)`. La lógica vive en `src/serverLifecycle.ts`; el arranque sigue en `src/server.ts`.

## Job de expiración

Proceso distinto al web. No sirve HTTP, no usa `PORT` y no importa Express. Contrato productivo: `npm run jobs:expirations:prod` → `node dist/jobs/runExpirations.js`. Ejecuta `expirePromotions` y `expireReservas` una vez, desconecta Prisma y termina con `exitCode` 0 (éxito) o 1 (fallo fatal, incluido error de disconnect). El scheduler concreto (quién dispara el proceso, y con qué cadencia) queda fuera de la aplicación; la cadencia observable actual era aproximadamente horaria (`0 * * * *`) y se preserva como expectativa de infra futura.

## Estructura

- `src/routes`: endpoints y cadena de middleware.
- `src/controllers`: adaptación HTTP y delegación.
- `src/services`: reglas de negocio y acceso con Prisma.
- `src/validations`: esquemas Zod para body, parámetros y query.
- `src/middlewares`: JWT, roles, validación, rate limit de login, logs y errores.
- `src/domain`: reglas/tipos de estados.
- `src/jobs`: expiración de reservas y promociones.
- `prisma`: esquema, migraciones y seeds.

## Seguridad

Las rutas privadas usan `authenticate` y `authorize`. Los roles son `ADMINISTRADOR`, `GESTOR`, `INMOBILIARIA` y `TECNICO`. Las validaciones ocurren antes del controlador y `handleError` centraliza errores.

### Autenticación: JWT + identidad vigente desde la DB

El JWT es una **prueba de identidad firmada**; la **DB es la fuente vigente de autorización**. `authenticate` (`src/middlewares/auth.middleware.ts`):

1. Lee `Authorization: Bearer <JWT>`. Sin header o sin el prefijo `Bearer ` → `401` (`Token no proporcionado`).
2. Verifica firma y expiración con `JWT_SECRET`. Token expirado → `401` (`Token expirado`); firma inválida o token malformado → `401` (`Token inválido`).
3. Obtiene el id de usuario del claim `sub` (o `id`, legacy): debe ser un entero positivo (number o string decimal canónico). Si no lo es → `401` (`Token inválido`).
4. Relee la identidad con `findAuthIdentity` (`src/services/authIdentity.service.ts`): `id`, `email`, `role` y la inmobiliaria asociada (`User ← Inmobiliaria.userId`). Nunca lee la password.
5. Usuario inexistente (por ejemplo, eliminado con un JWT todavía vigente) → `401` con el mismo mensaje que un token inválido. Un error de la DB no es un problema de credenciales: va al middleware de errores (`500` genérico).
6. Arma `req.user` con el rol y el `inmobiliariaId` **de la DB**. Los claims `role`, `email` e `inmobiliariaId` del token no se usan para autorizar.
7. `authorize(...roles)` compara contra `req.user.role`.

Consecuencias: un cambio de rol o de inmobiliaria rige desde el siguiente request autenticado, sin esperar a que venza el token, y un usuario eliminado deja de entrar. El costo es una lectura por PK en cada request autenticado. El modelo `User` no tiene un estado activo/inactivo: la única revocación es eliminar al usuario (o esperar el vencimiento del token, `JWT_EXPIRES_IN`, default `2h`).

**Login timing.** Con un email inexistente, `POST /auth/login` igual ejecuta `bcrypt.compare` contra un hash dummy constante del mismo costo (`DUMMY_PASSWORD_HASH`, cost 10, en `auth.service.ts`). Elimina la diferencia trivial de trabajo criptográfico entre "usuario inexistente" y "password incorrecta"; ambos responden `401 Credenciales inválidas`. No pretende ser una garantía absoluta contra la enumeración de usuarios.

### Modelo Bearer-only

```text
login → token en localStorage (lf_token) → Authorization: Bearer → backend
```

No hay cookies de autenticación, ni `Set-Cookie`, ni refresh cookie. El frontend no envía `credentials: "include"` y el CORS del backend no habilita credentials. El helper general (`frontend/src/lib/http/http.js`) y los fetch directos de multipart y signed URLs (`lib/api/archivos.js`) agregan el header `Authorization`.

Como el navegador no adjunta credenciales de forma automática, el CSRF clásico basado en cookies no aplica a este modelo y no hay protección CSRF dedicada.

Código legacy: el frontend conserva un flujo de refresh (`refreshTokens`/`apiRefresh` en `http.js` y `lib/auth/api.js`, la clave `lf_refresh` y las variables `VITE_AUTH_REFRESH_*`) que apunta a `/auth/refresh`, una ruta que el backend **no** expone. No forma parte del runtime exitoso: ante un `401`, el helper intenta ese refresh y, como no hay refresh token, limpia los tokens y redirige a `/login`.

### Rate limiting de login

Solo `POST /api/auth/login` (`src/middlewares/loginRateLimit.middleware.ts`, `express-rate-limit` 8.7.3). Va antes de la validación del body, así que también cuentan los intentos con body inválido. No mira el JWT, `req.user` ni el email.

- Ventana de 15 minutos y **10 intentos fallidos** por cliente; el siguiente responde `429` con `{ success: false, code: 'TOO_MANY_REQUESTS', message }` sin llegar al login.
- `skipSuccessfulRequests`: un login exitoso (status < 400) no consume cupo. Una vez bloqueado, la password correcta también recibe `429` hasta que vence la ventana.
- Headers estándar `RateLimit`/`RateLimit-Policy` (`draft-8`); sin los legacy `X-RateLimit-*`.

Identificación del cliente (sin cambiar el `trust proxy` global de Express):

- **Render (`RENDER=true`, exactamente ese valor):** header `CF-Connecting-IP`, que Cloudflare escribe en cada request y sobrescribe lo que mande el cliente. Solo se acepta si es exactamente una IP válida (`net.isIP` después de recortar espacios); una lista, una IP con puerto, un valor vacío o un header repetido van al fallback.
- **Fallback (y fuera de Render):** `req.ip` → `socket.remoteAddress` → una key constante. En Render, `req.ip` es la IP del proxy: un bucket compartido, más restrictivo, pero nunca una key elegida por el cliente.
- `ipKeyGenerator` normaliza IPv4-mapped a IPv4 y agrupa IPv6 por `/56`.
- **`X-Forwarded-For` no se usa como key**: Cloudflare agrega entradas en lugar de reemplazarlo, así que su lado izquierdo lo controla quien llama.

Limitaciones: el store es en memoria (`MemoryStore`, por proceso). Alcanza con la única instancia actual; con varias instancias cada una contaría por separado y habría que pasar a un store compartido. El contrato de client IP es específico de Render: al migrar a Cloud Run hay que revalidarlo antes de reutilizarlo.

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

Errores de Files: un error de dominio con `statusCode` 4xx conserva su status y su `{ message }`. Cualquier otro error es inesperado: `500` con un mensaje público fijo (por ejemplo, `Error al obtener archivos`), sin el objeto de error, stack, mensaje interno ni metadata de Prisma o Supabase; el detalle queda solo en el log del servidor.

## Validación de requests

Middlewares de `src/middlewares/validation.middleware.ts`; un dato inválido responde `400` con `{ success: false, message: 'Datos inválidos', errors: [{ field, message }] }`.

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

La convención histórica se mantiene: `PUT` es un update parcial y cada campo es opcional. Un update sin ningún campo válido (`{}` o solo claves desconocidas, que Zod descarta) responde `400` con `Debes enviar al menos un campo para actualizar`. Se evalúa sobre el resultado de Zod (`tieneAlgunCampo` / `ACTUALIZAR_SIN_CAMPOS`, en `body.validation.ts`). No se usa `.strict()`: un body con al menos un campo válido sigue funcionando aunque traiga además claves desconocidas, que se descartan. Aplica a lotes, ventas, usuarios, ubicaciones, personas, fracciones, reservas, prioridades e inmobiliarias.

### Legacy eliminado

Dejaron de formar parte del API (el schema, la ruta y su controller se eliminaron):

- `GET /reservas/filtrarPorEstado`: era inalcanzable, `/:id` la capturaba antes.
- `PUT /files/:id` (actualización de metadata de archivos).
- Los filtros de query que ningún service implementaba: lotes (`superficieMin`, `superficieMax`, `fechaCreacionFrom`, `fechaCreacionTo`), reservas (`desde`, `hasta`, `clienteId`, `inmobiliariaId`, `sena`, `fechaFinReservaDesde`, `fechaFinReservaHasta`) y ventas (`compradorId`, `vendedorId`, `fechaVentaFrom`, `fechaVentaTo`, `montoMin`, `montoMax`). Si llegan en la URL se descartan como cualquier clave desconocida.
- Los schemas sin uso `queryUsuarioSchema`, `queryInmobiliariaSchema`, `fileMetadataSchema` e `identificadorSchema`, y `user.validation.ts`.

### Fracciones

`numero` es `Int @unique` en Prisma. El contrato HTTP lo recibe como entero positivo dentro de int4 (`5` y `"5"` válidos; `"05"`, `"1e2"`, `"+5"`, `5.5`, `0`, booleanos, `null` y valores mayores a `2147483647` responden `400`) y lo entrega siempre como `number`. Una fracción inexistente responde `404` y un número ya existente responde `409`, tanto al crear como al actualizar. Eliminar una fracción con lotes asociados sigue respondiendo `400`.

### Errores HTTP concretos de Files y Promociones

- **Multipart inválido**: un `MulterError` causado por el input del cliente (campo de archivo que no es `file`, demasiados archivos o partes, nombre o valor de campo fuera de límites) responde `400` en lugar de `500`. `LIMIT_FILE_SIZE` conserva su `400` con el mensaje de tamaño máximo (20 MB). Un error interno que no es de Multer sigue respondiendo `500`.
- **Archivo inexistente**: `POST /files/:id/restore` y `POST /files/:id/sustituir` responden `404`. Restaurar un archivo que no está eliminado, sustituir uno eliminado o sustituir un tipo no sustituible responden `400`. El status sale del `statusCode` que lanza `file.service`, no del texto del mensaje. En `POST /files/:id/sustituir`, `validateParams` se ejecuta antes que multer.
- **Promociones**: `aplicar` y `quitar` delegan los errores en el middleware global con `next(error)`; ya no responden de forma manual. Un error con `statusCode` conserva su status y mensaje, `P2002` responde `409`, `P2025` responde `404` y un error inesperado responde `500` genérico sin exponer su mensaje interno. Esos códigos Prisma se reconocen con `instanceof Prisma.PrismaClientKnownRequestError` del cliente generado en `src/generated/prisma`, que es la clase que ese cliente lanza. La clase homónima de `@prisma/client/runtime/library` es otra y no identifica estos errores.

### Deuda conocida de query y errores

- `personas.limit` no tiene un máximo funcional.
- Otros catches locales de los controllers (por ejemplo Persona) siguen respondiendo de forma manual y pueden exponer `error.message`; no se unificaron. Files ya no lo hace (ver "Files: acceso por tipo y errores").
- El middleware global responde con `err.message` para cualquier error que traiga `status` o `statusCode`, incluidos los 5xx.

## Variables relevantes

La configuración se valida con Zod en `src/config/env.ts`. Contratos separados:

### WebEnv (proceso HTTP)

Requeridas: `NODE_ENV` (`development` | `test` | `production`), `DATABASE_URL`, `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`. En `production`, también `FRONTEND_URL`.

Defaults: `PORT=3000`, `JWT_EXPIRES_IN=2h`, `SUPABASE_BUCKET=lotes-files`.

Carga local: `src/config/loadEnv.ts` lee `Backend/.env` sin sobrescribir variables ya inyectadas (shell, Docker, Cloud). Validación fail-fast en `src/config/bootstrapWeb.ts` antes de `listen`.

Secretos: `DATABASE_URL`, `JWT_SECRET`, `SUPABASE_SERVICE_KEY`. No loguear valores.

### JobEnv (expiraciones)

Solo `DATABASE_URL`. Validado al inicio de `runExpirationsCli`. Sin JWT, Supabase, `PORT` ni `FRONTEND_URL`.

### Tooling Prisma

`DIRECT_URL` figura en `prisma/schema.prisma` para migraciones y `prisma generate`; no forma parte de JobEnv ni se exige al job en runtime.

Nunca publicar valores reales en docs ni en Git.

## CORS / `FRONTEND_URL`

`FRONTEND_URL` es **un único origin** autorizado para browsers (sin path, sin CSV, matching exacto). Ejemplos: `http://localhost:5173` o `https://frontend.example.com`. Se recortan espacios externos de la variable; no se normaliza el header `Origin`.

Fuera de `production`, `http://localhost:5173` se admite automáticamente. En `production` no: hay que configurar `FRONTEND_URL` de forma explícita (requerido en WebEnv al arrancar). Las requests sin `Origin` (curl, Postman, server-to-server) no dependen de esta lista.

Configuración (`src/app.ts`):

- Métodos: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`. Headers permitidos: `Content-Type` y `Authorization`. Preflight → `204`.
- Origin permitido → `Access-Control-Allow-Origin` con ese origin. Origin no permitido → sin `Access-Control-Allow-Origin` (la respuesta no se rechaza en el servidor: es el navegador el que bloquea la lectura).
- Sin `Access-Control-Allow-Credentials`: la auth es Bearer en `Authorization`, sin cookies (ver "Modelo Bearer-only").

CORS es una política del navegador: decide qué origins pueden leer respuestas desde JavaScript. No protege el API frente a clientes HTTP arbitrarios (curl, scripts, server-to-server), que no aplican CORS. La seguridad del recurso la dan JWT + RBAC.
