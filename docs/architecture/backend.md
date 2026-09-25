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
