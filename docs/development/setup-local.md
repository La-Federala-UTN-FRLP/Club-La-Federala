# Puesta en marcha local

## Requisitos previos

- Node.js y npm.
- Docker Desktop/Compose si se usa el entorno integrado.
- PostgreSQL o el servicio `db` de `docker-compose.yml`.

## Instalación

```bash
cd Backend && npm install
cd ../frontend && npm install
```

## Variables de entorno

Copiar `Backend/.env.example` → `Backend/.env` (gitignored). No commitear secretos.

**WebEnv** (dev / `npm start`): `NODE_ENV`, `DATABASE_URL`, `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`; en `production` también `FRONTEND_URL`. Opcionales con default: `PORT`, `JWT_EXPIRES_IN`, `SUPABASE_BUCKET`.

Se validan al arrancar (fail-fast):

- `JWT_SECRET`: en `production`, al menos 32 caracteres. En local alcanza con cualquier valor no vacío; no hace falta un secreto productivo.
- `JWT_EXPIRES_IN`: con unidad (`2h`, `30m`, `1d`). `3600` sin unidad se rechaza.
- `FRONTEND_URL`: un único origin, requerido en `production`.

**JobEnv** (expiraciones): solo `DATABASE_URL`.

**Tooling Prisma:** `DIRECT_URL` además de `DATABASE_URL` para `prisma validate`, migraciones (`prisma migrate dev`, `prisma migrate deploy`), seeds y demás operaciones que validan el datasource (schema actual). `prisma generate` no las requiere (Prisma 6.18).

`FRONTEND_URL` es un único origin CORS (no CSV). En local: `http://localhost:5173`. Detalle en `docs/architecture/backend.md`.

**Frontend** (`frontend/.env.example`):

- `VITE_API_BASE_URL`: base de la API **incluyendo `/api`** (nombre canónico). En development con localhost se usa el proxy de Vite.
- `VITE_API_FORCE_ABSOLUTE`: `true` para usar la URL tal cual también en development. Opcional.
- `VITE_AUTH_TOKEN_KEY`: clave de localStorage del token (default `lf_token`). Opcional.
- `VITE_RBAC_DISABLE_UI`: `true` desactiva el gating visual por rol, solo para maquetar. No usar fuera de desarrollo; el backend sigue autorizando.
- `VITE_API_BASE`: compatibilidad, se lee solo si falta `VITE_API_BASE_URL`. No usarla en configuraciones nuevas.
- `VITE_API_URL` no existe: no usarla.

Revisar el `.env` / `.env.local` local del frontend (no versionado): si todavía tiene `VITE_AUTH_REFRESH_*`, `VITE_AUTH_ME_PATH`, `VITE_AUTH_LOGIN_PATH` o `VITE_API_URL`, borrarlas. El código ya no las lee.

## Ejecución

Desarrollo (TypeScript + watcher):

```bash
cd Backend && npm run dev
cd frontend && npm run dev
```

Arranque compilado del backend (el mismo contrato productivo):

```bash
cd Backend && npm run build && npm start
```

`npm start` ejecuta `node dist/server.js` y **no** corre el job de expiraciones.

### Docker: desarrollo vs producción

- `docker compose up --build` (desde la raíz) es el **entorno de desarrollo**: el backend usa el stage `deps` del Dockerfile (con devDependencies), monta el código por volumen, aplica migraciones y corre `npm run dev` (`ts-node-dev`). Compose interpola las variables `${…}` del servicio desde el `.env` de la raíz; las que no declara (por ejemplo Supabase) las carga la app desde `Backend/.env`, montado por el volumen.
- La **imagen productiva** es el stage final `runtime` de `Backend/Dockerfile`: solo `dist` y dependencias de producción, `NODE_ENV=production`, usuario sin privilegios, `node dist/server.js`. El job usa la misma imagen con el comando `node dist/jobs/runExpirations.js`.

```bash
docker build -t federala-backend Backend
```

El runtime de desarrollo no es el productivo: nunca desplegar `npm run dev`.

La imagen se construye sin `.env` ni secretos: durante `prisma generate`, el stage `build` usa URLs de base **dummy** solo en ese comando (no se conecta a nada y no quedan en la imagen). El runtime recibe las URLs reales por entorno.

Comprobar liveness (sin autenticación):

```bash
curl -i http://localhost:3000/health
```

Esperado: `200` y `{"status":"ok"}`. Eso no garantiza PostgreSQL ni Supabase.

## Job de expiraciones (manual)

El web no programa expiraciones. Para correrlas a mano contra la DB configurada en el entorno:

```bash
cd Backend && npm run jobs:expirations
```

Para validar el artefacto compilado:

```bash
cd Backend && npm run build && npm run jobs:expirations:prod
```

El job escribe en la base apuntada por `DATABASE_URL` (JobEnv). Carga `.env` local sin pisar env inyectada. No usarlo contra producción para pruebas.

## Build y pruebas

El build del backend genera Prisma Client (`prisma generate` no requiere `DATABASE_URL` ni `DIRECT_URL`; sí las requieren `prisma validate` y las migraciones), compila TypeScript y deja el cliente en `dist/generated/prisma`.

```bash
cd Backend && npm run build && npm test
cd frontend && npm run build && npm run lint
```

## Tests de integración (PostgreSQL real)

Las garantías que dependen de la base (índice único de prioridades, locks del borrado de personas y carreras entre requests) se prueban contra una base PostgreSQL **descartable**, fuera de `npm test`:

```bash
docker run -d --name fed-pgtest -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=fed_test -p 55432:5432 postgres:16-alpine
export TEST_DATABASE_URL="postgresql://test:test@127.0.0.1:55432/fed_test?schema=public"
DATABASE_URL="$TEST_DATABASE_URL" DIRECT_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
npm run test:integration
```

Los tests vacían la base en cada caso: nunca apuntar `TEST_DATABASE_URL` a una base con datos reales.

## Problemas comunes

- Revisar URLs de PostgreSQL si Prisma no conecta.
- Revisar `VITE_API_BASE_URL`, `FRONTEND_URL` y puertos 5173/3000 si falla la API.
- El proceso web ya no dispara expiraciones; si hace falta correrlas, usar el job one-shot (no contra producción para pruebas).
