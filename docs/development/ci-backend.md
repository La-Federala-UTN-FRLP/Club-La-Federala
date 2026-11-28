# CI del backend (GitHub Actions)

Workflow: [`.github/workflows/backend-ci.yml`](../../.github/workflows/backend-ci.yml).

## Cuándo se ejecuta

En cada pull request hacia `main` que modifique `Backend/**` o el propio workflow (apertura, nuevos commits y reapertura). Un commit nuevo en el mismo PR cancela la ejecución anterior. Los PRs que solo tocan el frontend o la documentación no lo disparan.

## Qué valida

Un único job en `ubuntu-24.04` con Node.js 24, desde `Backend/`, en este orden:

| Paso | Comando | Necesita base |
|---|---|---|
| Instalación reproducible (genera Prisma Client) | `npm ci` | no |
| Tipos de la app y de los tests | `npm run typecheck` | no |
| Build productivo | `npm run build` | no |
| Tests unitarios y de contrato HTTP | `npm test` | no |
| Migraciones sobre la base descartable | `npx prisma migrate deploy` | sí |
| Tests de integración | `npm run test:integration` | sí |

Primero corren los pasos sin base, que son los más rápidos en fallar. Las migraciones van justo antes de la integración, que es lo único que las necesita.

## PostgreSQL temporal

- Service container `postgres:17-alpine`, creado para el job y destruido al terminar. No guarda datos entre ejecuciones.
- Los steps empiezan cuando el health check (`pg_isready`) da healthy. `prisma migrate deploy` falla si la base no responde.
- Conexión local al runner: `TEST_DATABASE_URL=postgresql://federala_ci:federala_ci@127.0.0.1:5432/federala_ci?schema=public`. Esas credenciales solo existen en ese contenedor: no son secretos ni sirven fuera del CI.
- `prisma migrate deploy` recibe `DATABASE_URL` y `DIRECT_URL` con ese valor solo en su step. Los tests de integración los configuran desde `TEST_DATABASE_URL` en `tests/integration/setup.ts`.
- Aplica las migraciones versionadas de `Backend/prisma/migrations`, sin crearlas ni modificarlas. No corre seeds.
- Usa un único usuario dueño de la base: los tests de integración vacían las tablas con `TRUNCATE`. Los roles con privilegios mínimos de staging (`federala_migrate` / `federala_app`) no se prueban acá.

## Cómo interpretar el resultado

- **Verde:** el código del PR instala desde el lockfile, compila, pasa los tests unitarios y de integración, y las 69+ migraciones se aplican desde cero sobre PostgreSQL 17.
- **Rojo:** abrir el step fallido en la pestaña *Checks* del PR. Un fallo en `migrate deploy` indica una migración que no aplica desde cero. Un fallo en integración apunta a constraints, locks o consultas que el mock no cubre.
- Mientras no se configure como check obligatorio en `main`, un rojo no bloquea el merge: lo evalúa la revisión del PR (ver [validaciones y CI](git-flow.md#validaciones-y-ci)).

## Qué no hace

- No despliega ni construye imágenes Docker.
- No accede a Google Cloud: sin `gcloud`, Workload Identity Federation ni secretos de GCP.
- No usa secretos del repositorio, credenciales de staging ni bases remotas.
- No usa `pull_request_target`. El token de GitHub es de solo lectura (`contents: read`) y el checkout no conserva credenciales.
- No valida el frontend.

## Reproducir localmente

Con Node.js 24 y Docker, desde `Backend/`:

```bash
docker run -d --name fed-ci-pg -e POSTGRES_USER=federala_ci -e POSTGRES_PASSWORD=federala_ci \
  -e POSTGRES_DB=federala_ci -p 127.0.0.1:55432:5432 postgres:17-alpine
export TEST_DATABASE_URL="postgresql://federala_ci:federala_ci@127.0.0.1:55432/federala_ci?schema=public"

npm ci
npm run typecheck
npm run build
npm test
DATABASE_URL="$TEST_DATABASE_URL" DIRECT_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
npm run test:integration

docker rm -f fed-ci-pg
```

Usar siempre una base descartable: los tests de integración la vacían.
