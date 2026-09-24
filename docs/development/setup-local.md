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

```bash
cd Backend && npm run dev
cd frontend && npm run dev
```

Alternativa desde la raíz: `docker compose up --build`.

## Build y pruebas

```bash
cd Backend && npm run build && npm test
cd frontend && npm run build && npm run lint
```

## Problemas comunes

- Revisar URLs de PostgreSQL si Prisma no conecta.
- Revisar `VITE_API_BASE_URL`, `FRONTEND_URL` y puertos 5173/3000 si falla la API.
- Si hay expiraciones duplicadas en producción, usar un único job externo y `ENABLE_CRON=false`.
