# Preparación del entorno QA local

Entorno **local y descartable** para ejecutar la Guía de QA funcional (épica #271, Functional QA & UX): PostgreSQL 16 en Docker, migraciones, datos de prueba (`seed:qa`) y un chequeo automático de permisos, aislamiento y sesión (`qa:api`).

> **Nunca uses la base Supabase compartida de `Backend/.env` para QA.** Las pruebas crean, modifican y borran datos (bajas de inmobiliarias, usuarios eliminados, reservas de prueba). Todo lo de esta guía usa `Backend/.env.qa`, que apunta a `127.0.0.1:5433`. `seed:qa` y `qa:api` abortan si `DATABASE_URL` no es local. Los seeds base (`seed:core`, `seed:personas`, `seed:lrv`) **no tienen ese guard**: corrélos solo a través de `npm run seed:qa -- --base` o con `.env.qa` cargado en la terminal.

## Requisitos

- Docker Desktop iniciado.
- Node.js y las dependencias del backend instaladas (`cd Backend && npm ci`).
- `Backend/.env.qa` (no versionado). Para crearlo, copiá `Backend/.env.qa.example` y completá los `<...>` con valores aleatorios: la contraseña de la base, un `JWT_SECRET` de 48+ caracteres y las `QA_PASS_*`.

### Storage desactivado

`.env.qa` usa valores dummy de `SUPABASE_*` a propósito. El backend arranca porque el cliente de Storage es lazy, pero **no hay storage**: subir, sustituir, firmar URL o purgar archivos responde `500`. Los archivos del seed son solo metadata. Desde la integración de Google Cloud Storage (PR #352), el proveedor se elige con `STORAGE_PROVIDER`. En `.env.qa` no se define, así que queda el default `supabase` con los valores dummy: no hace falta configurar GCS para QA local. Además, la purga ahora responde 500 y conserva la fila si falla el storage, así que en este entorno purgar un archivo como ADMIN da 500 (no es un bug).

Se decidió no apuntar QA al bucket de Supabase del equipo: las rutas de storage son `lote-{id}/…` y los IDs de la base local coinciden con los reales, así que una subida o un purge desde QA podría pisar o borrar archivos compartidos. Los casos DOC que necesitan el binario quedan **BLOCKED** en este entorno.

## Cargar `.env.qa` en la terminal

Los comandos de Prisma y del backend toman las variables del entorno de la terminal, que tienen prioridad sobre `Backend/.env`. Abrí una terminal **solo para QA** y, desde `Backend/`:

bash (Git Bash):

```bash
set -a; . ./.env.qa; set +a
[[ "$DATABASE_URL" =~ @(127\.0\.0\.1|localhost): ]] || echo "⛔ DATABASE_URL no es local: no sigas"
```

PowerShell:

```powershell
Get-Content .env.qa | Where-Object { $_ -match '^\s*[A-Za-z_][A-Za-z0-9_]*\s*=' } | ForEach-Object { $k, $v = $_ -split '=', 2; Set-Item -Path "Env:$($k.Trim())" -Value $v.Trim() }
if ($env:DATABASE_URL -notmatch '@(127\.0\.0\.1|localhost):') { throw "DATABASE_URL no es local" }
```

Las variables quedan cargadas solo en esa terminal. Cerrala al terminar para no correr por error un seed contra otra base.

## Base QA (Docker)

Contenedor `federala-qa-db` (`postgres:16`), publicado solo en `127.0.0.1:5433`, con el volumen propio `federala-qa-data`. No usa ni modifica `docker-compose.yml`.

Con `.env.qa` cargado:

bash:

```bash
# Crear y levantar (la primera vez)
docker run -d --name "$QA_DB_CONTAINER" -e POSTGRES_USER="$QA_DB_USER" -e POSTGRES_PASSWORD="$QA_DB_PASSWORD" -e POSTGRES_DB="$QA_DB_NAME" -p "127.0.0.1:${QA_DB_PORT}:5432" -v "${QA_DB_VOLUME}:/var/lib/postgresql/data" postgres:16

docker start federala-qa-db     # levantar (ya creado)
docker stop federala-qa-db      # parar (los datos se conservan)
docker ps --filter name=federala-qa-db
```

PowerShell:

```powershell
docker run -d --name $env:QA_DB_CONTAINER -e POSTGRES_USER=$env:QA_DB_USER -e POSTGRES_PASSWORD=$env:QA_DB_PASSWORD -e POSTGRES_DB=$env:QA_DB_NAME -p "127.0.0.1:$($env:QA_DB_PORT):5432" -v "$($env:QA_DB_VOLUME):/var/lib/postgresql/data" postgres:16
# docker start / stop / ps: iguales que en bash
```

**Resetear** (borra todos los datos QA). No uses `prisma migrate reset`: con las variables equivocadas borraría otra base. Recreá el contenedor y el volumen y después repetí crear, migrar y seedear:

bash:

```bash
docker rm -f federala-qa-db && docker volume rm federala-qa-data
```

PowerShell:

```powershell
docker rm -f federala-qa-db; docker volume rm federala-qa-data
```

## Migrar y seedear

Con `.env.qa` cargado, desde `Backend/` (los comandos son iguales en bash y en PowerShell):

```bash
npx prisma migrate status          # debe decir: at "127.0.0.1:5433"
npx prisma migrate deploy
npm run seed:qa -- --base          # seeds base (si faltan) + datos QA
```

- `seed:qa` carga `.env.qa` por su cuenta y aborta si la base no es local o no es `QA_DB_NAME`.
- Es idempotente: cada dato se busca por una clave natural (email, `mapId`, `numero`, nombre de archivo) y vuelve a su estado esperado. Correrlo de nuevo restaura los datos QA, pero no borra lo que hayas creado a mano. Para un estado 100 % limpio, reseteá la base.
- `--base` corre `seed:core` y `seed:personas` (idempotentes) y `seed:lrv` solo si falta la Fracción 3, porque `seed:lrv` no es idempotente (falla al crearla de nuevo). No uses `SEED_RESET=1 npm run seed:lrv` en esta base: borra todos los lotes y choca con los archivos, pagos y alquileres que agrega `seed:qa`.
- `seed:qa` reajusta `User_id_seq` al máximo id: `seed:core` lo deja en 15 y el próximo alta de usuario por API chocaría con una cuenta QA.

Verificar que el índice de prioridades exista:

bash:

```bash
docker exec federala-qa-db psql -U "$QA_DB_USER" -d "$QA_DB_NAME" -c "SELECT indexname FROM pg_indexes WHERE indexname = 'Prioridad_loteId_activa_key';"
```

PowerShell:

```powershell
docker exec federala-qa-db psql -U $env:QA_DB_USER -d $env:QA_DB_NAME -c "SELECT indexname FROM pg_indexes WHERE indexname = 'Prioridad_loteId_activa_key';"
```

## Backend QA (puerto 3001)

Desde `Backend/`. No hace falta cargar `.env.qa`: `--env-file` lo inyecta y tiene prioridad sobre `Backend/.env`. Los comandos son iguales en bash y en PowerShell:

```bash
npm run build
node --env-file=.env.qa dist/server.js
```

Comprobar que `/health` devuelva `200 {"status":"ok"}` (es solo liveness: no valida la base). Después, loguearse con una cuenta QA.

bash:

```bash
curl -i http://localhost:3001/health
```

PowerShell:

```powershell
curl.exe -i http://localhost:3001/health
```

## Frontend contra la base QA

En otra terminal, desde `frontend/`:

bash:

```bash
VITE_API_BASE_URL=http://localhost:3001/api VITE_API_FORCE_ABSOLUTE=true npm run dev
```

PowerShell:

```powershell
$env:VITE_API_BASE_URL = "http://localhost:3001/api"; $env:VITE_API_FORCE_ABSOLUTE = "true"; npm run dev
```

Abrir http://localhost:5173. `VITE_API_FORCE_ABSOLUTE=true` es necesario: sin esa variable, en desarrollo el frontend usa el proxy de Vite, que apunta a `:3000` (el backend contra Supabase). El CORS del backend admite `http://localhost:5173` fuera de `production`.

## Cuentas QA

Las contraseñas están solo en `Backend/.env.qa` (`QA_PASS_*`), nunca en docs ni en Git.

| Rol | Email | Variable de la contraseña |
|---|---|---|
| ADMINISTRADOR | `qa.admin@federala.test` | `QA_PASS_ADMIN` |
| GESTOR | `qa.gestor@federala.test` | `QA_PASS_GESTOR` |
| INMOBILIARIA A (QA Inmobiliaria A) | `qa.inmo.a@federala.test` | `QA_PASS_INMO_A` |
| INMOBILIARIA B (QA Inmobiliaria B) | `qa.inmo.b@federala.test` | `QA_PASS_INMO_B` |
| TECNICO | `qa.tecnico@federala.test` | `QA_PASS_TECNICO` |
| Auxiliar "usuario eliminado" (GESTOR) | `qa.aux.eliminado@federala.test` | `QA_PASS_AUX_ELIMINADO` |
| Auxiliar "rate limit / cambio de rol" (GESTOR) | `qa.aux.ratelimit@federala.test` | `QA_PASS_AUX_RATELIMIT` |

Los seeds base agregan otras cuentas, con contraseñas que figuran en `seed.users_inmobiliarias.ts`. Para QA usá las de esta tabla.

## Datos clave → caso de la guía

Los IDs son los de una base recién creada y seedeada en este orden: pueden cambiar si se resetea. Buscá siempre por la clave natural (`mapId` = `Lote{n}-{fracción}`, que coincide con el SVG del mapa, o `numero`).

| Dato clave | Clave natural | ID | Casos |
|---|---|---|---|
| Lote DISPONIBLE (con IMAGEN y PLANO) | `Lote1-4` | 19 | LOT-*, RES-*, PRI-07 |
| Lote DISPONIBLE con deuda | `Lote2-4` | 20 | LOT-04 |
| Lote NO_DISPONIBLE | `Lote3-4` | 21 | LOT-03 |
| Lote VENDIDO (venta ESCRITURADO de A) | `Lote4-4` | 22 | VEN-* |
| Lote RESERVADO (reserva ACTIVA de A) | `Lote5-4` | 23 | RES-* |
| Lote EN_PROMOCION (vigente) | `Lote6-4` | 24 | LOT-* |
| Lote CON_PRIORIDAD CCLF / A / B | `Lote7-4` / `Lote8-4` / `Lote9-4` | 25 / 26 / 27 | PRI-*, PRI-11 |
| Espacio común ("QA Club House") | `Lote10-4` | 28 | LOT-* |
| Lote con alquiler ACTIVO | `Lote11-4` | 29 | LOT-* (ocupación) |
| Lotes de reservas de A (ACEPTADA, RECHAZADA, EXPIRADA, ELIMINADA) | `Lote12-4` … `Lote15-4` | 30–33 | RES-* |
| Lotes de reservas de B (ACTIVA, ACEPTADA, RECHAZADA, EXPIRADA, ELIMINADA) | `Lote16-4` … `Lote20-4` | 34–38 | RES-01, RES-27, GEN-12 |
| Lote con prioridad VENCIDA | `Lote21-4` | 39 | JOB-04 |
| Lote venta INICIADA de A (sin plan) | `Lote22-4` | 40 | VEN-*, PAG-* |
| Lote venta CANCELADA de A | `Lote23-4` | 41 | VEN-* |
| Lote venta CON_BOLETO de B (IMAGEN, PLANO, BOLETO de B) | `Lote25-4` | 42 | DOC-11, GEN-12 |
| Lote venta CON_BOLETO de A (plan y pagos, BOLETO de A) | `Lote26-4` | 43 | PAG-*, DOC-11 |
| Lote con promoción VENCIDA | `Lote27-4` | 44 | JOB-03 |
| Lote con reserva VENCIDA | `Lote28-4` | 45 | JOB-02 |
| Lote sin `mapId` | descripción `[QA] Lote sin mapId` | 46 | MAP-* |
| Lote SIN asociaciones (eliminable) | `Lote1-7` | 47 | LOT-40, LOT-41 |
| Fracciones 4 y 7 | `numero` 4 / 7 | 2 / 3 | LOT-*, MAP-* |
| Inmobiliaria A / B | QA Inmobiliaria A / B | 5 / 6 | aislamiento, ACC-13, INM-09 |
| Reservas de A | `QA-RES-A-{ACTIVA,ACEPTADA,RECHAZADA,EXPIRADA,ELIMINADA}` | 10–14 | RES-* |
| Reservas de B | `QA-RES-B-{…}` | 15–19 | RES-01, RES-27, GEN-12 |
| Reserva ACTIVA vencida | `QA-RES-A-VENCIDA` | 20 | JOB-02 |
| Prioridades ACTIVA CCLF / A / B | `QA-PRI-CCLF` / `QA-PRI-A` / `QA-PRI-B` | 5 / 6 / 7 | PRI-*, PRI-11 |
| Prioridad ACTIVA vencida | `QA-PRI-A-VENCIDA` | 8 | JOB-04 |
| Venta INICIADA de A (sin plan, con co-comprador) | `QA-VEN-A-INICIADA` | 6 | VEN-*, PAG-* (sin plan) |
| Venta CANCELADA / ESCRITURADO de A | `QA-VEN-A-CANCELADA` / `QA-VEN-A-ESCRITURADO` | 7 / 8 | VEN-* |
| Venta CON_BOLETO de A con pagos | `QA-VEN-A-PAGOS` | 9 | PAG-*, VEN-17 |
| Venta CON_BOLETO de B | `QA-VEN-B-BOLETO` | 10 | DOC-11, GEN-12 |
| Plan VIGENTE v2 (anticipo PAGA, cuota PAGO_PARCIAL con recargo, cuota PENDIENTE) | venta 9, versión 2 | 2 | PAG-* |
| Plan REEMPLAZADO v1 | venta 9, versión 1 | 1 | PAG-* |
| Promoción vigente / vencida | lotes 24 / 44 | 2 / 3 | LOT-*, JOB-03 |
| Personas: física, jurídica, cliente de A, cliente de B, propietario, inactiva (de A), inquilino, titular, miembro familiar, co-comprador | DNI `90000001`–`90000009`, CUIT `30900000011` | 21–30 | PER-*, VEN-* |
| Archivos: IMAGEN y PLANO (lote 19), BOLETO de A, IMAGEN, PLANO y BOLETO de B | `qa-*.jpg` / `qa-*.pdf` | 1–6 | DOC-11, DOC-18, DOC-24 |

`npm run seed:qa` imprime esta tabla con los IDs reales de tu base.

**Job de expiraciones (JOB-02..04):** con `.env.qa` cargado, `npm run jobs:expirations` expira la reserva, la promoción y la prioridad vencidas. Para repetir la prueba, volvé a correr `npm run seed:qa`.

## Chequeo automático: `npm run qa:api`

Con la base y el backend QA levantados, desde `Backend/` (igual en bash y en PowerShell):

```bash
# Reiniciar antes el backend QA: el rate limit de login es en memoria y por IP.
npm run qa:api
```

- Ejecuta por HTTP los casos de sesión (ACC-01/02/03/09/12/13/14/15, ACC-05/06, GEN-10), permisos por rol (LOT-04/41, PER-12, RES-14, VEN-17, INM-14, ADM-04/05/07/08/16, DOC-18/24), aislamiento entre inmobiliarias (LOT-03, PER-02/10, RES-01/11/27, PRI-07/11, DOC-11, GEN-12) y errores/transporte (GEN-11/14/15).
- Genera `docs/qa/resultados/api-permisos-<YYYY-MM-DD>.csv` (`ID;Estado;Ambiente;Hallazgo;Evidencia`, UTF-8 con BOM para pegar en Excel) y un `.md` con totales, el detalle de cada subcaso y cada FAIL con prioridad sugerida, pasos y archivo sospechado.
- Restaura todo lo que modifica (inmobiliaria B, cuentas auxiliares, altas temporales) y verifica la restauración al final, aunque falle a mitad de camino. Si la restauración reporta problemas, el comando sale con código 2: corré `npm run seed:qa`.
- Usa Prisma contra la base QA solo para buscar los IDs, verificar que un rechazo no escribió nada y restaurar.
- No imprime tokens ni contraseñas.
- **Al terminar, localhost queda bloqueado para login durante 15 minutos** (ACC-05/06 se ejecutan al final). Reiniciá el backend QA antes de seguir con pruebas manuales.

Elecciones de implementación: `fetch` nativo de Node y `dotenv`/`bcrypt` que ya tiene el backend, sin dependencias nuevas. La carga de `.env.qa` la hace cada script (`seed:qa`, `qa:api`); para la CLI de Prisma y el backend se usa la carga en la terminal (bash o PowerShell) o `node --env-file`.
