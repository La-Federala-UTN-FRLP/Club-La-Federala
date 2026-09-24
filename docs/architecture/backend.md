# Arquitectura backend

El backend usa Node.js, Express 5, TypeScript, Prisma y PostgreSQL. `src/app.ts` compone y exporta Express (CORS, JSON, logging, rutas y errores). `src/server.ts` es el lifecycle del proceso: `listen` sobre `PORT` y el scheduler de expiraciones cuando `ENABLE_CRON` no es `false`.

## Arranque

- **Desarrollo:** `npm run dev` — TypeScript con watcher sobre `src/server.ts`.
- **Producción:** `npm run build` && `npm start` — JavaScript compilado (`node dist/server.js`), sin `ts-node-dev`.

`npm run build` genera Prisma Client en `src/generated/prisma`, compila TypeScript a `dist/` y copia el cliente (JS, runtime y binaries) a `dist/generated/prisma`. El scheduler in-process no es el diseño final; su desacople corresponde a #224.

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

`PORT`, `FRONTEND_URL`, `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `ENABLE_CRON`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` y `SUPABASE_BUCKET`. Nunca publicar valores reales.

## CORS / `FRONTEND_URL`

`FRONTEND_URL` es **un único origin** autorizado para browsers (sin path, sin CSV, matching exacto). Ejemplos: `http://localhost:5173` o `https://frontend.example.com`. Se recortan espacios externos de la variable; no se normaliza el header `Origin`.

Fuera de `production`, `http://localhost:5173` se admite automáticamente. En `production` no: hay que configurarlo de forma explícita si hace falta. Si `FRONTEND_URL` falta en `production`, la allowlist de browsers queda vacía (el proceso arranca igual). Las requests sin `Origin` (curl, Postman, server-to-server) no dependen de esta lista.
