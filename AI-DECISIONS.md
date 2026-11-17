# AI Decisions

Registro técnico de usos relevantes de IA en decisiones de ingeniería de La Federala.

La IA asiste. La decisión final corresponde a validación humana; el PR y la revisión la integran formalmente al repositorio. Este archivo no guarda conversaciones completas: solo evidencia auditable de problemas, propuestas, validación humana y decisión adoptada.

Los identificadores son secuenciales (`AI-001`, `AI-002`, …) y no se vinculan a Issues ni Pull Requests.

## Criterio de registro

Registrar cuando la IA intervenga en arquitectura, Cloud, seguridad, diseño técnico, implementación o refactor relevante, debugging no trivial, infraestructura, CI/CD, datos, integración de IA en el producto, o un análisis que derive en una decisión importante.

No registrar correcciones ortográficas, formato Markdown, renombres triviales, autocompletados insignificantes ni explicaciones conceptuales que no terminen en una decisión.

## Entradas

### AI-001 — Estrategia de gobernanza del repositorio

**Fecha:** 2026-09-11  
**Área:** Desarrollo / Git / Gobernanza  
**Herramientas:** ChatGPT + Cursor

ChatGPT intervino en el análisis del problema, la comparación de alternativas y la definición y revisión de la estrategia. Cursor se usó para inspeccionar el repositorio, aplicar los cambios documentales acordados y validar coherencia local.

#### Problema

El repositorio venía con un flujo poco formalizado y ramas personales. Antes de Sprint 0 hacía falta dejar por escrito cómo se trabaja: ramas, `main`, PRs, commits, tablero, CI, documentación y registro de IA, alineado con el TPI Cloud 2026 y sin tocar todavía funcionalidad del producto.

#### Prompt / intención

Se pidió formalizar la gobernanza en documentación: GitHub Flow liviano con `main` como única rama estable, ramas cortas por cambio, PR obligatorio, revisión cruzada, Conventional Commits con scope, Knowledge Base en `docs/`, y un PR template propio de La Federala. Después se corrigió el tablero (GitHub Projects + WIP como requisito del TPI) y se pidió este registro obligatorio, con una primera entrada real sobre el trabajo en curso.

#### Propuesta generada por IA

Estructura de `CONTRIBUTING.md`, `docs/development/git-flow.md` y el PR template; convención de prefijos de rama; Squash & Merge; Issues opcionales; CI en transición (no exigir checks globales mientras el baseline esté en rojo); OpenAPI como contrato pendiente de reconciliación; `experiment/*` temporal; checkpoints futuros por tags sobre `main`. En un primer borrador, Projects/Kanban quedó documentado como no requerido.

#### Validación humana

Durante la validación humana se decidió no usar una rama permanente `develop` ni ramas personales. Al inicio se consideró que GitHub Projects aportaba poco; después se incorporó al comprobar que Projects + límites WIP son requisito explícito del TPI. Se mantuvieron Issues opcionales y sin número obligatorio en el nombre de rama. Se decidió no activar required checks de CI mientras el baseline técnico esté rojo. La documentación generada se revisó antes de proponerla a integración.

#### Decisión adoptada

Durante la validación humana se adoptó GitHub Flow liviano: `main` única rama estable, sin `develop`, ramas cortas, PR obligatorio, revisión cruzada y Squash & Merge. Commits con `tipo(scope): descripción`. GitHub Projects con Kanban Backlog / In Progress / Review / Done y WIP de una tarea principal In Progress por integrante. Issues opcionales. `docs/` es la Knowledge Base. OpenAPI no es contrato oficial hasta reconciliarlo. `experiment/*` es excepcional. Checkpoints futuros por tags sobre `main` validado. `AI-DECISIONS.md` es el registro obligatorio de usos relevantes de IA. La integración formal al repositorio queda a cargo del PR y de la revisión posterior.

> **SUPERSEDED (AI-013):** la OpenAPI (`Backend/documents/documentacionApi.yaml`) se reconcilió con la API real y es el contrato vigente, validado por test contra las rutas montadas.

#### Evidencia / archivos relacionados

- `CONTRIBUTING.md`
- `docs/development/git-flow.md`
- `.github/pull_request_template.md`
- `docs/00-introduccion.md`
- `README.md`
- `docs/architecture/overview.md`
- `.githooks/commit-msg`
- `AI-DECISIONS.md`

### AI-002 — Baseline de testing unitario del backend

**Fecha:** 2026-09-18
**Área:** Testing / Backend
**Herramientas:** Cursor

Cursor asistió en la auditoría, la migración de suites y la consolidación del harness. La decisión de alcance, deuda y siguiente trabajo la tomó validación humana (D1–D8 de la Issue #221).

#### Problema

La suite original del backend estaba mezclada con producción y no era un baseline usable:

- 8 suites, 136 tests, 112 PASS, 24 FAIL;
- tests dentro de `src/`;
- Jest acoplado a `src`;
- mocks Prisma dispersos;
- contratos legacy que no representaban el comportamiento actual.

#### Prompt / intención

Estabilizar testing unitario sin expandir a integration ni CI: separar `src` (producción) de `tests`, cubrir validations/domain/security/services con contratos de negocio, y dejar un harness Prisma mantenible.

#### Propuesta generada por IA

Adoptar Jest + ts-jest con raíz `Backend/tests/`; `tsconfig.json` para app/build y `tsconfig.test.json` para app + tests; factory Prisma por spec (no god-mock); scripts `test:validation`, `test:domain`, `test:service`, `test:unit`; assertions Prisma detalladas solo cuando protegen negocio o seguridad. Supertest/PostgreSQL real queda para una capa futura Integration/API.

#### Validación humana

Se confirmó que el alcance técnico de #221 está completo. Los bugs de producto detectados (incl. inconsistencia de `expireReservas`) van a Issues separados. Usuario y Venta se congelan como suites verdes válidas, sin reescritura. Se aprobó limpieza mínima (Jest `roots` solo en `tests/`). Después de #221 se priorizan P0 y luego Integration/API. No se configura CI todavía.

#### Decisión adoptada

Baseline de testing unitario del backend:

- Jest + ts-jest;
- tests solo en `Backend/tests/` (`validations`, `domain`, `security`, `services`, `support`);
- `src` = producción; `tests` = testing;
- `tsconfig.json` para aplicación/build; `tsconfig.test.json` incluye app + tests (typecheck distinto de Jest roots);
- factory Prisma por spec, mocks explícitos, tests orientados a comportamiento.

Resultado al cerrar #221: 13 suites, 389 tests, 389 PASS, 0 FAIL, typecheck PASS, build PASS, cero tests en `src/`.

Alternativas descartadas: mantener tests en `src`; migrar a Vitest; god-mock Prisma; cobertura porcentual como objetivo; mezclar integration/CI en #221.

Deuda conocida: Usuario/Venta verdes con harness más legacy; no todos los services tienen suite; controllers/routes/jobs e integration DB/API quedan fuera; coverage sin threshold; bugs de producto en Issues separados.

#### Evidencia / archivos relacionados

- `Backend/jest.config.js`
- `Backend/tsconfig.json`
- `Backend/tsconfig.test.json`
- `Backend/package.json`
- `Backend/tests/`
- `AI-DECISIONS.md`

### AI-003 — Aislamiento tenant y ownership en Ventas

**Fecha:** 2026-09-23
**Área:** Seguridad / Backend / Ventas
**Herramientas:** ChatGPT + Cursor

ChatGPT y Cursor intervinieron en la auditoría READ-ONLY del módulo Ventas, el diseño de regressions (RED primero), la implementación fail-closed en service y la auditoría final previa a commit/PR. La decisión de scope, contratos HTTP y deuda fuera de alcance correspondió a validación humana (Issue #232).

#### Problema

El módulo de Ventas tenía dos huecos de seguridad alcanzables por HTTP:

1. `GET /api/ventas/inmobiliaria/:id` permitía a una INMOBILIARIA consultar ventas de otro tenant modificando el ID de la URL (el service filtraba solo por el path, sin comparar con el actor).
2. `eliminarVenta` y `reactivarVenta` omitían ownership cuando una INMOBILIARIA no tenía `inmobiliariaId` (guard `role === INMOBILIARIA && inmobiliariaId != null`), provocando comportamiento fail-open en soft-delete y reactivación.

#### Prompt / intención

Corregir únicamente caminos cross-tenant alcanzables por HTTP; preservar ADMINISTRADOR/GESTOR; no ampliar roles en routes; no modificar lifecycle comercial de Venta; no tocar Pagos; aplicar regression-first (tests RED, luego fix); mantener routes como RBAC general y concentrar actor/tenant/ownership en service.

#### Propuesta generada por IA

- Transportar `req.user` desde el controller hacia `getVentasByInmobiliaria`.
- Agregar helpers privados locales en `venta.service.ts` (`forbidVenta`, `requireVentaActor`, `requireInmobiliariaContext`, `assertVentaOwnership`).
- Exigir actor en boundaries HTTP del service; exigir tenant si el actor es INMOBILIARIA; validar ownership por comparación estricta de `inmobiliariaId`.
- Usar 403 para foreign tenant, missing tenant y missing actor; mantener 404 para recurso inexistente y para listado vacío autorizado (contrato existente).
- No reescribir silenciosamente el `:id` del path; detectar mismatch y rechazar.
- Evitar abstracción multi-tenant compartida prematura con Reservas (helpers locales al dominio Venta).

#### Validación humana

Se limitó el scope a:

- `GET /api/ventas/inmobiliaria/:id`
- `PATCH /api/ventas/:id/eliminar`
- `PATCH /api/ventas/:id/reactivar`

Fuera de scope explícito: `GET /api/ventas`, `GET /api/ventas/:id`, create/update, Pagos, hard delete, lifecycle comercial, CORS, PII, Files, Cloud.

Fase 1: plumbing de actor + regressions RED sin implementar autorización. Fase 2: fix fail-closed. Auditoría final READ-ONLY antes de commit/PR.

#### Decisión adoptada

- Routes mantienen RBAC (sin cambios de roles).
- Controller transporta actor; service concentra actor, tenant y ownership.
- INMOBILIARIA solo opera sobre su tenant; foreign tenant → 403; missing tenant → 403; missing actor → 403.
- Venta Federala (`inmobiliariaId = null`) es ajena a INMO externa (`null !== tenantId`).
- ADMINISTRADOR/GESTOR conservan comportamiento previo (sin filtro tenant adicional en listado ni mutaciones).
- No se creó abstracción compartida entre Reserva y Venta.

#### Resultado

- `venta.service.test.ts` — 35 PASS
- `test:service` — 233 PASS
- `test:unit` — 465 PASS
- Jest global — 465 PASS
- typecheck — PASS
- build — PASS
- `git diff --check` — PASS (auditoría final, working tree local)

#### Evidencia / archivos relacionados

- `Backend/src/controllers/venta.controller.ts`
- `Backend/src/services/venta.service.ts`
- `Backend/tests/unit/services/venta.service.test.ts`
- `AI-DECISIONS.md`

### AI-004 — Política CORS fail-closed y allowlist exacta

**Fecha:** 2026-09-23
**Área:** Seguridad / Backend / Configuración
**Herramientas:** ChatGPT + Cursor

ChatGPT y Cursor intervinieron en la auditoría READ-ONLY de CORS, la extracción testeable de la allowlist, las regressions RED y el endurecimiento fail-closed. Las decisiones de contrato (`FRONTEND_URL` singular, localhost, deny limpio, scope) correspondieron a validación humana.

#### Problema

La política CORS en `app.ts` era fail-open:

- cualquier `Origin` terminaba en `callback(null, true)` (rama `else` permisiva);
- `FRONTEND_URL` era un string y se validaba con `String#indexOf` (matching de substring, no de lista);
- `http://localhost:5173` quedaba autorizado incondicionalmente;
- `credentials: true` estaba activo.

El backend autentica con JWT Bearer en `Authorization` y no usa cookies de sesión, así que no se clasificó como robo automático de sesión. Igual la allowlist estaba incorrectamente abierta y debía cerrarse antes de producción.

#### Prompt / intención

Endurecer CORS sin mezclar auth, frontend ni Cloud: fail-closed, matching exacto, preservar requests sin `Origin` y el DX local, extraer una función pura testeable, trabajar regression-first y evitar un framework de configuración.

#### Propuesta generada por IA

- Extraer `resolveCorsOrigin` pura (sin `process.env` interno).
- `FRONTEND_URL` singular; `trim` solo de la config; igualdad exacta (`===`).
- Localhost `http://localhost:5173` automático solo si `NODE_ENV !== 'production'`.
- Origin desconocido → `false`; `callback(null, false)` como deny limpio (no 500).
- Production sin `FRONTEND_URL`: el proceso arranca; allowlist browser vacía; sin Origin sigue permitido.
- Mantener `credentials: true` en este cambio.
- Dejar multi-origin y la validación global/fail-fast de env para un requisito futuro / #225.
- Tests unitarios de la función; sin capa HTTP Integration/API.

#### Validación humana

1. `FRONTEND_URL` es un origin, no CSV.
2. Sin Origin → permitido (curl, Postman, server-to-server, tooling).
3. Origin desconocido → deny sin `Error`/500.
4. Localhost automático solo fuera de `production`.
5. Production sin `FRONTEND_URL` no impide el boot y no autoriza browsers.
6. Puerto local oficial: `5173`.
7. Sin tests HTTP todavía; se testea la función pura.
8. Auth, frontend y Cloud fuera de scope.

Estrategia: auditoría READ-ONLY → extracción behavior-preserving → regressions RED → implementación GREEN → documentación.

#### Decisión adoptada

Política CORS fail-closed: un origin exacto, sin substring, sin CSV y sin regex. Localhost condicionado por entorno. Requests sin Origin permitidas. `credentials: true` se preserva. Inventario global de env pendiente de #225.

> **Actualización posterior (AI-012):** `credentials: true` se eliminó. La auth es Bearer-only y el API ya no anuncia `Access-Control-Allow-Credentials`. La allowlist de esta decisión no cambió.

#### Resultado

- `cors.origins.test.ts` — 11 PASS
- `test:unit` — 476 PASS
- Jest global — 476 PASS
- typecheck — PASS
- build — PASS
- `git diff --check` — PASS

#### Evidencia / archivos relacionados

- `Backend/src/app.ts`
- `Backend/src/config/cors.origins.ts`
- `Backend/tests/unit/security/cors.origins.test.ts`
- `Backend/.env.example`
- `docs/architecture/backend.md`
- `docs/architecture/overview.md`
- `docs/development/setup-local.md`
- `AI-DECISIONS.md`

### AI-005 — Contrato de arranque productivo del backend

**Fecha:** 2026-09-24
**Área:** Backend / Runtime / Cloud readiness
**Herramientas:** ChatGPT + Cursor

#### Problema

`npm start` ejecutaba `node dist/app.js`, pero `app.ts` solo compone y exporta Express: no llama `listen`. `npm run build` era únicamente `tsc`. Prisma Client se genera en `src/generated/prisma` (output custom); el JS compilado importa `../generated/prisma` desde `dist/` y espera `dist/generated/prisma`. `tsc` no copia el cliente, el runtime ni los binaries. Un checkout limpio con `npm ci && npm run build` no era reproducible sin un `prisma generate` previo en esa máquina.

#### Prompt / intención

Formalizar el contrato `npm ci && npm run build && npm start` como proceso Node compilado: `dist/server.js`, vivo, escuchando `PORT`, con Prisma resoluble y respuesta HTTP, sin `ts-node` / `ts-node-dev`. Docker, health, graceful shutdown, cron split y env/secrets quedaron fuera de este Issue.

#### Propuesta generada por IA

Auditoría READ-ONLY que confirmó el fallo (npm start exit 1, `MODULE_NOT_FOUND`, `dist/server.js` válido una vez copiado el cliente). Alternativas de entrypoint: `dist/server.js` vs `dist/app.js` vs mover `listen` a `app.ts`. Alternativas Prisma: generate+tsc insuficiente; copy a `dist/generated/prisma` (D1) vs migrar imports a `@prisma/client` (D2).

#### Validación humana

Se adoptó entrypoint `dist/server.js` y separación app/server. Se eligió D1 (mantener output custom y copiar el cliente al dist con un script Node cross-platform). No migrar imports a `@prisma/client` en este Issue. Docker, health, cron y env fuera de alcance.

#### Decisión adoptada

- `"start": "node dist/server.js"`
- `"build": "prisma generate && tsc && node scripts/copy-prisma-generated.cjs"`
- Copy con `fs.cpSync` desde `src/generated/prisma` hacia `dist/generated/prisma`
- Sin cambios en `app.ts`, `server.ts`, `schema.prisma`, Dockerfile ni compose

#### Resultado

- `test:unit` / `npm test -- --runInBand`: 16 suites, 476 PASS, 0 FAIL
- typecheck PASS
- build PASS (generate + tsc + copy)
- `npm start` con `ENABLE_CRON=false` y PORT libre: proceso vivo, `Server is running on port …`, sin `MODULE_NOT_FOUND`
- Smoke `GET /api/lotes` sin Authorization: HTTP 401, `Token no proporcionado`
- Clean copy sin `src/generated/prisma`: `npm ci` + `npm run build` PASS; `dist/generated/prisma` presente; `npm start` inicia y el smoke 401 se reproduce

#### Evidencia / archivos relacionados

- `Backend/package.json`
- `Backend/scripts/copy-prisma-generated.cjs`
- `Backend/README.md`
- `docs/architecture/backend.md`
- `docs/architecture/overview.md`
- `docs/development/setup-local.md`
- `AI-DECISIONS.md`

### AI-006 — Health y graceful shutdown del proceso web

**Fecha:** 2026-09-24
**Área:** Backend / Runtime / Operabilidad
**Herramientas:** ChatGPT + Cursor

#### Problema

El proceso productivo de #222 (`node dist/server.js`) arrancaba y escuchaba `PORT`, pero no tenía liveness HTTP, handlers `SIGTERM`/`SIGINT`, ni cleanup explícito. `app.listen` descartaba el `http.Server`. Había dos `PrismaClient` en el web process. El `ScheduledTask` de node-cron se descartaba. `GET /health` respondía 404.

#### Prompt / intención

Implementar liveness (`GET /health`) y graceful shutdown idempotente, unificando Prisma del proceso HTTP sobre el singleton, sin readiness, sin #224/#225 y sin tocar Docker/Cloud.

#### Propuesta generada por IA

Health: solo liveness vs liveness+readiness vs health con dependencias. Prisma: dos clients con cleanup separado vs singleton. Lifecycle: cierre inmediato vs graceful (stop cron → drain HTTP → `$disconnect`). Helper `serverLifecycle.ts` para testear shutdown sin importar `server.ts` (que hace `listen`).

#### Validación humana

- `GET /health`, body `{ "status": "ok" }`, sin dependencias, público, `Cache-Control: no-store`.
- Un único PrismaClient en el web process (`file.service` reutiliza `config/prisma.ts`).
- `SIGTERM`/`SIGINT`, stop cron, drain HTTP, disconnect Prisma, timeout 10 s.
- `process.exitCode = 0` en el camino feliz; `process.exit(1)` en timeout o fallo de disconnect.
- Sin readiness, sin env nuevas, sin cambiar `npm start`.

#### Decisión adoptada

- Ruta directa en `app.ts`.
- Shutdown extraído a `src/serverLifecycle.ts` (Jest no resuelve `server.lifecycle.ts` porque trata `.lifecycle` como extensión).
- Timer de 10 s con `unref()` para no retener el event loop tras un cierre exitoso.
- Tests: Supertest de health (env dummy de Supabase solo en test) y unitarios del lifecycle con mocks.

#### Resultado

- `npm run test:unit`: 18 suites, 486 PASS, 0 FAIL
- `npm test -- --runInBand`: 18 suites, 486 PASS, 0 FAIL
- typecheck PASS
- build PASS (`prisma generate` + `tsc` + copy)
- Smoke `GET /health`: HTTP 200, `{"status":"ok"}`, `Cache-Control: no-store`
- Smoke `GET /ready`: 404
- `process.emit('SIGTERM'|'SIGINT')` sobre el server compilado: logs de shutdown, Prisma disconnect, `exit_code: 0`; con cron, `Scheduler detenido`
- `process.kill(pid, 'SIGTERM')` desde otro proceso en Windows: terminación incondicional sin handlers (`exit 1`); POSIX no verificado en este host

#### Fuera de alcance

Readiness, #224, #225, Docker, Cloud, OpenAPI, ruido del logger en probes.

#### Evidencia / archivos relacionados

- `Backend/src/app.ts`
- `Backend/src/server.ts`
- `Backend/src/serverLifecycle.ts`
- `Backend/src/services/file.service.ts`
- `Backend/tests/unit/app/health.test.ts`
- `Backend/tests/unit/runtime/serverLifecycle.test.ts`
- `Backend/README.md`
- `docs/architecture/backend.md`
- `docs/architecture/overview.md`
- `docs/development/setup-local.md`
- `AI-DECISIONS.md`

### AI-007 — Separación de jobs periódicos del proceso web

**Fecha:** 2026-09-24
**Área:** Backend / Runtime / Jobs / Cloud readiness
**Herramientas:** ChatGPT + Cursor

#### Problema

El proceso web (`node dist/server.js`) importaba `node-cron`, programaba `runExpirations` cada hora (`0 * * * *`) y usaba `ENABLE_CRON` como workaround para no duplicar expiraciones. Cada instancia HTTP podía disparar el mismo trabajo. El runner CLI ya existía (`dist/jobs/runExpirations.js`) pero cerraba con `process.exit` sin `prisma.$disconnect()`.

#### Prompt / intención

Desacoplar el scheduler del proceso web: HTTP solamente; job one-shot compilado; lifecycle Prisma alineado con #223; sin locking, sin Docker, sin GCP y sin #225.

#### Propuesta generada por IA

Auditoría READ-ONLY: `node-cron` solo lo usaba `server.ts`; `runExpirations` ya era independiente de Express y no importaba Supabase; el script `jobs:expirations:prod` ya era el contrato compilado. Alternativas: cron in-process, endpoint HTTP invocado por scheduler, o CLI one-shot. Recomendación: CLI one-shot, eliminar `node-cron` y `ENABLE_CRON`, `$disconnect` + `exitCode` en el runner.

#### Validación humana

- Web HTTP-only: sin `node-cron`, sin `runExpirations`, sin `ENABLE_CRON`.
- Job: `node dist/jobs/runExpirations.js`, una ejecución, Prisma disconnect, `exitCode` 0/1.
- Sin `process.exit(0)` en el camino feliz.
- Sin locking / colas / SELECT FOR UPDATE.
- Cadencia horaria: no se redefine; queda expectativa de infra futura.
- Sin cambios de reglas en `expirePromotions` / `expireReservas` / `reserva.service`.

#### Decisión adoptada

- Web process = HTTP + health + graceful shutdown (#223 simplificado).
- Job process = CLI one-shot sobre el singleton Prisma existente.
- Eliminar dependencies `node-cron` y `@types/node-cron`.
- Eliminar `ENABLE_CRON`.
- Scheduler externo futuro (no implementado aquí); no endpoint HTTP de trigger.

#### Resultado

- `npm run test:unit`: 19 suites, 491 PASS, 0 FAIL
- `npm test -- --runInBand`: 19 suites, 491 PASS, 0 FAIL
- typecheck PASS
- build PASS (`prisma generate` + `tsc` + copy; `dist/jobs/runExpirations.js` presente)
- Smoke web `PORT=3041`: `GET /health` → 200 `{"status":"ok"}`, `Cache-Control: no-store`; sin logs `[CRON]`; proceso vivo
- Smoke shutdown `process.emit('SIGTERM')`: HTTP cerrado, Prisma desconectado, `exit_code: 0`; **no** aparece `Scheduler detenido`
- Smoke job fatal con `DATABASE_URL` dummy `127.0.0.1:1`: artefacto carga, Prisma resoluble, error fatal, proceso termina, `exit_code: 1`
- HAPPY PATH RUNTIME AGAINST DB: NOT VERIFIED (sin DB local/test aislada)

#### Fuera de alcance

#225 (dotenv/env/secrets), Docker, GCP/Cloud Scheduler, locking, reglas de `expirePromotions`.

#### Evidencia / archivos relacionados

- `Backend/src/server.ts`
- `Backend/src/serverLifecycle.ts`
- `Backend/src/jobs/runExpirations.ts`
- `Backend/package.json`
- `Backend/package-lock.json`
- `Backend/tests/unit/runtime/serverLifecycle.test.ts`
- `Backend/tests/unit/jobs/runExpirations.test.ts`
- `Backend/README.md`
- `docs/architecture/backend.md`
- `docs/architecture/overview.md`
- `docs/development/setup-local.md`
- `AI-DECISIONS.md`

### AI-008 — Contrato de configuración y secretos

**Fecha:** 2026-09-25
**Área:** Backend / Config / Runtime / Jobs
**Herramientas:** ChatGPT + Cursor

#### Problema

`process.env` disperso; `dotenv.config()` en `app.ts` después de imports estáticos (Supabase eager en `file.service`); JWT validado tarde; job sin carga consistente de `.env` local; `.env.example` incompleto.

#### Evidencia

Auditoría READ-ONLY #225: inventario de consumidores, orden de imports vs dotenv, contratos web/job/tooling, secretos vs config, tests `health.supabase-env` como parche.

#### Alternativas

- A: `process.env` directo en cada módulo.
- B: módulo único de config.
- C: contratos **WebEnv** + **JobEnv** separados (mínimo privilegio).

#### Validación humana

- Zod (sin nueva dependency).
- Fail-fast web antes de `listen`; fail-fast job antes de queries.
- Supabase required en WebEnv + cliente **lazy**.
- `loadLocalEnv` en entrypoints; `override: false`.
- `DIRECT_URL` solo tooling Prisma; frontend / Docker productivo / GCP fuera de scope.

#### Decisión adoptada

- `src/config/env.ts`, `loadEnv.ts`, `bootstrapWeb.ts`.
- `server.ts` importa bootstrap antes de `app`.
- `runExpirationsCli` valida JobEnv (`DATABASE_URL` únicamente).
- `.env.example` provider-neutral; Postman JWT literal sanitizado.
- Tests `tests/unit/config/env.test.ts`; eliminado `health.supabase-env.ts`.

#### Resultado

- `npm run test:unit`: 20 suites, **506** PASS, 0 FAIL (~4 s)
- `npm test -- --runInBand`: 20 suites, **506** PASS, 0 FAIL (~4 s)
- `npm run typecheck`: PASS
- `npm run build`: PASS (`prisma generate` + `tsc` + copy; requiere `DATABASE_URL`/`DIRECT_URL` en entorno o `.env` local por schema Prisma)
- Smoke web (env fake inyectada, `PORT=3042`): listen OK; `GET /health` → **200** `{"status":"ok"}`; logs sin secretos
- Smoke web inválida (`NODE_ENV=staging`): exit **1**; mensaje `NODE_ENV: Invalid option...`; sin listener
- Smoke job inválida: validación cubierta por tests unitarios; con `Backend/.env` local presente, `loadLocalEnv` puede proveer `DATABASE_URL` (comportamiento esperado en dev)
- Postman collection: JWT literal **sanitizado** (valor vacío + header `{{JWT_TOKEN}}`)

#### Fuera de alcance

GCP Secret Manager, Cloud Run, docker-compose productivo, CI dummy URLs, frontend `VITE_*`, rotación de credenciales históricas.

#### Evidencia / archivos relacionados

- `Backend/src/config/env.ts`
- `Backend/src/config/loadEnv.ts`
- `Backend/src/config/bootstrapWeb.ts`
- `Backend/src/server.ts`
- `Backend/src/app.ts`
- `Backend/src/services/file.service.ts`
- `Backend/src/jobs/runExpirations.ts`
- `Backend/.env.example`
- `Backend/tests/unit/config/env.test.ts`
- `Backend/tests/unit/app/health.test.ts`
- `Backend/README.md`
- `docs/architecture/backend.md`
- `docs/development/setup-local.md`
- `AI-DECISIONS.md`

### AI-009 — Contrato de validación de path params e IDs HTTP

**Fecha:** 2026-10-18
**Área:** Backend / Validación / Contratos HTTP
**Herramientas:** ChatGPT + Claude + Grok

#### Problema

`validateParams()` validaba y transformaba con Zod pero descartaba el output. Los controllers volvían a interpretar `req.params` mediante `parseInt`, `Number` o nuevos parses, pudiendo validar un ID y operar sobre otro. Ejemplo reproducido: `DELETE /api/lotes/1e2`; Zod validaba `100`, mientras `parseInt("1e2")` producía `1`. También coexistían varias políticas de IDs.

#### Prompt / intención

Auditar todas las rutas con `validateParams`, definir una política única de IDs HTTP y diseñar una migración gradual compatible con Express 5 sin modificar directamente `req.params` ni mezclar todavía queries.

#### Propuesta generada por IA

- Decimal positivo canónico dentro de int4.
- `positiveIntString` como política única.
- `req.validated.params` para conservar el output de Zod.
- Accessor tipado `validatedParams(req, schema)`.
- Comprobación de identidad del schema.
- Migración de las 62 rutas activas con `validateParams`.
- Eliminación de las conversiones redundantes posteriores.
- `validateQuery` fuera de scope.

#### Validación humana

- Se decidió separar params y queries en dos PRs.
- Se aceptó deliberadamente rechazar formatos como `007`, `+5`, `1e2` y `0x10`.
- Se decidió no mutar `req.params`.
- Claude implementó el cambio.
- Grok realizó una revisión READ-ONLY independiente/adversarial.
- La revisión confirmó 62/62 rutas sin discrepancias y ningún blocker funcional.

#### Decisión adoptada

- IDs de las rutas con `validateParams`: decimal positivo canónico, `1..2147483647`.
- Output de Zod en `req.validated.params`.
- Los controllers consumen `validatedParams`.
- `req.params` permanece raw.
- Los aliases de schemas comparten objetos comunes.
- `remap` eliminado.
- Queries quedan para un PR separado.

#### Resultado

- 62 rutas activas migradas; 61 handlers distintos.
- 35 suites, **1684** tests PASS.
- typecheck PASS.
- build PASS.
- `git diff --check` PASS.
- Revisión independiente: `READY WITH MINOR NOTES`, sin bloqueantes.

#### Evidencia / archivos relacionados

- `Backend/src/middlewares/validation.middleware.ts`
- `Backend/src/validations/params.validation.ts`
- Controllers migrados
- `Backend/tests/unit/middlewares/validation.middleware.test.ts`
- `Backend/tests/unit/routes/params.contract.routes.test.ts`
- `Backend/tests/unit/validations/params.validation.test.ts`
- `docs/architecture/backend.md`
- `AI-DECISIONS.md`

### AI-010 — Contrato de validación de query params

**Fecha:** 2026-10-28
**Área:** Backend / Validación / Contratos HTTP
**Herramientas:** ChatGPT + Claude + Grok

#### Problema

`validateQuery()` validaba con Zod pero intentaba conservar el resultado mutando `req.query` (`delete` + `Object.assign`). En Express 5 `req.query` es un getter que re-parsea la URL en cada acceso, así que la mutación no persistía (medido: el objeto devuelto cambia de identidad en cada lectura). Cada controller reinterpretaba la query cruda a su manera: DTO manual, casts, `Number(...)`, `=== 'true'` o pasar `req.query` entero al service.

Consecuencias reproducidas sobre la app real con los services mockeados:

- `GET /api/lotes` pasaba `req.query` crudo al service: los IDs llegaban como string y las claves que el schema no declaraba viajaban sin validar.
- `deudor` es leído por el service pero no estaba declarado en `queryLoteSchema`: `deudor=true` y `deudor=false` funcionaban solo por accidente, y `yes`, `1`, `0`, `""`, `TRUE` o repetido respondían `200` con todos los lotes, sin filtrar.
- Los IDs de query usaban `z.coerce.number()`: `1e2`, `007`, `0x10` y ` 12` se aceptaban, y `2147483648` (fuera de int4) pasaba Zod y llegaba al service.
- `GET /api/files/lote/:id` leía `includeDeleted` sin schema: `yes`, `1` o `TRUE` respondían `200` con `includeDeleted=false` en silencio.

#### Prompt / intención

Auditar todos los usos de `validateQuery` (9 endpoints), el flujo schema → controller → service y el consumo del frontend; luego extender a query la infraestructura de AI-009 (`req.validated`) para que la query validada sea la que usa el controller y la que se envía al service según el DTO permitido, sin tocar services ni expandir el alcance.

#### Propuesta generada por IA

- Reutilizar `validateSource` / `readValidated` con `'query'`: `req.validated.query` y `validatedQuery(req, schema)`, sin mutar `req.query` y sin un sistema paralelo.
- Declarar `deudor` en `queryLoteSchema` y entregar el resultado validado completo a `getAllLotes` (el service ya acepta boolean).
- Helper `booleanQuery` estricto (`"true"` / `"false"` en minúscula → boolean) en lugar de `z.coerce.boolean()` (que convierte `"false"` en `true`).
- IDs de query con `positiveIntString`, la misma política que los IDs de path.
- Mantener el DTO explícito en reservas, ventas y prioridades: sus schemas aceptan filtros que el service no usa y no deben llegar a él.
- Agregar `validateQuery` a `GET /files/lote/:id`.
- Guard estático que falla si algún controller vuelve a leer `req.query`.
- Prototipo del diseño y sondas de comportamiento fuera del repo antes de implementar.

#### Validación humana

- Las decisiones se cerraron antes de implementar: IDs de query con `positiveIntString` (actualizando solo los fixtures históricos que pasaban numbers a schemas de query), `booleanQuery` estricto, `validateQuery` en files/lote, migrar `filtrarPorEstado` sin eliminarla ni reordenar rutas, y dejar fuera los 17 filtros que los schemas aceptan y los services no usan.
- Se acotó el alcance: sin cambios en services, RBAC, frontend, CORS, Auth ni Prisma.
- ChatGPT participó en el análisis del scope y en las decisiones técnicas.
- Claude realizó la auditoría, la implementación y los tests de regresión.
- Grok realizó una revisión READ-ONLY independiente/adversarial.
- La revisión dio `READY WITH MINOR NOTES`, sin blockers funcionales; confirmó las 10 rutas y consideró correcto el endurecimiento de los IDs legacy.
- La decisión final de integración corresponde a validación humana.

#### Decisión adoptada

- `validateQuery(schema)` conserva el output de Zod en `req.validated.query`; los controllers lo leen con `validatedQuery(req, schema)` y el mismo schema que la ruta (si la ruta no validó query, o usó otro schema, lanza). `req.query` permanece crudo.
- Claves desconocidas: se descartan en silencio (sin `.strict()`, porque el frontend manda parámetros que el backend no declara). Query repetida: `400`.
- Booleanos de query: `booleanQuery`, solo `"true"` / `"false"` (`deudor`, `includeInactive`, `includeDeleted`).
- IDs de query que representan PKs reales, y campos históricos con semántica de identificador que siguen declarados en los schemas aunque sean filtros legacy no implementados (`vendedorId`): `positiveIntString` (`1..2147483647`, canónico); `1e2`, `007`, `0x10`, `+5`, `" 12"` y `2147483648` responden `400`. Los decimales de query (superficie, monto, seña) y los IDs de body no cambian.
- `deudor` se declara con `booleanQuery.optional()`. Antes: valores no booleanos respondían `200` sin filtro; ahora responden `400`.
- `GET /files/lote/:id` valida `includeDeleted` con `filesByLoteQuerySchema`.
- `GET /reservas/filtrarPorEstado` sigue inalcanzable (`/:id` la captura antes); solo su lectura de query migró a `validatedQuery`. Su eliminación queda para el saneamiento legacy.
- Ningún controller lee `req.query`; lo garantiza `tests/unit/architecture/controllers.query.guard.test.ts`.
- Deuda explícita (documentada en `docs/architecture/backend.md`): 17 filtros aceptados por los schemas y no usados por los services, `deudor` sin restricción por rol (`TECNICO`), `personas.limit` sin tope, y schemas sin uso (`queryInmobiliariaSchema`, `queryUsuarioSchema`).

#### Resultado

- RED previo a implementar: 95 tests fallaban en la corrida focalizada (middleware, rutas de lotes, listados, files, schemas y guard); p. ej. `deudor=true` llegaba al service como `"true"` y el guard señalaba exactamente los 7 controllers que leían `req.query`.
- 10 rutas con `validateQuery` (9 previas + files/lote) y 10 lecturas con `validatedQuery`; 7 controllers migrados.
- 39 suites, **1885** tests PASS.
- typecheck PASS.
- build PASS.
- `git diff --check` PASS.
- Revisión independiente: `READY WITH MINOR NOTES`, sin bloqueantes.

#### Evidencia / archivos relacionados

- `Backend/src/middlewares/validation.middleware.ts`
- `Backend/src/validations/query.validation.ts`
- `Backend/src/validations/lote.validation.ts`, `reserva.validation.ts`, `venta.validation.ts`, `prioridad.validation.ts`, `persona.validation.ts`, `filemeta.validation.ts`
- `Backend/src/routes/files.routes.ts`
- Controllers migrados (lote, reserva, venta, prioridad, inmobiliaria, persona, file)
- `Backend/tests/unit/middlewares/validation.middleware.test.ts`
- `Backend/tests/unit/routes/lotes.query.routes.test.ts`, `listado.query.routes.test.ts`, `files.params.routes.test.ts`, `personas.contracts.routes.test.ts`
- `Backend/tests/unit/validations/query.validation.test.ts`, `lote.validation.test.ts`, `reserva.validation.test.ts`, `venta.validation.test.ts`
- `Backend/tests/unit/controllers/reserva.filtrarPorEstado.controller.test.ts`
- `Backend/tests/unit/architecture/controllers.query.guard.test.ts`
- `docs/architecture/backend.md`
- `AI-DECISIONS.md`

### AI-011 — Consolidación de contratos HTTP y deuda legacy

**Fecha:** 2026-11-02
**Área:** Backend / Validación / Contratos HTTP
**Herramientas:** ChatGPT + Astra + Claude

#### Problema

Después de #252, #254 y #256 todavía quedaban excepciones legacy en el contrato HTTP del backend:

- Rutas muertas: `GET /reservas/filtrarPorEstado` era inalcanzable (`/:id` la capturaba antes) y `PUT /files/:id` no validaba nada y leía `req.params` en el controller.
- Params sin validar: `GET /personas/cuil/:cuil` era la última ruta con path params sin `validateParams`.
- Coerciones peligrosas de body: `z.coerce.number()` convertía `null`, `""`, `false` y `[]` en `0`, `true` en `1` y `"1e2"` o `"0x10"` en números; el multipart usaba `Number()` y `parseInt()` sobre strings ambiguos. Además, valores mayores a int4 en columnas `Int` terminaban en `500` de Prisma.
- Filtros declarados y no implementados: 17 filtros de query (lotes, reservas, ventas) que los schemas validaban y ningún service usaba.
- Updates vacíos: un `PUT` con `{}` o solo claves desconocidas pasaba la validación en la mayoría de los recursos.
- Schemas y código HTTP muerto: `user.validation.ts`, `queryUsuarioSchema`, `queryInmobiliariaSchema`, `fileMetadataSchema`, `identificadorSchema`, `updateFileController` y `getReservaByEstado`.
- Fracciones rota de punta a punta: `numero` se validaba como string pero Prisma lo define como `Int @unique`; el `PUT` escribía además un `updatedAt` que el modelo no tiene.
- Errores HTTP concretos incorrectos: una fracción inexistente respondía `500` y un número duplicado `400`; un campo multipart inesperado respondía `500`; restaurar o sustituir un archivo inexistente respondía `400` por detección de texto en el mensaje; los catches locales de Promociones devolvían `500` para `P2002` y `P2025` y exponían mensajes internos.

#### Prompt / intención

Cerrar el saneamiento de contratos HTTP en un solo Issue ejecutado por bloques con checkpoint humano entre cada uno: eliminar lo muerto en lugar de convertirlo en features, unificar la política de IDs y números de body, exigir al menos un campo en los updates parciales, reparar Fracciones y corregir los status concretos de Files y Promociones. Sin tocar RBAC, Auth, CORS, tenant ni el diseño global de errores.

#### Propuesta generada por IA

- Una auditoría global READ-ONLY inicial (Astra) y una implementación en cuatro bloques regression-first (Claude): primero el test que demuestra el bug (RED), después el cambio.
- `body.validation.ts` como política compartida del body JSON (`idDelBody`, `enteroPositivoDelBody`, `numeroDelBody`, `INT4_MAX`) y `tieneAlgunCampo` / `ACTUALIZAR_SIN_CAMPOS` para los updates.
- Eliminar los 17 filtros no implementados, los schemas HTTP muertos y las dos rutas legacy.
- Guards estáticos para que ninguna ruta con `:param` quede sin `validateParams` y ningún controller lea `req.params`.
- Una rama acotada de `MulterError` en el middleware de errores y `statusCode` explícito en `file.service` y `fraccion.service`.

#### Validación humana

- El alcance de cada bloque se definió antes de implementar y se aprobó bloque por bloque (1 a 4); los hallazgos intermedios (`precio: null`, `capacidad` entero, topes int4) se resolvieron con decisiones explícitas antes de cerrar el Bloque 2.
- Se decidió eliminar los filtros legacy en lugar de implementarlos, mantener el CUIL como string normalizado, normalizar `comxventa: null` a `0` de forma explícita y dejar fuera de este Issue todo lo que no fuera contrato HTTP.
- ChatGPT participó en la definición del alcance, la arquitectura y los checkpoints; Astra realizó la auditoría global READ-ONLY inicial; Claude realizó la implementación regression-first y las verificaciones.
- La revisión adversarial independiente queda como validación posterior, antes del PR.
- La decisión final de integración corresponde a validación humana.

#### Decisión adoptada

- **Rutas eliminadas:** `GET /reservas/filtrarPorEstado` y `PUT /files/:id` (con su controller, service y tipos).
- **Params:** toda ruta con `:param` usa `validateParams()` y su controller lee `validatedParams()`. El CUIL tiene su propio schema (`cuilParamsSchema`): sigue siendo `string`, sin guiones, puntos ni espacios, de 11 dígitos.
- **Body:** política compartida para IDs y números. Los IDs son number o string decimal canónico, entero positivo int4, con output `number`; los números generales aceptan solo notación decimal explícita y cada schema conserva su dominio. Los valores persistidos en columnas `Int` tienen tope int4 (`capacidad`, `numPartido`, número de lote, número de calle, cuotas, `maxPrioridadesActivas`, `Fraccion.numero`).
- **`comxventa`:** `null` pasa a `0` de forma explícita en el schema (antes ocurría por accidente con `z.coerce`).
- **Multipart:** `idLoteAsociado` y `ventaId` se validan como strings canónicos con `positiveIntString` antes del controller; el controller ya no usa `Number()` ni `parseInt()`.
- **Updates parciales:** `PUT` sigue siendo un update parcial, pero un body sin ningún campo válido (`{}` o solo claves desconocidas) responde `400`. No se usa `.strict()`: las claves desconocidas siguen descartándose.
- **Query:** se eliminan los 17 filtros no implementados en lugar de convertirlos en features. Los contratos reales quedan: `GET /lotes` (`estado`, `subestado`, `tipo`, `ocupacion`, `propietarioId`, `ubicacionId`, `deudor`), `GET /reservas` y `GET /ventas` (`estado`, `estadoOperativo`, `loteId`) y `GET /ventas/inmobiliaria/:id` (`estadoOperativo`, con schema propio).
- **Schemas muertos:** se eliminan `user.validation.ts`, `queryUsuarioSchema`, `queryInmobiliariaSchema`, `fileMetadataSchema` e `identificadorSchema`.
- **Fracciones:** `numero` es un entero positivo int4 con output `number`; ya no se escribe `updatedAt`; inexistente responde `404` y duplicado `409`.
- **Files y Multer:** un `MulterError` causado por input inválido responde `400` (`LIMIT_FILE_SIZE` conserva su contrato y los errores internos siguen en `500`). `restore` y `sustituir` de un archivo inexistente responden `404` con `statusCode` explícito desde el service, no por texto del mensaje.
- **Promociones:** `aplicar` y `quitar` delegan en el middleware de errores con `next(error)`. Ese middleware identifica `P2002` (`409`), `P2003` (`409`) y `P2025` (`404`) con `instanceof Prisma.PrismaClientKnownRequestError` del cliente generado en `src/generated/prisma`. Un error inesperado sigue en `500` genérico, sin el mensaje interno. La clase homónima de `@prisma/client/runtime/library` no es la que produce el runtime y no se usa para esta detección.
- **Fuera de alcance (PRs posteriores):** RBAC, `TECNICO`/deudor, CORS (#236), Auth/JWT/password, error handler global, 404 JSON global, tenant hardening, `take:10` / paginación, nullable general y Cloud.

#### Resultado

- RED previo a implementar, con causa registrada por bloque; por ejemplo, el Bloque 3 tuvo 2 suites y 48 tests fallando y el Bloque 4 tuvo 3 suites y 34 tests fallando (Fracciones, Files y Promociones).
- 50 suites, **2658** tests PASS; 0 omitidos, 0 enfocados, sin snapshots.
- typecheck PASS.
- build PASS.
- `git diff --check` PASS.
- Índice de Git vacío al cerrar la ejecución.

#### Evidencia / archivos relacionados

- `Backend/src/validations/body.validation.ts`, `params.validation.ts`, `fraccion.validation.ts`, `filemeta.validation.ts`, `lote.validation.ts`, `venta.validation.ts`, `reserva.validation.ts`, `inmobiliaria.validation.ts`, `persona.validation.ts`
- `Backend/src/routes/files.routes.ts`, `reserva.routes.ts`, `persona.routes.ts`, `ventas.routes.ts`
- `Backend/src/controllers/file.controller.ts`, `fraccion.controller.ts`, `promocion.controller.ts`, `persona.controller.ts`
- `Backend/src/services/fraccion.service.ts`, `file.service.ts`
- `Backend/src/middlewares/error.middleware.ts`
- `Backend/tests/unit/validations/body.validation.test.ts`
- `Backend/tests/unit/routes/body.empty.routes.test.ts`, `body.numbers.routes.test.ts`, `legacy.filters.routes.test.ts`, `reservas.legacy.routes.test.ts`, `fracciones.contracts.routes.test.ts`, `files.errors.routes.test.ts`, `promociones.errors.routes.test.ts`
- `Backend/tests/unit/architecture/routes.params.guard.test.ts`, `controllers.params.guard.test.ts`, `controllers.query.guard.test.ts`
- `Backend/documents/documentacionApi.yaml`
- `docs/architecture/backend.md`
- `AI-DECISIONS.md`

### AI-012 — Endurecimiento de autorización, aislamiento y configuración de seguridad

**Fecha:** 2026-11-07
**Área:** Seguridad / Backend / Frontend
**Herramientas:** ChatGPT + Claude + Grok

#### Problema

Una auditoría de seguridad posterior a #258 encontró superficies de autorización y configuración sin cerrar:

- **RBAC:** un `GESTOR` podía crear o promover usuarios `ADMINISTRADOR`, modificar administradores y eliminar usuarios; `INMOBILIARIA` podía eliminar y reactivar ventas; `TECNICO` podía filtrar lotes por `deudor` aunque el campo `deuda` se le oculta.
- **Tenant de Prioridades:** un usuario `INMOBILIARIA` sin `inmobiliariaId` caía en algunos casos en el camino de staff (por ejemplo, el listado sin filtro de tenant). Cancelar y finalizar validaban el estado antes que el ownership, y el status revelaba el estado de prioridades ajenas (oracle).
- **Identidad:** `authenticate` armaba `req.user` con los claims del JWT. Un usuario eliminado seguía entrando hasta el vencimiento del token, y un cambio de rol o de inmobiliaria no regía hasta un nuevo login.
- **Login:** sin rate limiting; con un email inexistente el login respondía sin hacer el trabajo de bcrypt (diferencia de tiempo trivial).
- **Files:** `TECNICO` podía leer, firmar URLs, subir y sustituir boletos, escrituras y otros documentos de venta, y el endpoint de aprobaciones le revelaba el tipo de un archivo con solo conocer su id. Los 500 de Files serializaban el objeto de error o el mensaje interno.
- **CORS:** `credentials: true` en el backend y `credentials: "include"` en el frontend, sin ninguna cookie que lo justificara.

#### Prompt / intención

Cerrar esas superficies en un único Issue ejecutado por bloques con checkpoint humano entre cada uno (1: RBAC/tenant, 2: identidad/login, 3: Files, 4: CORS Bearer-only, 5: documentación y auditoría final), regression-first (RED antes de cada cambio) y sin rediseñar Auth, sin migrar a cookies, sin cambiar la password policy y sin tocar el error handler global.

#### Propuesta generada por IA

- Releer la identidad desde la DB en cada request autenticado (`findAuthIdentity`, sin leer la password) y usar los claims solo para identificar al usuario.
- Comparar contra un hash bcrypt dummy cuando el email no existe.
- `express-rate-limit` solo en `POST /api/auth/login`, con keyGenerator explícito y sin cambiar el `trust proxy` global de Express.
- Reglas de privilegio de usuarios en el service (`assertPuedeAsignarRol`, `assertPuedeModificarUsuario`) y `authorize` más estricto en las rutas.
- Un helper de tenant para Prioridades (`requireTenantSiInmobiliaria`) aplicado en todas las operaciones, con el ownership antes que el estado.
- Fortalecer el helper central de Files (`canUserAccessArchivo`) con una lista blanca por tipo para `TECNICO`, en lugar de checks dispersos por controller.
- Un saneamiento local de errores en Files (`sendFileError`) en lugar de migrar al middleware global.

#### Validación humana

- El alcance de cada bloque se definió antes de implementar y se aprobó bloque por bloque.
- Para la IP del cliente en Render se evaluó la entrada izquierda de `X-Forwarded-For`, que es falsificable porque Cloudflare agrega entradas. Se eligió `CF-Connecting-IP` bajo `RENDER=true`.
- Se decidió que `OTRO` es documento de venta (lo exige el código: `ventaId` obligatorio y path `venta-{id}`) y se le deniega a `TECNICO`.
- Se mantuvo la convención `404` de Files para ocultar la existencia de archivos; el upload de un tipo no permitido responde `403`.
- ChatGPT participó en la definición del alcance, las decisiones funcionales y los checkpoints. Claude realizó la implementación regression-first y las verificaciones. Grok hizo la revisión adversarial del Bloque 1 y detectó el oracle de estado en cancelar/finalizar Prioridades, que se corrigió antes de cerrar ese bloque. Los Bloques 2 a 4 no tuvieron revisión adversarial independiente; queda como validación posterior, antes del PR.
- La decisión final de integración corresponde a validación humana.

#### Decisión adoptada

- **Identidad vigente:** el JWT prueba identidad; rol e inmobiliaria salen de la DB en cada request. `sub` inválido o usuario inexistente → `401`; un error de DB → `500`. Un cambio de rol o de tenant rige en el siguiente request.
- **Bearer-only:** token en `localStorage`, header `Authorization: Bearer`. Se eliminan `credentials: true` del CORS y los 8 `credentials: "include"` del frontend. No hay cookies ni protección CSRF basada en cookies. El código legacy de refresh del frontend (`/auth/refresh`, inexistente en el backend) queda pendiente de limpieza. **SUPERSEDED (AI-013):** el código de refresh y `/auth/me` del frontend se eliminó; un `401` limpia la sesión y redirige a `/login`.
- **Rate limiting de login:** 15 minutos, 10 intentos fallidos, `skipSuccessfulRequests`, `429` con `TOO_MANY_REQUESTS`, headers estándar `draft-8`. Store en memoria por proceso (válido con una instancia).
- **Client IP en Render:** `RENDER=true` → `CF-Connecting-IP` validado como IP única; si no, `req.ip` → `socket.remoteAddress` → key constante. `X-Forwarded-For` no se usa como key. Revalidar al migrar a Cloud Run.
- **Login timing:** bcrypt contra un hash dummy del mismo costo cuando el email no existe.
- **Escalada de GESTOR:** no puede asignar `ADMINISTRADOR`, no puede modificar administradores (`403`) y no puede eliminar usuarios (`DELETE /usuarios/:id` solo `ADMINISTRADOR`).
- **Ventas:** eliminar y reactivar son solo de `ADMINISTRADOR`/`GESTOR`. Reservas: `INMOBILIARIA` sigue operando sobre las propias.
- **TECNICO:** sin filtro `deudor` (`400`).
- **Tenant de Prioridades:** `INMOBILIARIA` sin `inmobiliariaId` → `403` en toda operación; ownership antes que estado.
- **Files fail-closed por tipo:** `TECNICO` accede solo a `PLANO` e `IMAGEN`; `BOLETO`, `ESCRITURA`, `OTRO` y cualquier tipo desconocido quedan denegados en listados, detalle, signed URL, upload, sustituir y aprobaciones. Los errores inesperados de Files responden `500` genérico sin serializar el error.
- **CORS sin credentials:** la allowlist de AI-004 no cambia. CORS se documenta como política del navegador, no como autorización del recurso.
- **Dependencia nueva:** `express-rate-limit` 8.7.3 (fuera del rango vulnerable 8.0.0–8.2.1); única dependencia productiva agregada.
- **Fuera de alcance (PR final pre-Cloud):** error handler global y 404 JSON, mappers Prisma, password policy, refresh/cookies, código frontend muerto, Dockerfile del backend, OpenAPI de auth/files/prioridades, paginación, nullable y Cloud. **SUPERSEDED (AI-013):** el error handler global, el 404 JSON, los mappers Prisma, el refresh del frontend, el Dockerfile productivo y la OpenAPI completa se resolvieron en AI-013. Siguen fuera: password policy, paginación, nullable y Cloud.

#### Resultado

- RED previo a implementar, con causa registrada por bloque; por ejemplo: rate limiting de login 8 tests HTTP fallando; Bloque 3 38 tests fallando (autorización por tipo de `TECNICO` y exposición de errores); Bloque 4 5 tests fallando (`Access-Control-Allow-Credentials: true`).
- 61 suites, **2933** tests PASS; 0 omitidos, 0 enfocados.
- typecheck PASS.
- build backend PASS.
- build frontend PASS.
- `git diff --check` PASS.
- Índice de Git vacío al cerrar la ejecución.

#### Evidencia / archivos relacionados

- `Backend/src/middlewares/auth.middleware.ts`, `loginRateLimit.middleware.ts`
- `Backend/src/services/authIdentity.service.ts`, `auth.service.ts`, `usuario.service.ts`, `prioridad.service.ts`, `lote.service.ts`, `file.service.ts`
- `Backend/src/controllers/usuario.controller.ts`, `file.controller.ts`
- `Backend/src/routes/auth.routes.ts`, `usuario.routes.ts`, `ventas.routes.ts`
- `Backend/src/utils/file.auth.utils.ts`
- `Backend/src/app.ts`
- `Backend/package.json`, `Backend/package-lock.json`
- `Backend/tests/support/http.ts`
- `Backend/tests/unit/security/auth.identity.test.ts`, `auth.test-registry.test.ts`, `login.dummy-hash.test.ts`, `login.rate-limit.test.ts`, `login.rate-limit.key.test.ts`, `usuarios.privilegios.authz.test.ts`, `lifecycle.inmobiliaria.authz.test.ts`, `lotes.deudor.authz.test.ts`, `prioridades.tenant.authz.test.ts`, `files.tipo.authz.test.ts`, `files.error-exposure.test.ts`, `file.auth.utils.test.ts`, `cors.origins.test.ts`
- `frontend/src/lib/http/http.js`, `lib/auth/api.js`, `lib/api/archivos.js`, `lib/api/ventas.js`, `lib/auth/rbac.ui.js`, `components/FilterBar/FilterBarLotes.jsx`, `components/FilterBar/utils/chips.js`, `components/Cards/Lotes/LoteVerCard.jsx`
- `Backend/documents/documentacionApi.yaml`
- `docs/architecture/backend.md`
- `AI-DECISIONS.md`

### AI-013 — Final Hardening pre-Cloud: contrato de errores, lifecycle, runtime y freeze de API

**Fecha:** 2026-11-13
**Área:** Backend / Frontend / API / Runtime
**Herramientas:** ChatGPT + Claude

#### Problema

Después de AI-012 quedaban abiertas, antes del checkpoint Cloud:

- **Errores:** catches locales (Persona, Fracción, Ubicación) respondían `500` con `error.message`; errores de dominio de Reservas sin status terminaban en `500`; el middleware global devolvía `err.message` también en los 5xx; los mappers de Prisma usaban la clase de `@prisma/client/runtime/library`, que no reconoce los errores del cliente generado; sin 404 JSON global ni límite explícito de body.
- **Lifecycle:** una inmobiliaria dada de baja seguía pudiendo loguearse y recibir operaciones nuevas; las prioridades vencidas no expiraban solas; aliases y hard deletes incoherentes en el contrato público.
- **Runtime:** sin imagen productiva (`npm run dev` en Docker), validación de env sin reglas para `JWT_SECRET`/`JWT_EXPIRES_IN`, logs de requests con query string y Prisma volcando mensajes crudos.
- **API:** la OpenAPI no estaba reconciliada con las rutas reales.
- **Correctness:** cancelar/finalizar una prioridad podían competir con su expiración; `DELETE /lotes` podía borrar a medias; el borrado definitivo de personas no contaba a los co-compradores.

#### Prompt / intención

Un único PR por bloques con checkpoint humano entre cada uno (0: RED; 1: errores y Prisma; 2: lifecycle, contratos muertos y listados; 3: runtime productivo y configuración; 4: freeze de API/OpenAPI; 5: correctness final, documentación e higiene), regression-first y sin iniciar Cloud. Las decisiones funcionales las tomó el equipo antes de implementar; la IA no eligió alternativas de negocio.

#### Propuesta generada por IA

- Contrato de error único en el middleware global y migración de los catches locales a `next(error)`.
- Mappers Prisma con la clase del cliente generado.
- Reglas D1 en un helper (`assertInmobiliariaAsignable`) y en la identidad (`findAuthIdentity`, login).
- Job de prioridades reutilizando la operación del endpoint manual.
- Dockerfile multi-stage y validación de env con la propia librería JWT.
- Guard de inventario OpenAPI vs rutas montadas, con seguridad y roles.
- Escritura condicionada (`WHERE estado = ACTIVA`) para las transiciones de prioridades.

#### Validación humana

- D1–D6 y "Ubicaciones B" se decidieron antes de implementar; cada bloque se aprobó por separado.
- Durante el Block 5 apareció una decisión nueva (cascada de `DELETE /lotes`, que borraba ventas, reservas y metadata de archivos). Se reportó sin elegirla; producto decidió hard delete solo de lotes sin asociaciones y `409` en el resto, sin baja lógica.
- La auditoría adversarial final reportó F1–F6. Producto definió el modelo familiar plano (F4). F1 no se reprodujo como fallo de build (`prisma generate` 6.18 no exige las URLs; sí `validate`/`migrate`); igual se blindó el stage `build`. Para F3 se evaluó cambiar la FK de `_VentaCompradores` a RESTRICT: se descartó con evidencia, porque `prisma migrate diff` la revierte a CASCADE (tabla implícita de Prisma). Queda pendiente repetir la auditoría adversarial.
- La decisión final de integración corresponde a validación humana.

#### Decisión adoptada

Decisiones del Final Hardening (vigentes; reemplazan lo marcado como SUPERSEDED en AI-001 y AI-012):

- **D1 — Inmobiliaria `ELIMINADO`:** no puede loguearse (`401` genérico) ni operar con un JWT previo, no participa en operaciones nuevas (`409` al asociarla) y no aparece en los listados operativos por defecto. Persiste para el historial y recupera el acceso al reactivarse.
- **D2 — Aliases y hard deletes:** se eliminan `DELETE /ventas/:id` y `DELETE /reservas/:id` (aliases de la baja lógica) y `DELETE /inmobiliarias/:id` (hard delete incompatible con D1). Se conservan los hard deletes con capacidad real del dominio: fracciones (guard de lotes), usuarios (única revocación), personas (guard de asociaciones, incluidos co-compradores), purge de archivos (ADMIN) y lotes (solo sin historia ni asociaciones: con ventas, reservas, ofertas, prioridades, promociones, alquileres o archivos responde `409` sin borrar nada).
- **D3 — Expiración de prioridades:** el job de expiraciones expira las prioridades vencidas con todo su lifecycle, incluida la restauración del lote. Cancelar, finalizar y expirar escriben condicionadas a que la prioridad siga `ACTIVA`: la transición que pierde una carrera no pisa el estado ni restaura el lote dos veces.
- **D4 — Contrato de errores:** `{ success: false, code, message, errors? }`, migración compatible. `error` de auth se mantiene como campo deprecated porque el frontend todavía lo lee.
- **D5 — Listados:** Usuarios y Ubicaciones sin `take: 10`; Personas sin truncar cuando no llega `limit`; Fracciones conserva su tope (dominio: máximo 8).
- **D6 — Decimal:** no se normaliza en este PR; la OpenAPI documenta string vs number. DTO de Decimal post-Cloud.
- **Ubicaciones B:** Ubicaciones es de solo lectura en el API; se eliminan `POST`, `PUT` y `DELETE /ubicaciones`. Las ubicaciones se crean y modifican dentro del lifecycle de Lote.
- **Runtime:** producción = `npm ci` → `npm run build` → `node dist/server.js` (imagen multi-stage, stage `runtime`); el job usa la misma imagen con `node dist/jobs/runExpirations.js`. `docker-compose.yml` es desarrollo (stage `deps`, `npm run dev`).
- **Configuración:** `JWT_SECRET` ≥ 32 caracteres en `production`; `JWT_EXPIRES_IN` con unidad; `FRONTEND_URL` requerido en `production`.
- **Freeze de API:** 78 operaciones `/api` + `GET /health`; la OpenAPI es el contrato y un test la compara con las rutas reales.
- **Deprecations, Cloud checkpoint y backlog post-Cloud:** registrados en `docs/architecture/freeze-pre-cloud.md`.
- **`npm audit`:** las 4 advertencias high del backend (cadena de Prisma CLI) se aceptan antes de Cloud porque su remediación requiere la migración mayor a Prisma 7.

Correcciones de la auditoría adversarial final:

- **F1 — Build Docker reproducible sin `.env`:** el stage `build` corre `prisma generate` con `DATABASE_URL`/`DIRECT_URL` dummy solo en ese comando; no son secretos y no quedan en `ENV`/`ARG` ni en la imagen final.
- **F2 — Una prioridad ACTIVA por lote:** índice único parcial `Prioridad_loteId_activa_key` (migración nueva, con precondición de datos explícita); el alta inserta y después marca el lote con un UPDATE condicionado; el cierre restaura con un único UPDATE condicionado a `CON_PRIORIDAD`. Venta y reserva finalizan la prioridad activa con escritura condicionada.
- **F3 — Borrado de persona vs co-compra concurrente:** `SELECT … FOR UPDATE` de la persona, conteo y DELETE en una transacción, compartida con el borrado de miembros familiares.
- **F4 — Grupo familiar plano:** un titular y N miembros directos; un miembro no puede ser titular, un titular con miembros no puede pasar a ser miembro, nadie es su propio jefe; borrar un titular con miembros → `409`. `PUT /personas` no modifica el jefe.
- **F5 — Detalle técnico:** el error de Supabase al purgar se loguea con `safeErrorForLog`; `CONFLICT_FK` ya no expone `field` (nombre interno de la constraint, sin consumidores).
- **F6 — Jest:** `--forceExit` no es necesario (`npx jest` termina solo y `--detectOpenHandles` no reporta handles); queda como nota un aviso intermitente de salida forzada de un worker, sin handles persistentes.

#### Resultado

- RED previo en el Block 0 para errores, 404, Reservas y Prisma; RED previo a cada corrección de los bloques siguientes.
- Correctness del Block 5 con tests deterministas (sin sleeps): carreras de prioridades (expire contra cancel y finalize en ambos órdenes, doble ejecución, sin doble restauración), `DELETE /lotes` (409 por cada asociación bloqueante, sin borrados parciales, carrera chequeo/DELETE resuelta por la FK) y guard de co-compradores en personas.
- Backend: 79 suites, **3119** tests PASS; 0 omitidos, 0 enfocados.
- Guard OpenAPI: 79 rutas reales = 79 operaciones documentadas; 0 faltantes, 0 obsoletas.
- typecheck PASS; build backend PASS; build frontend PASS; `git diff --check` PASS.
- `npm audit --omit=dev`: frontend 0; backend 4 high (cadena de Prisma CLI, requiere Prisma 7).
- Índice de Git vacío al cerrar la ejecución; sin commits ni push.

#### Evidencia / archivos relacionados

- `Backend/src/middlewares/error.middleware.ts`, `auth.middleware.ts`, `logger.middleware.ts`, `validation.middleware.ts`
- `Backend/src/utils/safeErrorLog.ts`, `inmobiliaria.utils.ts`
- `Backend/src/services/prioridad.service.ts`, `lote.service.ts`, `persona.service.ts`, `auth.service.ts`, `authIdentity.service.ts`
- `Backend/src/jobs/expirePrioridades.ts`, `runExpirations.ts`
- `Backend/src/config/env.ts`, `prisma.ts`
- `Backend/Dockerfile`, `docker-compose.yml`
- `Backend/documents/documentacionApi.yaml`, `Backend/tests/unit/openapi/openapi.contract.test.ts`
- `Backend/tests/unit/services/prioridad.transiciones.test.ts`, `persona.delete.test.ts`, `listados.d5.test.ts`, `lote.service.test.ts`
- `Backend/tests/unit/routes/d2.rutas-eliminadas.routes.test.ts`, `inmobiliaria-eliminada.asignacion.routes.test.ts`
- `frontend/src/lib/http/http.js`, `lib/auth/api.js`, `lib/auth/token.js`
- `docs/architecture/backend.md`, `docs/architecture/freeze-pre-cloud.md`

## Plantilla para entradas nuevas

Copiar el bloque siguiente y completar. No inventar decisiones sin evidencia.

```markdown
### AI-XXX — Título breve

**Fecha:** YYYY-MM-DD
**Área:**
**Herramientas:**

#### Problema

#### Prompt / intención

#### Propuesta generada por IA

#### Validación humana

#### Decisión adoptada

#### Evidencia / archivos relacionados
```
