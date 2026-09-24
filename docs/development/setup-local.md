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

El backend necesita `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `FRONTEND_URL` y, para archivos, `SUPABASE_*`. El frontend usa `VITE_*`, incluida la URL base de API. Usar valores locales no versionados.

`FRONTEND_URL` es un único origin CORS (no CSV). En local: `http://localhost:5173`. El contrato completo está en `docs/architecture/backend.md`.

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

`npm start` ejecuta `node dist/server.js` y **no** corre el job de expiraciones. Alternativa desde la raíz: `docker compose up --build` (entorno de desarrollo; no es la imagen productiva).

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

El job escribe en la base apuntada por `DATABASE_URL`. No usarlo contra producción para pruebas.

## Build y pruebas

El build del backend genera Prisma Client, compila TypeScript y deja el cliente en `dist/generated/prisma`.

```bash
cd Backend && npm run build && npm test
cd frontend && npm run build && npm run lint
```

## Problemas comunes

- Revisar URLs de PostgreSQL si Prisma no conecta.
- Revisar `VITE_API_BASE_URL`, `FRONTEND_URL` y puertos 5173/3000 si falla la API.
- El proceso web ya no dispara expiraciones; si hace falta correrlas, usar el job one-shot (no contra producción para pruebas).
