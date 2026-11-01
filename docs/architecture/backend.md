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
- `src/middlewares`: JWT, roles, validación, logs y errores.
- `src/domain`: reglas/tipos de estados.
- `src/jobs`: expiración de reservas y promociones.
- `prisma`: esquema, migraciones y seeds.

## Seguridad

Las rutas privadas usan `authenticate` y `authorize`. Los roles son `ADMINISTRADOR`, `GESTOR`, `INMOBILIARIA` y `TECNICO`. Las validaciones ocurren antes del controlador y `handleError` centraliza errores.

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

Los controllers no reinterpretan los valores transformados (`Number(...)`, `parseInt(...)`, `=== 'true'`, casts) ni leen `req.query` directamente: lo verifica `tests/unit/architecture/controllers.query.guard.test.ts`, que falla si algún controller vuelve a contener `req.query`. Quien agregue una ruta con `validateQuery` debe leerla con `validatedQuery` y el mismo objeto de schema; si la ruta no validó query, o la validó con otro schema, lanza.

### Política de IDs HTTP (path y query)

Los IDs numéricos de las rutas con `validateParams()` (`/:id`, `/:ventaId`, `/:miembroId`, …), los IDs de query que representan PKs reales (`propietarioId`, `ubicacionId`, `loteId`, `clienteId`, `inmobiliariaId`, `compradorId`) y los campos históricos con semántica de identificador que siguen declarados en los schemas aunque sean filtros legacy no implementados (`vendedorId`) siguen una única política, `positiveIntString` en `src/validations/params.validation.ts`: entero decimal positivo canónico dentro de int4 (`1` a `2147483647`), con output `number`. `0`, `-1`, `007`, `+5`, `1e2`, `0x10`, `1.5`, `" 12"` o `2147483648` responden `400`.

La política no cubre rutas que no usan `validateParams()`; por ejemplo `PUT /api/files/:id` todavía interpreta su `:id` en el controller. Tampoco cubre los decimales de query (`superficieMin/Max`, `sena`, `montoMin/Max`, que usan `z.coerce.number()`) ni los IDs de body (`idInt`).

### Contrato de query params

- **Claves desconocidas**: se descartan en silencio (sin `400`) y no llegan al controller ni al service. Los schemas de query no usan `.strict()` porque el frontend manda parámetros que el backend no declara (por ejemplo `estado` y `pageSize` a `/inmobiliarias`). Con el parser `simple` de Express 5, `foo[]=1` y `foo[bar]=1` son claves literales desconocidas, no arrays ni objetos.
- **Query repetida**: `?id=1&id=2` llega como array y ningún filtro admite varios valores, así que responde `400`.
- **Booleanos**: `booleanQuery` (`src/validations/query.validation.ts`) acepta únicamente `"true"` y `"false"` en minúscula y entrega un `boolean` (`deudor`, `includeInactive`, `includeDeleted`). `1`, `0`, `yes`, `TRUE`, `""` y los arrays responden `400`. No usar `z.coerce.boolean()`: convierte `"false"` en `true`.
- **Qué recibe el service**: el schema de una ruta puede aceptar más filtros de los que el service usa. En `GET /lotes` el controller entrega al service el objeto validado por `queryLoteSchema`, y el service usa solo los filtros que implementa: los campos históricos que el schema todavía declara (`superficieMin/Max`, `fechaCreacionFrom/To`) se ignoran y siguen como deuda documentada abajo, fuera de #255; reservas, ventas y prioridades conservan un DTO explícito con los filtros soportados.

### Deuda conocida de query (fuera del contrato actual)

- Filtros que el schema acepta y valida pero ningún service usa: lotes (`superficieMin`, `superficieMax`, `fechaCreacionFrom`, `fechaCreacionTo`), reservas (`desde`, `hasta`, `clienteId`, `inmobiliariaId`, `sena`, `fechaFinReservaDesde`, `fechaFinReservaHasta`) y ventas (`compradorId`, `vendedorId`, `fechaVentaFrom`, `fechaVentaTo`, `montoMin`, `montoMax`). Pendiente decidir, por filtro, implementarlo o quitarlo del schema. `inmobiliariaId` de reservas no debe pasar a ser filtro real sin revisar el aislamiento por tenant.
- `GET /ventas/inmobiliaria/:id` reutiliza `queryVentaSchema` pero solo filtra por `estadoOperativo`.
- `GET /reservas/filtrarPorEstado` es inalcanzable: `/:id` la captura antes y responde `400`. Su controller lee la query validada, pero la ruta sigue pendiente de eliminar.
- `deudor` no se restringe por rol: un `TECNICO` puede filtrar por `deudor` aunque el campo `deuda` se le oculte en la respuesta.
- `personas.limit` no tiene un máximo funcional.
- `queryInmobiliariaSchema` y `queryUsuarioSchema` no se usan en ninguna ruta.

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
