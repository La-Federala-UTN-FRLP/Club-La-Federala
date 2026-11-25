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

### AI-014 — Entorno QA local y verificación automática de permisos

**Fecha:** 2026-11-21
**Área:** QA / Testing / Seguridad
**Herramientas:** Claude Code

#### Problema

La Guía de QA funcional 2026 (341 casos) requería un ambiente para ejecutar casos destructivos y de permisos. El único `Backend/.env` disponible apunta a la base Supabase remota y compartida con el equipo, que no debe usarse para QA. Los seeds existentes no alcanzaban para los casos de la guía: faltaban cuentas por rol y una segunda inmobiliaria, reservas por estado y por tenant, pagos, archivos y datos vencidos para el job. Además, `seed:lrv` no es idempotente. Los casos de permisos, aislamiento y sesión se verificaban a mano.

#### Prompt / intención

Montar un entorno QA local y descartable (PostgreSQL 16 en Docker, migraciones, datos de prueba) sin tocar la base compartida ni el código congelado (`src/`, schema, migraciones, seeds existentes). Automatizar por HTTP los casos de permisos, aislamiento multi-tenant y sesión, con resultados por ID de caso para la planilla de QA, restaurando los datos modificados y sin registrar secretos.

#### Propuesta generada por IA

- Contenedor `federala-qa-db` (`postgres:16`, `127.0.0.1:5433`, volumen propio) sin modificar `docker-compose.yml`; `Backend/.env.qa` con secretos aleatorios y `Backend/.env.qa.example` sin secretos.
- `seed.qa.ts` idempotente por claves naturales, con guard que aborta si `DATABASE_URL` no es local, y modo `--base` que corre los seeds existentes después del guard (`seed:lrv` solo si falta la Fracción 3).
- `api-permisos.qa.ts`: `fetch` nativo, Prisma solo para IDs, verificación de no escritura y restauración; rate limit al final; CSV `ID;Estado;Ambiente;Hallazgo;Evidencia` y reporte Markdown.
- Storage desactivado (valores dummy de `SUPABASE_*`) para no escribir en el bucket compartido, cuyas rutas `lote-{id}` coinciden con los IDs locales.

#### Validación humana

- Se revisaron los resultados contra la Guía de QA funcional 2026: se corrigió el mapeo de ADM-07, ADM-16, GEN-10 y GEN-11 (la IA no tenía la guía) y se confirmaron ADM-05 y ACC-03.
- LOT-03: la IA lo dejaba sujeto a confirmación de producto; se reclasificó como FAIL P0 porque la guía lo define como Base E y expone datos personales y de otra inmobiliaria.
- Se validó desactivar Storage en QA para no pisar archivos del bucket compartido.
- Verificación manual en el navegador contra el entorno QA: el frontend apunta al backend QA (:3001); datos sembrados visibles; ACC-02, ACC-07 y ACC-10 coinciden con lo esperado; aislamiento de reservas A/B confirmado en pantalla; LOT-03 reproducido inspeccionando la respuesta de la API como Inmobiliaria A.
- Se revisó que la evidencia no contenga tokens ni contraseñas y que `Backend/.env.qa` no se versione.
- Se decidió separar el trabajo en 3 PRs para revisión independiente.

#### Decisión adoptada

Se adopta el entorno QA local descartable (`seed:qa`) y el chequeo automático (`qa:api`) como base para CCLF-28 y CCLF-29. LOT-03 se registra como bug P0 abierto, a corregir en un PR separado coordinado con el equipo.

#### Resultado

- 69 migraciones aplicadas; índice `Prioridad_loteId_activa_key` verificado.
- `seed:qa` corrido dos veces con conteos idénticos: 7 cuentas QA, 2 inmobiliarias, 10 personas, 29 lotes, 11 reservas, 4 prioridades, 5 ventas, 2 planes con 3 cuotas, 6 archivos (metadata). El job de expiraciones expiró 1 reserva, 1 promoción y 1 prioridad sembradas.
- `qa:api`: 38 casos, 106 subcasos; 37 PASS, 1 FAIL, 0 BLOCKED. FAIL P0 en LOT-03 (Base E): `GET /api/lotes` como INMOBILIARIA incluye lotes NO_DISPONIBLE, `deuda`, documentos de propietario e inquilino y la prioridad de otra inmobiliaria; `GET /api/lotes/:id` de un lote NO_DISPONIBLE responde 200. Restauración verificada.
- Backend: typecheck PASS; 82 suites, 3145 tests PASS; `git diff --check` PASS.

#### Evidencia / archivos relacionados

- `Backend/.env.qa.example`
- `Backend/package.json`
- `Backend/prisma/seeds/seed.qa.ts`
- `Backend/scripts/qa/api-permisos.qa.ts`
- `docs/qa/preparacion-entorno-qa.md`
- `docs/qa/resultados/api-permisos-2026-11-21.csv`, `docs/qa/resultados/api-permisos-2026-11-21.md`
- `AI-DECISIONS.md`


### AI-015 — Ejecutor independiente de migraciones Prisma en Cloud Run

**Fecha:** 2026-11-21  
**Área:** Cloud / Docker / PostgreSQL / Migraciones / Seguridad  
**Herramientas:** ChatGPT + Docker Desktop + Prisma CLI + Git Bash

#### Problema

La imagen productiva del backend excluye las dependencias de desarrollo, incluida Prisma CLI. El despliegue de staging requiere ejecutar las migraciones SQL mediante un proceso independiente de Express, sin exponer herramientas de administración del esquema en el runtime web.

#### Prompt / intención

Auditar la construcción Docker, las dependencias Prisma y el historial de migraciones. Preparar un ejecutor independiente compatible con Cloud Run Jobs, sin modificar la infraestructura de G1 ni conectarse a bases de datos reales durante las pruebas.

#### Propuesta generada por IA

Agregar una etapa `migrate` al Dockerfile reutilizando `deps`, con `USER node` y el comando `prisma migrate deploy`.

Mantener la etapa `runtime` separada, con sus dependencias de producción y el comando `node dist/server.js`.

#### Validación humana

Se ejecutaron y verificaron:

- Build de la etapa `deps` y Prisma CLI 6.18.0.
- Presencia del esquema Prisma y archivos SQL.
- Inspección del índice único parcial de prioridades activas por lote.
- Build de la etapa `migrate` y ejecución de Prisma como usuario `node`.
- Reconstrucción de `runtime`, conservando su usuario y comando.
- Smoke test HTTP del backend productivo con `/health`.
- `git diff --check` sin errores.

La auditoría de dependencias identificó vulnerabilidades pendientes. Se decidió no actualizar Prisma a una versión mayor dentro de este cambio.

#### Decisión adoptada

- Incorporar la etapa `migrate` sin modificar el runtime web.
- Ejecutar migraciones mediante Cloud Run Job independiente.
- Utilizar identidad y credenciales SQL específicas, Secret Manager y conectividad privada.
- No ejecutar migraciones ni seeds automáticamente durante el arranque de la API.
- Mantener Prisma 6.18.0.
- Posponer la ejecución real hasta disponer de PostgreSQL descartable y de la infraestructura G1.

#### Evidencia / archivos relacionados

- `Backend/Dockerfile`
- `Backend/package.json`
- `Backend/prisma/schema.prisma`
- `Backend/prisma/migrations/`
- Jira CCLF-18
- Validaciones locales Docker G2.4 y G2.5


### AI-016 — Router `/api/reportes` con permisos y validación de query

**Fecha:** 2026-11-22  
**Área:** Backend / API / Autorización / Validación / OpenAPI  
**Herramientas:** Claude Code (VS Code)

#### Problema

El módulo Reportes + IA (CCLF-38) necesitaba un punto de partida común antes de implementar cada reporte: rutas montadas, acceso restringido a staff, validación de filtros y contrato de respuesta fijo, para que las subtareas 38.2 a 38.5 completen la lógica sin rehacer rutas, permisos ni OpenAPI.

#### Prompt / intención

Implementar la subtarea 38.1 (CCLF-52) siguiendo las convenciones de los routers existentes: router `/api/reportes` con `authenticate` + `authorize(ADMINISTRADOR, GESTOR)`, 6 operaciones GET (inventario, ventas y cuotas vencidas, cada una en JSON y `.xlsx`), schemas Zod de query, controladores con la forma final del contrato y datos vacíos, servicios vacíos, `.xlsx` con 501, y tests de permisos y validación (REP-A3). Sin cálculos, sin frontend, sin `POST /api/reportes/resumen`, sin commits ni PR.

#### Propuesta generada por IA

- Aplicar los permisos en cada ruta con un arreglo compartido (`soloStaff`) en lugar de `router.use`: el guard de arquitectura prohíbe `router.use` en los archivos de rutas, y el test de paridad de OpenAPI lee `authenticate` y `x-roles` de la cadena de cada ruta.
- Validar `estado` y `subestado` con los enums de Prisma (`EstadoLote`, `SubestadoLote`), `moneda` con `Moneda` y `fraccion` como id con la política común (`positiveIntString`).
- Fechas `desde`/`hasta` en formato YYYY-MM-DD; rango máximo de 366 días contando ambos extremos; `periodoAnterior` como tramo de igual duración que termina el día anterior a `desde`.
- `corte` calculado como el día actual en America/Argentina/Buenos_Aires.
- Responder el 501 de las `.xlsx` desde el controller con `errorCodeForStatus(501)` (`INTERNAL_ERROR`), porque el proyecto no tiene `NOT_IMPLEMENTED` y `handleError` reemplaza el mensaje de todo status >= 500.
- Documentar las 6 operaciones mínimas en la OpenAPI y actualizar el conteo del freeze de 78 a 84 operaciones.

#### Validación humana

- El alcance, las restricciones y la forma del contrato de cada reporte los fijó la persona responsable de la tarea antes de la implementación (incluido el uso de los enums de Prisma y el criterio para el 501).
- Se revisó el código generado y se ajustó el comentario de `reportes.routes.ts`.
- Se ejecutaron `npm run typecheck` y `npx jest`: 83 suites y 3227 tests en verde. La línea base previa (82 suites, 3145 tests) también estaba verde.
- Para correr la suite en Windows se usó `PRISMA_QUERY_ENGINE_LIBRARY` apuntando al engine de Windows de `node_modules`, porque el cliente Prisma generado localmente solo trae engines de Linux. No se modificó código ni archivos versionados por ese motivo.
- La revisión cruzada queda a cargo del PR.

#### Decisión adoptada

- Router `/api/reportes` solo para ADMINISTRADOR y GESTOR, con permisos declarados en cada ruta.
- Contrato de respuesta fijado con datos vacíos; la lógica queda para 38.2 (inventario), 38.3 (ventas) y 38.4 (cuotas vencidas).
- Exportación `.xlsx` con 501 `INTERNAL_ERROR` y mensaje "Exportación pendiente (CCLF-56)" hasta 38.5. Un código propio `NOT_IMPLEMENTED` queda como posible mejora, sin adoptar.
- Ejemplos completos de la OpenAPI y `AI_UNAVAILABLE` quedan para 38.7 (CCLF-58).
- `POST /api/reportes/resumen` queda fuera de alcance (40.3).

#### Evidencia / archivos relacionados

- `Backend/src/routes/reportes.routes.ts`
- `Backend/src/controllers/reporte.controller.ts`
- `Backend/src/services/reporte.service.ts`
- `Backend/src/validations/reporte.validation.ts`
- `Backend/src/app.ts`
- `Backend/tests/unit/routes/reportes.permisos.routes.test.ts`
- `Backend/tests/unit/openapi/openapi.contract.test.ts`
- `Backend/documents/documentacionApi.yaml`
- `Backend/README.md`
- Jira CCLF-52
- `AI-DECISIONS.md`


### AI-017 — Reporte de inventario de lotes

**Fecha:** 2026-11-22  
**Área:** Backend / Reportes / Prisma / Tests  
**Herramientas:** Claude Code (VS Code)

#### Problema

`GET /api/reportes/inventario` respondía la forma del contrato con datos vacíos desde 38.1 (AI-016). Faltaba calcular la foto actual del inventario de lotes en venta (totales por estado, fracción y subestado, ofrecibles y filas), con los filtros ya validados, y tipar el contrato que hasta entonces usaba `unknown[]`. Además, el ejemplo de CCLF-37 no coincidía en todo con el schema de Prisma.

#### Prompt / intención

Implementar la subtarea 38.2 (CCLF-53) solo para el inventario: universo `LOTE_VENTA` sin lotes dados de baja, foto al momento de la consulta, filtros `fraccion`, `estado` y `subestado` aplicados por igual a totales y filas, ofrecible = `DISPONIBLE` o `EN_PROMOCION`, precio como string con 2 decimales o `null`, totales con `groupBy` y filas con un único `findMany` (sin N+1), orden fijo de filas y totales, e interfaces tipadas según el ejemplo de CCLF-37. Tests REP-A4 con conteo manual sobre un set controlado y un test de contrato HTTP con datos. Sin tocar ventas, cuotas vencidas, `.xlsx`, rutas, permisos ni frontend; sin commits ni PR.

#### Propuesta generada por IA

- Usar un solo `groupBy` por `[fraccionId, estado]` para obtener `porEstado`, `porFraccion` (cantidad y ofrecibles) y el total de ofrecibles; un `groupBy` por `subestado`; y un `findMany` que trae el número de fracción por relación. Las 3 consultas corren en paralelo con `Promise.all`, sin transacción.
- `Lote` no tiene baja lógica (`deleteLote` borra el registro), pero el enum `EstadoLote` conserva `ELIMINADO` y `OPERATIVO` de una migración anterior. Se excluye `ELIMINADO` del universo por precaución; `OPERATIVO` no se excluye y aparece en `porEstado` si existe.
- Ajustar el contrato al schema: `numero` como `number | null` (`Lote.numero` es `Int?`) en lugar del texto "F2-045"; `fraccion` como número de fracción y `fraccionId` agregado; `subestado` no nulo; `precio` sin moneda porque `Lote` no tiene ese campo.
- Mantener `enlace` como `/?lote=<id>` según CCLF-37, aunque el frontend todavía no maneja ese parámetro (existen `/?editLotId=<id>` y `/map?mapId=`).
- Ordenar filas por número de fracción, número de lote (sin número al final) e id; `porEstado` y `porSubestado` en el orden del enum; `porFraccion` por número de fracción.
- Testear con un fake del delegate `lote` que evalúa el `where`, el `groupBy` y el `orderBy` del service sobre un set fijo y falla ante cualquier forma de consulta no prevista, en vez de devolver resultados armados a mano.

#### Validación humana

- El alcance, las reglas del reporte y el formato del contrato los fijó la persona responsable de la tarea antes de la implementación.
- Se revisaron el código y las diferencias con CCLF-37 antes de aceptarlas.
- Se ejecutaron `npm run typecheck` y `npx jest`: 85 suites y 3250 tests en verde, con `PRISMA_QUERY_ENGINE_LIBRARY` apuntando al engine de Windows (igual que en AI-016, sin modificar archivos).
- Se corrió `npm run test:integration` contra una base PostgreSQL descartable: 2 suites y 18 tests en verde. Esas suites no cubren el inventario; la consulta contra PostgreSQL se valida con prueba manual del endpoint.
- La revisión cruzada queda a cargo del PR.

#### Decisión adoptada

- Inventario calculado en la base con 2 `groupBy` y 1 `findMany`, sin consultas por fila.
- Lotes en estado `ELIMINADO` fuera del inventario; `OPERATIVO` se informa tal cual.
- Contrato tipado (`InventarioPorEstado`, `InventarioPorFraccion`, `InventarioPorSubestado`, `InventarioFila`, `ReporteInventario`) con `numero: number | null`, `fraccionId` y `fraccion` numéricos, y `precio: string | null` sin moneda.
- Se acepta que totales y filas puedan diferir en un lote si hay una escritura concurrente, porque las consultas no corren en una transacción.
- Quedan pendientes: que el frontend maneje `/?lote=<id>` (39.2) o cambiar el enlace; un test de integración del inventario; los ejemplos completos de la OpenAPI (38.7, CCLF-58).

#### Evidencia / archivos relacionados

- `Backend/src/services/reporte.service.ts`
- `Backend/src/controllers/reporte.controller.ts`
- `Backend/tests/support/fakes/loteInventario.fake.ts`
- `Backend/tests/unit/services/reporte.inventario.service.test.ts`
- `Backend/tests/unit/routes/reportes.inventario.routes.test.ts`
- `Backend/tests/unit/routes/reportes.permisos.routes.test.ts`
- Jira CCLF-53
- `AI-DECISIONS.md`


### AI-018 — Pantalla base de Reportes (frontend) con cliente HTTP y datos simulados

**Fecha:** 2026-11-22
**Área:** Frontend / Reportes / RBAC / Cliente HTTP
**Herramientas:** Claude (claude.ai) para planificar las etapas y redactar los prompts;
Claude Code para ejecutar el código.

#### Problema

El módulo Reportes del frontend era un placeholder (`Reportes.jsx`, 58 líneas, con filtros y botones que solo
mostraban un toast). La subtarea 39.1 (CCLF-39) necesitaba la estructura de navegación (pestañas
Comercial / Cobranzas y selector de reporte), un cliente HTTP y el control de acceso correcto antes de
construir cada reporte (39.2 a 39.5). El backend (`/api/reportes`, AI-016) respondía solo el esqueleto
con datos vacíos, así que el frontend tenía que avanzar contra datos simulados que respetaran el contrato.
Además, el rol TECNICO veía el módulo en el menú aunque el backend ya le responde 403.

#### Prompt / intención

Trabajo en cinco etapas, cada una con aprobación humana y sin commits de la IA:

1. Exploración de solo lectura del frontend (rutas, RBAC, cliente HTTP, FilterBar, tablas, estados de
   pantalla, navegación a entidades) y del contrato del backend, con un informe de riesgos y preguntas.
2. Sacar `REPORTS_ACCESS` del rol TECNICO en `rbac.js`, sin tocar nada más.
3. Cliente `lib/api/reportes.js` con tres funciones (inventario, ventas, cuotas vencidas) según el contrato
   de CCLF-37, más un mock en archivo aparte detrás de `VITE_REPORTES_MOCK`.
4. Reemplazar el placeholder por pestañas y selector, con el reporte activo en `?reporte=`, y probar el
   circuito pantalla → cliente → mock.
5. Verificación final y esta entrada.

#### Propuesta generada por IA

- Informe de la etapa 1 (Claude Code): relevó el estado actual y recomendó no reutilizar `TablaBase`
  (columna de checkbox y de acciones fijas, sin estados de carga ni de error, paginado del lado cliente) ni
  `FilterBar` (el control de fechas trabaja con epoch-ms y es frágil para fechas de calendario de Buenos
  Aires; los campos obligatorios `desde`/`hasta`/`moneda` no encajan con un filtro pensado para ser
  opcional y limpiable). El mismo informe señaló que la forma de las filas no estaba definida **en lo que
  el código mostraba** (el service tipa `filas` como `unknown[]` y la OpenAPI como `object`).
- Etapa 2 (Claude Code): quitar `REPORTS_ACCESS` de TECNICO (una línea).
- Etapa 3 (Claude Code): adaptador con el patrón de `lib/api/pagos.js` (`http()`, lanza `Error` con
  `statusCode` y `response` si `!res.ok`, devuelve el `data` interno); mock con datos coherentes, filtros que
  recalculan totales, validaciones que devuelven el mismo 400 `VALIDATION_ERROR` del backend, retardo de
  400 ms y los casos borde pedidos. El mock se carga con `import()` dinámico solo si
  `VITE_REPORTES_MOCK === "true"`, y por defecto se usa la API real.
- Etapa 4 (Claude Code): `Tabs`/`Tab` de react-bootstrap controlado por `?reporte=`, la pestaña derivada del
  reporte, carga sin filtros (30 días y `moneda: "USD"` como valores por defecto) y conteo de filas.

#### Validación humana

- **Fila del inventario:** el informe de la etapa 1 (Claude Code) la marcó como no definida, a partir de lo
  que veía en el código. La persona, con acceso a la especificación CCLF-37 (un PDF que Claude Code no
  tiene), corrigió que sí estaba definida (`{ loteId, numero, fraccion, estado, subestado, precio, enlace }`,
  con `precio` como string decimal) y la dio para el mock. Esa era la forma del ejemplo de la V2 de CCLF-37;
  el contrato tipado de 38.2 agregó `fraccionId` y fijó `numero` como entero o null (ver el punto de la
  revisión cruzada).
- **TablaBase y FilterBar:** la persona aprobó el informe de la etapa 1 y, con él, la recomendación de no
  reutilizarlos para los reportes. Ninguno de los dos se construyó todavía (queda para 39.2 a 39.4).
- **Filas de `ventas` y `cuotas-vencidas`:** CCLF-37 solo define la forma de la fila de inventario. La
  persona propuso una forma propia para las otras dos filas (apoyada en el schema de Prisma y en las rutas
  reales de navegación del frontend) y se la indicó a Claude Code en el prompt de la etapa 3 sin distinguir
  con claridad qué parte venía del contrato y cuál era una propuesta a confirmar. Queda marcado como
  pendiente de validar con Agostina antes de que el backend implemente esas filas (38.3 y 38.4).
- **`/map`:** la IA (Claude Code, etapa 1) señaló que `rbac.ui.js` (línea 33) acopla `/map` a
  `REPORTS_ACCESS`. La persona decidió no tocarlo en esta tarea y dejarlo para otro ticket.
- **Pestañas:** Claude Code implementó primero las pestañas con el aspecto de las del Header (usando
  `tokens.css`), porque no había un patrón de pestañas reutilizable. La persona pidió luego cambiarlas a
  forma de píldora según el boceto de Agostina, usando solo tokens existentes (fondo
  `--color-header-bg` y texto claro en la activa, transparente y texto oscuro en la inactiva). Es un patrón
  acotado a esta pantalla; no se tocó el Header ni se unificó con el resto de la app.
- **Bug propio, autocorregido:** en la etapa 4, Claude Code vio en una captura que los colores de las
  pestañas salían invertidos. La causa: en `main.jsx`, `App` (y con él, `Reportes.css`) se importa antes que
  el CSS de Bootstrap, así que con la misma especificidad Bootstrap ganaba. Lo corrigió subiendo la
  especificidad (`.nav-tabs.reportes-tabs`) antes de reportar la etapa.
- **Defecto detectado en la verificación final, ya corregido:** al cambiar de pestaña, durante la transición
  de `Tabs` quedaban montados dos paneles por 100 a 200 ms; el panel viejo recibía el `reporte` nuevo, lo
  que producía un parpadeo del selector y una llamada duplicada. Se corrigió con `transition={false}`.
- **Comentario de `rbac.js`:** Claude Code agregó en la etapa 2 un comentario explicativo más largo
  (`// Cuenta (sin Reportes: el backend solo lo permite a ADMINISTRADOR y GESTOR)`). La persona pidió
  acortarlo a `// Cuenta`, siguiendo la convención breve del resto del archivo.
- **Revisión cruzada del PR:** Agostina detectó que la fila del mock de inventario no coincidía con el
  contrato real de 38.2: `numero` era un string compuesto en vez de entero o null, faltaba `fraccionId`, y
  `fraccion` se usaba a la vez como id y como número visible (en el mock no se notaba porque valían lo
  mismo). Se corrigió el mock con ids de fracción distintos del número visible (11, 12, 13), `porFraccion`
  con `fraccionId` y `ofrecibles`, filtro por `fraccionId` en los tres reportes, orden de filas de inventario
  igual al del backend, y `loteNumero` + `fraccion` en ventas y cuotas vencidas.
- **Lint:** `npm run lint` falla en el repositorio por deuda previa (114 errores y 50 warnings en 68
  archivos). Se verificó contra un export limpio de `HEAD` que el total es idéntico y que ninguno de los
  archivos de la tarea tiene problemas.
- **Pruebas:** el frontend no tiene infraestructura de tests. Se verificó a mano con el dev server y el mock
  activo (Chrome headless con la sesión simulada), y los totales del mock se contrastaron con sus filas con
  un script en Node que no se versionó. La ruta contra la API real y el build de producción no se
  verificaron.

#### Decisión adoptada

- `REPORTS_ACCESS` queda solo en ADMINISTRADOR y GESTOR, alineado con el backend. TECNICO no ve el ítem del
  menú y la URL directa a `/reportes` lo manda a `/403` (verificado en navegador).
- Cliente `lib/api/reportes.js`: tres funciones, los parámetros opcionales vacíos no se envían, los errores
  llegan a la UI como `Error` con `statusCode` y `response`. El default es la API real: el mock solo se
  activa con `VITE_REPORTES_MOCK=true` (documentada en `.env.example`) y se borra en la tarea 39.6 junto con
  su import dinámico.
- Pantalla `Reportes.jsx` con pestañas Comercial / Cobranzas, un único query param `?reporte=` (la pestaña
  se deriva de él; default `inventario`) y selector de reporte en Comercial. Por ahora solo muestra la
  cantidad de filas: el render de cada reporte, los filtros y los estados de carga y error con reintentar
  quedan para 39.2 a 39.5.
- Pestañas en forma de píldora, solo con tokens de `tokens.css`, acotadas a esta pantalla.
- **Pendientes que requieren corrección humana futura (de Agostina):**
  - La forma de las filas de `ventas` y `cuotas-vencidas` que usa el mock es una propuesta propia que falta
    confirmar contra lo que implemente el backend en 38.3 y 38.4.
  - El `enlace` del inventario (`/?lote=<id>`) no lo entiende el Dashboard del frontend: hoy solo abre un
    lote por `location.state` (`openLoteId`). Se va a resolver en 39.2.
  - Decisiones de forma del mock sin contrato, solo en ventas y cuotas vencidas: el orden de las filas es
    propio y, en cuotas vencidas, `tramos` trae siempre los tres tramos. En inventario, el orden y los buckets
    de `totales` (solo cantidades mayores a cero) ya coinciden con el backend (#338).
  - El mock no tiene lotes en estado `ELIMINADO`, así que no reproduce esa exclusión del backend.
  - Las ventas no tienen moneda en el schema (`otrasMonedas` queda siempre vacío); las cuotas sí, por plan.

#### Evidencia / archivos relacionados

- `frontend/src/lib/auth/rbac.js`
- `frontend/src/lib/api/reportes.js`
- `frontend/src/lib/api/reportes.mock.js`
- `frontend/src/pages/Reportes.jsx`
- `frontend/src/pages/Reportes.css`
- `frontend/.env.example`
- `Backend/documents/documentacionApi.yaml` (contrato de `/reportes`)
- Jira CCLF-39 (39.1), CCLF-37 (especificación) y CCLF-52 (backend, AI-016)

### AI-019 — Visibilidad de lotes para INMOBILIARIA (LOT-03)

**Fecha:** 2026-11-22
**Área:** Seguridad / Backend / Lotes
**Herramientas:** Claude Code

#### Problema

El chequeo automático de QA (AI-014, caso LOT-03, Base E, P0) mostró que la API de lotes le entregaba a INMOBILIARIA datos que la UI le oculta:

- `GET /api/lotes` incluía los lotes `NO_DISPONIBLE`, el campo `deuda`, `identificadorTipo`/`identificadorValor` del propietario y del inquilino, y la prioridad de otra inmobiliaria con su nombre;
- `GET /api/lotes/:id` de un lote `NO_DISPONIBLE` respondía 200.

La regla existía solo en el frontend (`frontend/src/lib/auth/rbac.js` y `rbac.ui.js`); `lote.service.ts` solo filtraba para TECNICO.

#### Prompt / intención

Corregir el bug en el backend, que es la barrera real, sin refactors (freeze pre-Cloud): aplicar a INMOBILIARIA reglas de visibilidad en todas las lecturas de lotes que puede hacer, reutilizando el patrón de TECNICO (`restrictedLoteFields`), sin cambiar rutas, roles ni el comportamiento de ADMINISTRADOR, GESTOR y TECNICO, y trabajando regression-first.

#### Propuesta generada por IA

- Revisión previa de los otros caminos de lectura de lotes: `/api/reportes` es solo staff; reservas, prioridades y personas embeben datos mínimos del lote (id, número, `mapId`, estado, precio) y acotados al tenant. No se encontraron otras filtraciones.
- `buildWhereFromQueryDTO`: para INMOBILIARIA, `NOT { estado: NO_DISPONIBLE }` en la consulta (también con `?estado`) y el filtro `deudor` rechazado con 400, igual que TECNICO.
- Helper local `stripFieldsForInmobiliaria`, junto a `stripFieldsForTecnico`: reutiliza `restrictedLoteFields` (deuda, ventas, reservas), quita los documentos de propietario e inquilino (también en `alquilerActivo` y `alquileres[]`) conservando nombre y razón social, y deja las prioridades ajenas o del Club solo con `id`.
- `getLoteById`: un lote `NO_DISPONIBLE` responde 404 con el mismo body que uno inexistente.
- `getPromocionActiva`: para INMOBILIARIA, un lote `NO_DISPONIBLE` responde `data: null`, porque esa ruta responde `200 null` para un lote inexistente; un 404 revelaría que el lote existe.
- El controller pasa `req.user.inmobiliariaId` al service (patrón de AI-003) para distinguir la prioridad propia.
- Tests nuevos escritos antes del fix (RED verificado localmente) y commits por tipo de cambio: fix, tests, OpenAPI y este registro.

#### Validación humana

- Se revisó que los 21 tests nuevos fallen con el código de `main` (11 RED por el motivo esperado) y pasen con el fix (21/21), y que ADMINISTRADOR, GESTOR y TECNICO no cambien (8 tests de control). `npm run typecheck` PASS y `npm test`: 86 suites, 3271 tests PASS, verificados localmente.
- Se verificó en el entorno QA local con `npm run qa:api`: LOT-03 pasa de FAIL a PASS (`GET /api/lotes/21` de un NO_DISPONIBLE → 404) y los otros 37 casos siguen en PASS (38 PASS · 0 FAIL).
- Verificación manual en el navegador: como ADMINISTRADOR el Lote 4-2 muestra "Deuda: Sí" y aparecen los lotes NO_DISPONIBLE; como INMOBILIARIA A el mismo lote muestra "Sin información" en Deuda y no aparecen lotes NO_DISPONIBLE.
- Se aceptó que `promociones/activa` responda `data: null` en lugar de 404 para un lote NO_DISPONIBLE, porque esa ruta ya responde `200 null` para un lote inexistente y un 404 revelaría su existencia.
- Hallazgos derivados (fuera de este PR): el detalle muestra la fila "Deuda" vacía a roles sin acceso (se corrige en un PR de frontend aparte) y el campo "Actualizado" de lotes nunca se completa (registrado para decisión del equipo).
- Las decisiones de visibilidad (404 en el detalle, campos ocultos, prioridad ajena solo con id) se proponen al equipo para su confirmación en el PR.

#### Decisión adoptada

Se corrige LOT-03 en el backend: para INMOBILIARIA se excluyen los lotes NO_DISPONIBLE (detalle → 404), se omiten `deuda`, documentos de personas, ventas y reservas, se oculta el titular de prioridades ajenas y se rechaza el filtro `deudor`. Las reglas viven en el service, igual que la de TECNICO. Las decisiones de visibilidad quedan sujetas a confirmación del equipo.

#### Resultado

- RED: `tests/unit/security/lotes.inmobiliaria.authz.test.ts`, 21 tests; 11 fallaban por el motivo esperado (la consulta no excluía `NO_DISPONIBLE`, el detalle respondía 200, aparecían `deuda`, `inmobiliariaId: 6` y `ownerType: "CCLF"`, `deudor` respondía 200) y 10 pasaban (8 controles de ADMINISTRADOR/GESTOR/TECNICO, nombre del propietario y prioridad propia).
- GREEN: 21/21 sin `test.failing`.
- Se actualizaron 4 aserciones de argumentos exactos en `lotes.query.routes.test.ts` y `d2.rutas-eliminadas.routes.test.ts` (el service recibe el `inmobiliariaId` del actor); el comportamiento probado no cambió.
- Backend: typecheck PASS; 86 suites, 3271 tests PASS; build PASS; `git diff --check` limpio.
- OpenAPI: solo descripciones; la paridad sigue en 84 operaciones `/api` + `GET /health`.
- `npm run qa:api` no se corrió: el entorno QA no estaba levantado.

#### Evidencia / archivos relacionados

- `Backend/src/services/lote.service.ts`
- `Backend/src/controllers/lote.controller.ts`
- `Backend/src/services/promocion.service.ts`
- `Backend/src/controllers/promocion.controller.ts`
- `Backend/tests/unit/security/lotes.inmobiliaria.authz.test.ts`
- `Backend/tests/unit/routes/lotes.query.routes.test.ts`, `Backend/tests/unit/routes/d2.rutas-eliminadas.routes.test.ts`
- `Backend/documents/documentacionApi.yaml`
- `docs/qa/resultados/api-permisos-2026-11-21.md`
- Jira CCLF-30 · bug LOT-03

### AI-020 — Reporte de ventas por período

**Fecha:** 2026-11-23  
**Área:** Backend / Reportes / Prisma / OpenAPI / Tests  
**Herramientas:** Claude Code (VS Code)

#### Problema

`GET /api/reportes/ventas` respondía la forma del contrato con tarjetas en cero desde 38.1 (AI-016). Faltaba contar las ventas iniciadas, escrituradas y canceladas, cada una por su propia fecha, contra un período anterior de igual duración, con montos en USD y las otras monedas aparte. CCLF-37 pide separar las monedas, pero `Venta` no tiene campo de moneda. Además, la revisión de 38.1 pidió tipar en la OpenAPI los elementos de los arrays, que usaban `items: { type: object }`.

#### Prompt / intención

Implementar la subtarea 38.3 (CCLF-54): iniciadas por fecha de alta, escrituradas por fecha real de escritura y canceladas por fecha de cancelación, cada una dentro de `[desde, hasta]` en días de Buenos Aires; período anterior con las mismas métricas; cantidad y monto en USD; otras monedas agrupadas aparte, sin convertir ni sumar; ventas eliminadas excluidas; sin cambiar rutas, roles ni validación. No inventar campos ni migraciones: si el schema no permite algo, registrarlo como limitación. Tests con un fake de Prisma que evalúe la query sobre un set fijo (como `loteInventario.fake.ts`), REP-A2, bordes del día, 366/367 días y permisos. Sin commits ni PR.

#### Propuesta generada por IA

- Tomar la moneda de una venta de su último plan de pagos (`PlanPago.moneda`, mayor `version`), y usar USD si no tiene plan. Se justifica porque el plan tiene que sumar `Venta.monto` (`pago.service.ts`) y el reemplazo de plan no permite cambiar la moneda. El alta de ventas muestra el monto en USD.
- Contar escriturada solo con estado `ESCRITURADO` y cancelada solo con `CANCELADA`, además de la fecha en el rango. Esos estados no tienen transiciones de salida, así que una fecha cargada en otro estado no es un hecho ocurrido. Iniciada cuenta por `fechaVenta` en cualquier estado.
- Hacer una sola consulta `findMany` que cubra los dos períodos (contiguos), con un `OR` por las 3 fechas y la moneda del último plan por relación (`orderBy version desc, take 1`), y clasificar en memoria. `groupBy` no admite agrupar por la moneda de una relación ni contar una venta en 3 tarjetas por fechas distintas. Montos sumados con `Prisma.Decimal`.
- Días de negocio con UTC-3 fijo (Argentina no tiene horario de verano desde 2009): rango `[desde 03:00Z, hasta+1 03:00Z)` en la base y `Intl` con `America/Argentina/Buenos_Aires` para formatear las fechas de las filas.
- `otrasMonedas`: una entrada por moneda distinta de USD con movimiento en alguno de los dos períodos, con la misma forma que una tarjeta pero `monto`/`montoAnterior`. Filas: las ventas que suman en alguna tarjeta del período elegido, por fecha de alta descendente, con `moneda` y `monto` en lugar de `montoUSD`.
- OpenAPI: schemas `VentaReporteFila`, `VentasOtraMoneda`, `TarjetaVentasOtraMoneda` y los 4 de inventario. Agregar un test que valide respuestas reales contra el schema (validador mínimo en el test, sin dependencias nuevas) y que falle ante claves no documentadas o arrays sin `items` tipados.
- Sumar un test de integración contra PostgreSQL, porque el fake no prueba que la base acepte la consulta.

#### Validación humana

- El alcance, las reglas y la consigna de no inventar campos los fijó la persona responsable de la tarea antes de la implementación.
- Se revisaron la regla de moneda por plan y las diferencias con CCLF-37 antes de aceptarlas.
- Se ejecutaron `npm run typecheck` (OK), `npx jest` (89 suites, 3314 tests en verde) y `npm run build` (OK), con `PRISMA_QUERY_ENGINE_LIBRARY` apuntando al engine de Windows, sin modificar archivos.
- Se corrió `npm run test:integration` contra PostgreSQL 16 descartable en Docker: 3 suites y 20 tests en verde, 2 de ellos del reporte de ventas.
- Se verificó que cada commit propuesto pase la suite por sí solo.
- La revisión cruzada queda a cargo del PR.

#### Decisión adoptada

- Moneda de la venta = moneda de su último plan de pagos; USD si no tiene plan. Queda como limitación hasta que `Venta` tenga moneda propia.
- Escrituradas y canceladas exigen fecha en el rango y estado coherente; iniciadas, solo la fecha de alta.
- Una consulta por reporte, sin N+1 y sin transacción.
- Contrato tipado (`TarjetaOtraMoneda`, `VentasOtraMoneda`, `VentaFila`, `ReporteVentas`) y arrays de ventas e inventario tipados en la OpenAPI. Los arrays de cuotas vencidas siguen genéricos hasta 38.4.
- Quedan pendientes: que el frontend (39.3) adopte `moneda`/`monto` y `fraccionId` en las filas en lugar de `montoUSD`; que `cancelActivesOnNoDisponible` cargue `fechaCancelacion` (hoy esas ventas no entran en "canceladas"); los ejemplos completos de la OpenAPI (38.7, CCLF-58).

#### Evidencia / archivos relacionados

- `Backend/src/services/reporte.service.ts`
- `Backend/src/controllers/reporte.controller.ts`
- `Backend/tests/support/fakes/ventaReporte.fake.ts`
- `Backend/tests/unit/services/reporte.ventas.service.test.ts`
- `Backend/tests/unit/routes/reportes.ventas.routes.test.ts`
- `Backend/tests/unit/routes/reportes.permisos.routes.test.ts`
- `Backend/tests/unit/openapi/reportes.openapi.contract.test.ts`
- `Backend/tests/integration/reportes.ventas.int.test.ts`
- `Backend/documents/documentacionApi.yaml`
- Jira CCLF-54 · Issue #321
- `AI-DECISIONS.md`

### AI-021 — Oráculos de existencia de lotes NO_DISPONIBLE

**Fecha:** 2026-11-23
**Área:** Seguridad / Backend
**Herramientas:** Claude Code

#### Problema

Después de AI-019 (#340), INMOBILIARIA ya no ve los lotes NO_DISPONIBLE en `/api/lotes`, pero la revisión de #340 encontró caminos que permitían deducir qué IDs existen y son NO_DISPONIBLE:

- `POST /api/reservas` y `POST /api/prioridades`: un lote inexistente respondía 404 "Lote no encontrado" y uno NO_DISPONIBLE, 400 por `assertLoteOperableFor` (`loteState.rules.ts`);
- `GET /api/files/lote/:idLoteAsociado`: un lote inexistente devolvía `[]` y uno NO_DISPONIBLE, sus PLANO e IMAGEN;
- `GET /api/files/:id` y `POST /api/files/:id/url`: un archivo inexistente respondía 404, pero un PLANO o IMAGEN de un lote NO_DISPONIBLE respondía 200 (la metadata incluye `idLoteAsociado`) o generaba la URL firmada.

#### Prompt / intención

Que esos caminos respondan a INMOBILIARIA exactamente lo mismo (status y body) para un lote NO_DISPONIBLE que para uno inexistente, sin cambiar ADMINISTRADOR, GESTOR ni TECNICO, sin tocar storage (Supabase/GCS; la migración #288 todavía no empezó) y sumando los tests no bloqueantes de la revisión de #340. En Files por ID, la regla va en la autorización de archivos y se revisan los demás endpoints con `:id` accesibles para INMOBILIARIA.

#### Propuesta generada por IA

- `createReserva` y `createPrioridad`: `if (!lote || (INMOBILIARIA && NO_DISPONIBLE))` con el mismo error de "lote no encontrado" que ya usa cada service (404 y mismo mensaje), antes de la regla de estado.
- `listByLote`: en la rama de INMOBILIARIA, si el lote es NO_DISPONIBLE devuelve `[]`, igual que un lote inexistente. Sin cambios de storage.
- Files por ID: `canUserAccessArchivo` (`file.auth.utils.ts`) recibe el estado del lote (`loteEstado`, opcional) y deniega a INMOBILIARIA los archivos de un lote NO_DISPONIBLE; `verifyArchivoAccess` (`file.controller.ts`) lo consulta solo para INMOBILIARIA. Al denegar, los dos endpoints ya responden el mismo 404 que un archivo inexistente (convención de AI-012), antes de tocar storage.
- Revisión de `files.routes.ts`: los demás endpoints con `:id` (restore, purge, aprobaciones, sustituir, delete) no admiten INMOBILIARIA en la ruta; no se tocaron.
- `stripFieldsForInmobiliaria` (AI-019): la prioridad propia exige también `ownerType === 'INMOBILIARIA'`, como `prioridad.service`.
- Sin cambios de rutas ni de OpenAPI: los controllers de reservas y prioridades ya transportan `req.user` y el 404 ya está documentado.

### Validación humana

- Tests RED→GREEN: 4 fallaban antes del fix y pasan 18/18 después, con casos de control.
- Suite completa: 87 suites / 3292 tests OK; `npm run typecheck` y `npm run build` OK.
- `npm run qa:api`: 38 PASS / 0 FAIL.
- Verificación manual en navegador como INMO A: `GET /lotes/21` (NO_DISPONIBLE) y `GET /lotes/999999` (inexistente) devuelven el mismo 404 "Lote no encontrado"; `GET /files/lote/21` devuelve `[]`.
- Se incorporaron los tests sugeridos en la review del PR #340 (falla cerrada sin tenant, promoción activa, `ownerType`).
- Se decidió cerrar también el oráculo de Files por ID en este PR, después de verificar que la migración a GCS (#288) todavía no empezó.

### Decisión adoptada

Para el rol INMOBILIARIA, un lote NO_DISPONIBLE se comporta como inexistente en todos los puntos de acceso: creación de reservas y prioridades (404), listado de archivos del lote (`[]`) y archivo por ID o URL firmada (404). La prioridad propia se reconoce solo si coinciden `inmobiliariaId` y `ownerType === 'INMOBILIARIA'`. Los roles ADMINISTRADOR, GESTOR y TECNICO no cambian.

#### Resultado

- RED (reservas, prioridades y listado): `tests/unit/security/lotes.no-disponible.oraculos.test.ts`, 10 tests; los 3 de INMOBILIARIA fallaban por el motivo esperado (reservas y prioridades respondían 400 donde un inexistente da 404; Files listaba 2 archivos donde un inexistente da `[]`) y los 7 controles de ADMINISTRADOR/GESTOR pasaban.
- RED (Files por ID): el mismo archivo pasó a 18 tests; 4 fallaban (`GET /api/files/:id` respondía 200 y `POST /api/files/:id/url` pasaba la autorización e intentaba firmar, para PLANO e IMAGEN de un lote NO_DISPONIBLE) y pasaban el control de un lote DISPONIBLE y los controles de ADMINISTRADOR/GESTOR/TECNICO.
- GREEN: 18/18.
- Revisión de #340 en `lotes.inmobiliaria.authz.test.ts`: 3 tests nuevos; falla cerrada sin tenant y promoción activa ya pasaban con el código de AI-019; el de `ownerType` fallaba (1 de 24) y pasó con el cambio (24/24).
- `files.tipo.authz.test.ts`: se agregó `lote.findUnique` al mock de Prisma, sin cambiar lo que prueba.
- Backend: typecheck PASS; 87 suites, 3292 tests PASS; paridad OpenAPI 84 operaciones `/api` + `GET /health`; build PASS; `git diff --check` limpio.
- `npm run qa:api` no se corrió: el entorno QA no estaba levantado.

#### Evidencia / archivos relacionados

- `Backend/src/services/reserva.service.ts`
- `Backend/src/services/prioridad.service.ts`
- `Backend/src/services/file.service.ts`
- `Backend/src/utils/file.auth.utils.ts`
- `Backend/src/controllers/file.controller.ts`
- `Backend/src/services/lote.service.ts`
- `Backend/tests/unit/security/lotes.no-disponible.oraculos.test.ts`
- `Backend/tests/unit/security/lotes.inmobiliaria.authz.test.ts`
- `Backend/tests/unit/security/files.tipo.authz.test.ts`
- Revisión de #340 · Refs #297

### AI-022 — Campos "Actualizado" y "Deuda" de lotes según el rol

**Fecha:** 2026-11-23
**Área:** Frontend / Lotes
**Herramientas:** Claude Code

#### Problema

QA (#297) encontró dos problemas en el detalle de lote (`LoteVerCard.jsx`):

- "Actualizado" se mostraba vacío o incorrecto para todos los roles: `lote.service.ts` nunca setea `updateAt`, y ningún requerimiento documentado pide el campo.
- "Deuda" aparecía como "Sin información" para INMOBILIARIA y TECNICO, porque desde AI-019 el backend ya no les envía `deuda`.

El líder del proyecto (Nico) decidió eliminar "Actualizado" del detalle para todos los roles y que la deuda la vean y editen solo ADMINISTRADOR y GESTOR, en toda la UI. Al aplicar esa regla aparecieron dos lugares más:

- Tabla de lotes: la columna "deuda" solo estaba en el preset de ADMINISTRADOR (faltaba GESTOR), y el selector de columnas se la ofrecía a INMOBILIARIA y TECNICO, que la veían vacía porque el backend no les envía `deuda`; una selección guardada en el navegador también podía mostrarla.
- Editor de lote (`LoteEditarCard.jsx`): mostraba el checkbox "Deuda" a TECNICO y mandaba `deuda` en el payload para todos los roles. Para TECNICO, el backend filtra el payload a `subestado`, `superficie` y `archivos`: con otros campos válidos el cambio de deuda se ignoraba en silencio, y con `deuda` como único campo respondía 403.

#### Prompt / intención

Aplicar la regla con cambios mínimos y solo de frontend, reutilizando el usuario que ya existe (`useAuth()`) y un único criterio de rol en `rbac.ui.js`, sin tocar backend, OpenAPI ni Prisma; contemplar las columnas guardadas en el navegador; no cambiar qué campos manda el editor más allá de no incluir `deuda`; y listar, sin modificarlos, otros lugares con `updateAt`/`updatedAt` o `deuda` de lotes y los campos no técnicos que el editor le muestra a TECNICO.

#### Propuesta generada por IA

- `lib/auth/rbac.ui.js`: nuevo helper `canSeeDeuda(user)` (ADMINISTRADOR o GESTOR con `hasRole`; sin usuario u otro rol, `false`), junto a `canUseDeudorFilter`, para no repetir la lista de roles en cada componente. No se reutilizó `canUseDeudorFilter` porque deduce INMOBILIARIA por permisos y devuelve `true` para un usuario sin rol (no falla cerrado); se dejó sin cambios.
- `LoteVerCard.jsx`: quitar la fila `["ACTUALIZADO", …]` y agregar la fila `["DEUDA", …]` solo si `canSeeDeuda(user)`.
- `Table/TablaLotes/presets/lotes.table.jsx`: agregar `'deuda'` al final del preset de `gestor`, en la misma posición relativa que en `admin` (después de `precio`). La definición de la columna es compartida, así que no cambia; los presets de `tecnico` e `inmobiliaria` quedan igual.
- `Table/TablaLotes/TablaLotes.jsx`: excluir la columna `deuda` del catálogo `ALL_SAFE` salvo que `canSeeDeuda(auth.user)` (el usuario que la tabla ya obtiene de `useAuth()`). El selector recibe `all={ALL_SAFE}` y las columnas guardadas en `localStorage` y las visibles se filtran contra `ALL_SAFE`, así que un solo cambio cubre el selector, la tabla y una selección guardada. Sin usuario, la columna no se ofrece.
- `Cards/Lotes/LoteEditarCard.jsx`: obtener `user` con `useAuth()`; el checkbox "Deuda" y `payload.deuda` quedan solo si `canSeeDeuda(user)`. El resto del payload no cambia.
- Un commit por cambio: dos sobre `LoteVerCard.jsx` (primero "Actualizado", después "Deuda"), uno para el preset, uno para el helper (antes de los que lo usan), uno para `TablaLotes.jsx` y uno para `LoteEditarCard.jsx`.
- Sin tests: el frontend no tiene infraestructura de tests (no hay script `test` ni archivos `*.test.*`) y no se creó.
- Otros usos relevados, sin cambios: `LoteSidePanel.jsx` (mapa) muestra "Deuda" solo si `deuda` es true, así que no aparece para INMOBILIARIA ni TECNICO, porque el backend no la envía; `LABELS` de `LoteEditarCard.jsx` conserva `"DEUDA"` porque solo calcula el ancho de las etiquetas. `updateAt`/`updatedAt` no se muestra en otros componentes de lotes (los demás usos son de inmobiliarias, reservas, ventas y prioridades).
- Campos no técnicos que el editor le muestra a TECNICO y que el backend descarta en silencio (para TECNICO solo acepta `subestado` y `superficie`), sin cambios, para decidir aparte: Número Partida, Tipo (y Nombre del Espacio Común y Capacidad), Estado, Precio, Propietario, Calle, Número, Ocupación e Inquilino.
- La tabla guarda en `localStorage` las columnas elegidas por cada usuario: un GESTOR con una selección guardada ve la nueva columna después de restablecer las columnas en el selector (o de limpiar el almacenamiento).

### Validación humana

- Revisión del diff: cambios solo de frontend; la regla de visibilidad se centralizó en el helper `canSeeDeuda(user)` de `rbac.ui.js` (true solo para ADMINISTRADOR y GESTOR). Se descartó reutilizar `canUseDeudorFilter` porque devuelve true para cualquier rol que no sea INMOBILIARIA o TECNICO, incluso un usuario sin rol.
- `npm run build` OK. Lint de los archivos tocados: mismos hallazgos que en `main` (preexistentes), ninguno nuevo. El frontend no tiene tests automatizados.
- Verificación por API (base QA local): el backend no envía `deuda` a INMOBILIARIA (0/45 lotes) ni a TECNICO (0/47); `PUT /api/lotes/:id` con `deuda` como TECNICO → 403; desde el editor, el backend respondía 200 descartando la deuda en silencio.
- Prueba manual en navegador con las cuatro cuentas QA sobre `Lote2-4`: ADMINISTRADOR y GESTOR ven y editan la deuda en el detalle, la tabla, el selector de columnas y el editor; INMOBILIARIA y TECNICO no la ven en ningún lugar; "Actualizado" no aparece para ningún rol; el filtro "Deudor" ya estaba oculto para INMOBILIARIA y TECNICO.
- Se descartó corregir `updateAt` en el backend: no hay requerimiento que pida el campo y el freeze pre-Cloud solo admite bugs reales.
- Queda fuera del alcance, para otro PR: el editor le muestra a TECNICO campos no técnicos (precio, propietario, estado, etc.) que el backend descarta en silencio.

### Decisión adoptada

Por decisión del líder del proyecto (Nico) y en línea con la Guía QA (LOT-04, LOT-10, LOT-27, LOT-33): la deuda la ven y la editan solo ADMINISTRADOR y GESTOR en toda la interfaz (detalle, tabla, selector de columnas y editor), y "Actualizado" se elimina del detalle de lote para todos los roles. La regla vive en un único helper (`canSeeDeuda`) para que la UI quede alineada con el backend.

#### Resultado

- `npm run build` PASS con cada uno de los cambios (detalle sin "Actualizado", "Deuda" condicionada, preset de GESTOR, selector de columnas y editor).
- `npx eslint` sobre los cinco archivos tocados: mismos hallazgos que en `main`, comparados regla por regla (`LoteVerCard.jsx` 1 error y 4 warnings; `lotes.table.jsx` 1; `TablaLotes.jsx` 4 errores y 3 warnings; `LoteEditarCard.jsx` 6 errores y 1 warning; `rbac.ui.js` sin cambios en sus hallazgos; todos preexistentes); los cambios no agregan ninguno. `npm run lint` global sigue con los errores preexistentes del baseline (lint masivo pendiente post-Cloud).
- Prueba manual por rol (qa.admin, qa.gestor, qa.inmo.a, qa.tecnico) en el detalle, la tabla, el selector de columnas y el editor: PENDIENTE.

#### Evidencia / archivos relacionados

- `frontend/src/components/Cards/Lotes/LoteVerCard.jsx`
- `frontend/src/components/Table/TablaLotes/presets/lotes.table.jsx`
- `frontend/src/components/Table/TablaLotes/TablaLotes.jsx`
- `frontend/src/components/Cards/Lotes/LoteEditarCard.jsx`
- `frontend/src/lib/auth/rbac.ui.js`
- Refs #297

### AI-023 — Node.js 24 LTS y exposición real de vulnerabilidades en las imágenes del backend

**Fecha:** 2026-11-23
**Área:** Cloud / Docker / Dependencias / Seguridad / Prisma
**Herramientas:** Claude Code (VS Code) + Docker Desktop + PostgreSQL 17 local descartable

#### Problema

Las imágenes `runtime` y `migrate` usaban `node:20-slim` (Node.js 20, fuera de soporte). `npm audit --omit=dev` informaba 4 high en la cadena de Prisma CLI y `npm audit` completo, 23 (1 critical en `handlebars`, vía `ts-jest`). No estaba claro qué llegaba realmente a cada imagen. AI-015 partía de que el runtime excluía Prisma CLI, pero la inspección mostró que `prisma`, `@prisma/config`, `effect`, `deepmerge-ts` y `typescript` estaban físicamente en `runtime`. `migrate` partía de `deps` y llevaba toda la toolchain de test, incluido `handlebars`.

#### Prompt / intención

Pasar las imágenes a Node.js 24 LTS con distribución Debian explícita. Determinar la exposición real inspeccionando las imágenes y no el reporte de npm. Corregir lo que admita cambios compatibles, priorizando runtime, después migraciones y después herramientas de desarrollo. Sin `npm audit fix --force`, sin Prisma 7, sin actualizaciones masivas, sin tocar GCP, credenciales ni migraciones históricas, y sin commits.

#### Propuesta generada por IA

- Base `node:24-bookworm-slim`: hoy tiene el mismo digest que `node:24-slim` (Node 24.22.3, Debian 12, OpenSSL 3.0). Fijar la distribución evita que un cambio del tag por defecto mueva la OpenSSL que usan los engines de Prisma.
- Causa de la presencia de Prisma CLI en el runtime: `prisma` es peer opcional de `@prisma/client`. El cálculo de flags de npm (arborist) no lo marca `dev`, así que `npm prune --omit=dev` lo conserva con todo su árbol. Se probó y se descartó `--omit=peer` (no quita nada) y borrar los paquetes antes de otro `prune` (npm los reinstala desde el lockfile).
- Nuevo stage `runtime-deps` con `npm prune --omit=dev --legacy-peer-deps`: quita exactamente el árbol de Prisma CLI (34 paquetes) más `typescript`, y nada más. Lleva una guarda de build que falla si Prisma CLI reaparece.
- `migrate` parte de `prod-deps` (dependencias de producción + Prisma CLI) en lugar de `deps`, sin toolchain de build/test, con archivos de root y una guarda `prisma --version` en el build.
- `package-lock.json`: `npm update` solo de los paquetes de desarrollo vulnerables, dentro de sus rangos (`handlebars`, `form-data`, `js-yaml`, `brace-expansion`, `minimatch`, `picomatch`, `diff`, `browserslist`, `baseline-browser-mapping`, `@babel/core`). `package.json` no cambia. El único cambio en producción es `hasown` 2.0.2 → 2.0.4, que exige `form-data@4.0.6`. Se descartó `npm audit fix` sin `--force` porque subía `prisma` a 6.19.3 con `@prisma/client` en 6.18.0 y arrastraba jest 30.5.
- No forzar `effect`/`deepmerge-ts` con `overrides`. `deepmerge-ts` exige un salto mayor, y una versión de `effect` no probada por Prisma no se justifica para un job efímero con entradas del repo.

#### Validación humana

- El alcance y las restricciones los fijó la persona responsable antes de la implementación.
- Pendiente: revisión del diff y de la evidencia en el PR, a cargo del equipo.

Validaciones que ejecutó la IA durante la sesión:

- Local (Node 24.13.0): `npm ci`, `npm run typecheck`, `npm run build`, `npx jest` (89 suites, 3314 tests) y `npm run test:integration` contra PostgreSQL 17.12 descartable (3 suites, 20 tests).
- Builds de `runtime` y `migrate` sobre Node 24.22.3, usuario `node`. Smoke del runtime: `/health` 200 con `no-store`, 404/401 del contrato, SIGTERM con cierre ordenado y exit 0, fail-fast de configuración y `bcrypt` nativo.
- Base PostgreSQL 17.12 nueva con roles equivalentes al laboratorio (`federala_migrate`/`federala_app`, sin superusuario). `migrate deploy` desde cero aplicó 69 de 69, la segunda ejecución no tuvo pendientes, `migrate status` dio al día y `migrate diff` contra `schema.prisma` no encontró diferencias. Esquema idéntico (`pg_dump --schema-only`) al del laboratorio migrado con Node 20. `federala_app` lee e inserta pero no crea tablas.
- Runtime contra esa base como `federala_app`: login, JWT y lecturas autenticadas, más el job de expiraciones (exit 0).
- Laboratorio `federala-pg17-lab`: `migrate status` y `migrate deploy` solo como prueba de idempotencia, sin migraciones pendientes.

#### Decisión adoptada

Pendiente de validación humana en el PR. Se propone:

- Node.js 24 LTS con `node:24-bookworm-slim` en todos los stages del backend.
- Runtime sin Prisma CLI y `migrate` sin toolchain de build/test.
- Aceptar `effect`/`deepmerge-ts` en `migrate` y los moderados de jest 30 hasta Prisma 7.

#### Evidencia / archivos relacionados

- `Backend/Dockerfile`
- `Backend/package-lock.json`
- `Backend/README.md`
- `docs/architecture/backend.md`
- `docs/architecture/freeze-pre-cloud.md`
- `docs/development/setup-local.md`
- `AI-DECISIONS.md`

### AI-024 — Vista de inventario de lotes (frontend) y apertura de un lote desde la URL

**Fecha:** 2026-11-23 (actualizada el 2026-11-24 con las correcciones de la revisión de la PR #346)  
**Área:** Frontend / Reportes / Lotes / Cliente HTTP  
**Herramientas:** Claude (claude.ai) para planificar las etapas y redactar los prompts; Claude Code para ejecutar el código.

#### Problema

La pestaña Inventario de Reportes (39.1, AI-018) solo mostraba la cantidad de filas que devolvía el cliente. La subtarea 39.2 (CCLF-60) pedía la pantalla completa: filtros de fracción, estado y subestado, tarjetas de ofrecibles y totales, y la tabla de lotes con un enlace a cada lote.

La fila y los totales ya estaban definidos por el backend de 38.2 (AI-017): `InventarioFila` trae `fraccionId` además del número visible de la fracción, `numero` entero o null, y `precio` decimal o null; `porFraccion` trae `fraccionId`, `fraccion`, `cantidad` y `ofrecibles`. El filtro `fraccion` de la API es el id, no el número visible, y el `enlace` de cada fila es `/?lote=<id>`, una URL que el frontend no sabía leer.

#### Prompt / intención

Trabajo en cinco etapas, cada una con aprobación humana y sin commits de la IA:

1. Exploración de solo lectura (LoteVerCard y cómo se monta, formateo de dinero y fechas, estilos de KPI, clases `tl-*`, normalización de estados, catálogo de fracciones) con un informe de riesgos.
2. Construir la vista de inventario sin tocar nada fuera de Reportes y del cliente.
3. Reemplazar la obtención de fracciones por el patrón de errores del resto de reportes, y agregar la lectura de `?lote=<id>` en el Dashboard.
4. Mover los ids del mock a un rango que no choque con la base real y verificar si el Dashboard pagina.
5. Verificación final y esta entrada.

#### Propuesta generada por IA

- `VistaInventario` como componente propio, montado desde `Reportes.jsx` con una propiedad opcional `Vista` en el mapa `REPORTES`: los reportes que todavía no la tienen (39.3 y 39.4) siguen mostrando el conteo de filas sin cambios.
- `TablaReportes`, tabla genérica y reutilizable para los tres reportes, con las clases `tl-*` de la tabla de lotes pero sin `TablaBase`, que impone columna de checkbox, columna de acciones, paginación del lado cliente y selector de columnas, y no tiene estados de carga ni de error. Como `.tl-tr` es un grid sin columnas propias, recibe `gridTemplateColumns` inline, igual que hace `TablaBase`.
- Formulario de filtros propio en lugar de `FilterBar`: la barra existente está pensada para filtros opcionales y limpiables, y su control de fechas trabaja con epoch-ms.
- `getFraccionesReporte()` para el catálogo del filtro, normalizado a `{ id, numero }`: se envía el id y se muestra el número.
- Soporte de `?lote=<id>` en `Dashboard.jsx`, por el mismo camino que ya usaba el flujo de `location.state` (`onVer`), con un ref para procesar cada valor una sola vez (`fetchAndMergeLote` modifica `allLotes` y volvería a disparar el efecto) y limpieza del parámetro con `replace` para que cerrar el modal o refrescar no lo reabra.
- `fmtFechaCalendario` en `lib/fechas.js`, que parte el string en lugar de usar `new Date`.
- Estilos de tarjeta propios en `Reportes.css`, inspirados en `.vp-summary-*` pero sin importar `venta-pagos.css` (que además redefine `.cclf-card`) y sin colores nuevos.

#### Validación humana

- El alcance y las decisiones de diseño las fijó la persona responsable antes de cada etapa: una vista por reporte enchufada con `Vista`, tabla propia en vez de `TablaBase`, filtros aplicados con botón y no en vivo, y qué archivos se podían tocar en cada paso.
- **Fracciones con el patrón de errores equivocado:** la IA resolvió el catálogo con `getAllFracciones()` de `lib/api/fracciones.js`, que atrapa todo y devuelve `{ success: true }` con lista vacía, de modo que un 403 o un 500 se habría visto como "no hay fracciones". La persona lo detectó y pidió reemplazarlo por una llamada directa con `http()` y el mismo patrón que el resto de `reportes.js` (lanzar un `Error` con `statusCode` y `response` si `!res.ok`).
- **Enlace "Ver lote" sin destino:** el informe de la etapa 1 señaló que el `/?lote=<id>` del contrato no lo leía nadie (el Dashboard solo abría un lote por `location.state`, y `/?editLotId=` estaba sin emisor). La persona decidió dejarlo sin funcionar en la etapa 2 y resolverlo en una etapa aparte, con un toast cuando el lote no existe.
- **Ids del mock que chocaban con la base real:** al verificar el enlace contra el backend local se vio que los `loteId` del mock (101-157) caían dentro del rango real (70-116), así que "Ver lote" abría un lote verdadero sin relación con el reporte simulado. La persona pidió moverlos a 9001 en adelante; se hizo con un desplazamiento constante que conserva el orden y la unicidad, y se verificó que ventas y cuotas sigan apuntando a los mismos lotes.
- **Fechas de calendario:** el informe de la etapa 1 comprobó que `new Date("2026-11-23").toLocaleDateString("es-AR")` muestra el 22 en Buenos Aires, porque el string se interpreta como medianoche UTC. La persona fijó que la fecha de corte se formatee partiendo el string.
- Decisiones menores de la IA que la persona aceptó: la moneda del precio queda fijada en USD con una constante, porque `Lote.precio` no tiene moneda en el schema; y el ancho de las columnas pasó a ser proporcional, porque con columnas fijas el sobrante se iba entero a la primera.
- Revisión visual de la pantalla con Claude (claude.ai) contra la V2 de CCLF-37 y el boceto: se corrigieron las tildes de los estados, el rótulo del botón ("Generar" en lugar de "Aplicar filtros") y se agregó la leyenda de la tarjeta de ofrecibles. La persona responsable aprobó los cambios.
- Revisión cruzada de la PR #346: se detectaron desvíos respecto de las notas de integración con 38.2 (comentario del issue de CCLF-60), que ni la IA ni la persona tenían a la vista al implementar: el lote sin número se mostraba como "Lote #<id>" (debía ser "Sin número"), el precio sin cargar como "—" (debía ser "Sin precio") y el valor de los estados desconocidos salía crudo. Además se corrigió un bug: Generar no volvía a consultar con los mismos filtros. Sobre el texto del lote, el equipo decidió mantener "Lote 3-2" (consistente con el resto de la app) en lugar del "F2-045" del ejemplo de la nota.

#### Decisión adoptada

- `Reportes.jsx` elige entre la vista propia del reporte y el conteo de filas según la propiedad `Vista`; las pestañas de ventas y cuotas quedaron sin cambios.
- `TablaReportes` queda como la tabla de los reportes, lista para 39.3 y 39.4; `TablaBase` sigue siendo la de las pantallas de gestión.
- El filtro de fracción envía `fraccionId` y muestra el número visible. En la base local son distintos (ids 7-14 para las fracciones 3, 4, 6, 7, 8, 11, 14 y 15), así que confundirlos no es hipotético.
- Un fallo al pedir las fracciones se muestra como aviso y deja el resto del reporte usable, en lugar de pasar por "no hay fracciones".
- `Dashboard.jsx` abre el lote de `?lote=<id>` y, si el id no es un entero positivo o no está entre los lotes cargados, avisa con el toast "El lote no existe o ya no está disponible". El flujo anterior por `location.state` quedó intacto.
- Si la carga de lotes falló, ese aviso no se emite: con `allLotes` vacío no se puede distinguir "no existe" de "no sé", y el toast de la carga ya lo dijo. En ese caso el `?lote=` se conserva en la URL, así que un refresco que sí cargue abre el lote.
- Los textos de la tabla los fija `etiquetas.js`: `etiquetaLote(fraccion, numero)` da "Lote 3-2" o "Sin número" (no el id interno) y `fmtPrecioUsd` da "USD 85.000,00" o "Sin precio" (no el guión de celda vacía). Un estado o subestado que no esté en el mapa se humaniza en vez de salir crudo.
- Generar dispara una consulta en cada clic, también con los mismos filtros, y queda deshabilitado mientras la consulta está en vuelo.
- El filtro de estado no ofrece `OPERATIVO`, por el mismo criterio que `ELIMINADO`: filtrar por él solo da listas vacías. La etiqueta se conserva por si alguna fila llega con ese valor.
- Los `loteId` del mock viven en 9001+, fuera del rango de la base. El mock completo se borra en 39.6.

#### Evidencia / archivos relacionados

Verificado:

- Con el mock: 24 filas, tarjetas y resúmenes que cuadran con las filas, filtro por cada fracción (ids 11, 12 y 13) con 8 filas cada una, filtros de estado y subestado combinados, estado vacío de la tabla, el lote sin número (9040) como "Sin número" y su precio como "Sin precio", el resto de los precios como "USD 92.000,00" y similares, y la fecha de corte en el día correcto.
- Contra el backend real en Docker: el reporte trae 46 filas y 16 ofrecibles; el filtro lista las 8 fracciones reales con sus ids; y el clic en "Ver lote" (`/?lote=70`) abre el modal "Lote 3-1", que es el mismo lote que muestra la fila.
- `?lote=`: un id real abre el modal; cerrar el modal y refrescar no lo reabren; la URL queda sin el parámetro y conserva los demás; un id inexistente y uno no numérico muestran el toast sin abrir nada.
- Con el endpoint de fracciones inalcanzable, la pantalla muestra el error y deshabilita ese filtro, en vez de una lista vacía silenciosa.
- Con el mock activo, "Ver lote" muestra el toast y no abre ningún lote.
- `npm run build` pasa y `npm run lint` queda en el total de siempre, sin problemas nuevos en los archivos de la tarea: 114 errores y 50 warnings de deuda previa cuando se escribió esta entrada, 113 y 50 después del merge de main del 2026-11-24.
- Se verificó que no hay lotes en estado OPERATIVO ni código que lo asigne; se quitó del filtro.
- Correcciones de la revisión (2026-11-24), con Chrome headless: dos clics seguidos en Generar sin cambiar filtros producen dos `GET /api/reportes/inventario` (contados en el servidor), y el botón queda deshabilitado mientras la consulta está en vuelo; con el endpoint de lotes respondiendo 500 y `?lote=70`, aparece un único aviso ("No pude cargar los lotes"), no se abre ninguna ficha y el parámetro queda en la URL; con el endpoint sano, `?lote=70` abre la ficha "Lote 3-1", el mismo texto que muestra la fila del reporte. Las funciones de `etiquetas.js` se probaron además una por una en Node, incluidos los casos límite (precio 0, número 0, `NUEVO_ESTADO` → "Nuevo estado").

No verificado:

- El frontend no tiene infraestructura de tests: toda la verificación fue manual, con un Chrome headless dirigido por scripts que no se versionaron.
- Las correcciones del 2026-11-24 no se probaron contra la base del equipo: el contenedor `grupo01_db` está vacío (sin migrar) y `grupo01_backend` apunta a Supabase, que la persona responsable pidió no consultar. Se usó un servidor local que devuelve el contrato de 38.2, así que lo verificado es el comportamiento del frontend ante ese contrato, no el contenido real de la base.
- No se probó la pantalla con los roles INMOBILIARIA ni TECNICO, que no tienen acceso a Reportes.
- Del camino de error de `/fracciones` se probaron el 401 (lo intercepta `http()` y manda a `/login`) y el fallo de red; no se probó un 403.

Riesgos y deuda:

- `GET /fracciones` tiene `limit = 10` por defecto en el backend y el controller no lo cambia (`fraccion.service.ts`): hoy hay 8 fracciones, pero a partir de la 11 el filtro quedaría incompleto.
- `location.state.openLoteId` en `Dashboard.jsx` quedó sin ningún emisor: es código muerto desde antes de esta tarea.
- El toast de `?lote=` también aparecería para INMOBILIARIA con un lote `NO_DISPONIBLE`, porque el backend lo excluye de su listado. En ese caso es el comportamiento deseado.
- La moneda del precio del inventario la fija el frontend (`fmtPrecioUsd`, en USD) hasta que el schema tenga moneda en `Lote`.
- El precio se ve distinto según la pantalla: el reporte muestra "USD 85.000,00" y la ficha del lote, "US$ 85.000", porque esa usa `fmtMonto` de `pagoUtils.js`, compartida con pagos y ventas. Unificarlas es un cambio transversal, fuera de esta tarea.
- El mapa de variantes de color del subestado está replicado en `Insignias.jsx` porque `SubstatusBadge` no lo exporta: si cambian los colores allí, hay que actualizar ambos.
- El botón "Generar" se ve con el azul de Bootstrap (`.btn-primary` pisa la regla propia) y no con `--color-action-primary`; queda para 39.5, junto con los estados de pantalla.

Archivos:

- `frontend/src/components/Reportes/VistaInventario.jsx`
- `frontend/src/components/Reportes/TablaReportes.jsx`
- `frontend/src/lib/fechas.js`
- `frontend/src/lib/api/reportes.js`
- `frontend/src/lib/api/reportes.mock.js`
- `frontend/src/pages/Reportes.jsx`
- `frontend/src/pages/Reportes.css`
- `frontend/src/pages/Dashboard.jsx`
- Jira CCLF-60 (39.2), CCLF-53 (backend, AI-017) y CCLF-59 (pantalla base, AI-018)
- `AI-DECISIONS.md`
- `frontend/src/components/Reportes/etiquetas.js`
- `frontend/src/components/Reportes/Insignias.jsx`

### AI-025 — Reporte de cuotas vencidas

**Fecha:** 2026-11-24  
**Área:** Backend / Reportes / Pagos / OpenAPI  
**Herramientas:** Claude Code para relevar la especificación y el código, implementar y correr las validaciones.

#### Problema

`GET /api/reportes/cuotas-vencidas` existía desde 38.1 (CCLF-52) pero devolvía la forma del contrato con datos vacíos. La subtarea 38.4 (CCLF-55) pedía el reporte de la pestaña Cobranzas según CCLF-37: cuotas de planes VIGENTE con saldo > 0 y vencimiento anterior al corte (Buenos Aires), excluyendo ventas canceladas y eliminadas, con tramos de atraso 1–30, 31–60 y más de 60, ARS y USD siempre separados, y el caso de aceptación REP-A1.

CCLF-37 define el endpoint, los parámetros (`moneda` obligatoria, `fraccion` opcional) y la respuesta `{ corte, moneda, saldoVencido, cuotas, ventas, tramos[], filas[] }`, pero no la forma de cada tramo ni de cada fila.

#### Prompt / intención

Implementar 38.4 en la rama ya creada, sin commits, migraciones ni cambios al schema, con estas condiciones:

1. Verificar la rama y que tuviera 38.1, 38.2 y 38.3 de `main`; frenar si faltaba algo.
2. Leer CCLF-37 y avisar antes de inventar un endpoint o un campo que no estuviera definido.
3. Seguir las convenciones de 38.1–38.3: `authenticate` + `authorize` por ruta, validación Zod, corte en hora de Argentina, montos como string decimal y estructura de tests.
4. Antes de programar, explicar cómo se calcularía el saldo de una cuota y qué campos se usarían.
5. Editar solo los tests nuevos o los que fallaran por el cambio.

#### Propuesta generada por IA

- **Saldo:** usar el campo `CuotaPlanPago.saldoPendiente`, que el service de pagos ya mantiene como `montoTotalExigible − montoPagado` en cada pago y recargo, en lugar de recalcularlo desde `PagoRegistrado`. Así incluye los recargos (CCLF-37: "saldo con recargos: se incluye") y un pago parcial entra por lo que falta. Totales en `Prisma.Decimal`, devueltos con `toFixed(2)`.
- **Universo en una sola consulta:** `cuotaPlanPago.findMany` con `saldoPendiente > 0`, `planPago.estadoPlan = VIGENTE`, `planPago.moneda`, `venta.estadoOperativo = OPERATIVO`, `venta.estado ≠ CANCELADA` y, si viene, `venta.lote.fraccionId`.
- **Día de vencimiento en UTC, no en Buenos Aires:** `fechaVencimiento` es una fecha sin hora guardada como instante; el frontend la manda a las 12:00Z (`fromDateInputToISO`) y la API con `YYYY-MM-DD` la guarda a las 00:00Z. Pasarla a Buenos Aires correría al día anterior las de 00:00Z, y una cuota que vence hoy aparecería vencida. La condición queda `fechaVencimiento < <corte>T00:00:00Z`, con el corte calculado con `fechaCorte()` como en 38.2 y 38.3.
- **Tramos:** `diasAtraso` = días entre el vencimiento y el corte (mínimo 1); `1-30`, `31-60` y `+60`, siempre los tres y en orden.
- **Forma de tramos y filas:** la que ya esperaba el cliente del frontend (`frontend/src/lib/api/reportes.js`, CCLF-59), incluido el enlace `/ventas/:id/pagos`, para que la vista 39.4 no tuviera que adaptarse.
- **Tests:** un fake de Prisma para `cuotaPlanPago` que evalúa `where`, `select` y `orderBy` y falla ante cualquier otra forma de consulta; tests de service, de rutas, de contrato OpenAPI y de integración contra PostgreSQL. Para fijar el corte, `fijarAhora` finge solo el reloj de `Date` y no los timers, para no frenar supertest.

#### Validación humana

- La persona responsable fijó las reglas del reporte, los casos mínimos de test y los límites de la tarea antes de empezar.
- Revisó el criterio de saldo y de fecha de corte que la IA presentó antes de programar, y aprobó las decisiones del informe final: usar `saldoPendiente`, tomar el día de vencimiento en UTC, adoptar la forma de tramos y filas del cliente del frontend y excluir también los planes CANCELADO.
- **Recargo en la fila:** la IA señaló que la fila no separa cuánto del saldo es recargo, aunque CCLF-37 dice que "se aclara en la tabla". La persona decidió no agregar un campo como `montoRecargo` por ahora.
- **Moneda inválida:** la IA verificó que no puede darse, porque `PlanPago.moneda` es un enum obligatorio ARS/USD; no hizo falta una regla adicional.
- Corrió el test de integración contra un PostgreSQL descartable en Docker y pasó.
- Probó el endpoint en Postman contra el backend. Una primera consulta devolvió saldo 0; con el diagnóstico propuesto (distinguir el stub anterior, que devuelve `tramos: []`, del código nuevo, y revisar moneda, estado de la venta y del plan) la persona confirmó que el reporte devuelve las cuotas vencidas.
- La revisión cruzada queda a cargo del PR.

#### Decisión adoptada

- `getReporteCuotasVencidas` en `reporte.service.ts` con el universo, el saldo, el corte y los tramos descriptos arriba. Filas ordenadas de la más atrasada a la menos atrasada (a igual atraso, por `cuotaId`).
- Fila: `cuotaId`, `ventaId`, `ventaNumero`, `loteId`, `loteNumero`, `fraccion`, `numeroCuota`, `cantidadCuotas`, `fechaVencimiento`, `diasAtraso`, `tramo`, `saldoPendiente` y `enlace`. A diferencia de inventario y ventas, no trae `fraccionId`.
- Se excluyen las cuotas de planes REEMPLAZADO y CANCELADO.
- OpenAPI con los schemas `TramoCuotasVencidas`, `TramoAtraso` y `CuotaVencidaFila`, en lugar de los `{ type: object }` genéricos.
- Sin campo de recargo en la fila.

#### Evidencia / archivos relacionados

Verificado:

- REP-A1: quedan afuera la cuota que vence hoy (guardada a las 00:00Z y a las 12:00Z), la pagada, la del plan reemplazado y la de la venta cancelada; ARS y USD se informan por separado.
- Venta eliminada, plan CANCELADO, pago parcial, precisión Decimal con montos grandes, bordes de 1, 30, 31, 60 y 61 días, corte a las 02:59 y 03:00 UTC, filtro por fracción.
- 400 (moneda faltante, desconocida, en minúscula o repetida; fracción inválida), 401 (sin token o con token inválido), 403 (INMOBILIARIA y TECNICO) y 500 sin detalle.
- La respuesta real cumple el schema de la OpenAPI.
- `npm run typecheck` y `npm run build` pasan; `npm test -- --runInBand` pasa completo (93 suites, 3388 tests).
- `npm run test:integration -- reportes.cuotasVencidas` pasa contra PostgreSQL descartable.
- Consulta manual en Postman contra el backend.

No verificado:

- La exportación `cuotas-vencidas.xlsx`, que sigue respondiendo 501 hasta 38.5 (CCLF-56).

Riesgos y deuda:

- `npm test` en paralelo tiene timeouts intermitentes (5 s) en suites ajenas al reporte (`files.params`, `params.contract`, `personas.contracts`, `login.rate-limit`); en serie pasan todas.
- `estaCuotaVencida` del módulo de pagos compara días con la hora local del servidor (UTC en Cloud Run), no con la de Buenos Aires: entre las 21:00 y las 24:00 de Argentina, la pantalla de pagos y este reporte pueden no coincidir en si una cuota está vencida.
- Un vencimiento guardado entre las 21:00 y las 24:00 de Argentina (00:00–02:59Z del día siguiente) se toma como del día siguiente; los caminos actuales de alta guardan 00:00Z o 12:00Z.
- El contrato del test de OpenAPI de cuotas duplica el validador de `reportes.openapi.contract.test.ts`, para no modificar un test existente.

Archivos:

- `Backend/src/services/reporte.service.ts`
- `Backend/src/controllers/reporte.controller.ts`
- `Backend/documents/documentacionApi.yaml`
- `Backend/tests/support/fakes/cuotaVencida.fake.ts`
- `Backend/tests/unit/services/reporte.cuotasVencidas.service.test.ts`
- `Backend/tests/unit/routes/reportes.cuotasVencidas.routes.test.ts`
- `Backend/tests/unit/openapi/reportes.cuotasVencidas.openapi.contract.test.ts`
- `Backend/tests/integration/reportes.cuotasVencidas.int.test.ts`
- `Backend/tests/unit/routes/reportes.permisos.routes.test.ts`
- Jira CCLF-55 (38.4), CCLF-37 (especificación) y CCLF-59 (cliente del frontend, AI-018)
- `AI-DECISIONS.md`

### AI-026 — Exportación a Excel de los reportes

**Fecha:** 2026-11-24  
**Área:** Backend / Reportes / OpenAPI / Dependencias  
**Herramientas:** Claude Code para relevar la especificación y el código, implementar y correr las validaciones.

#### Problema

Las rutas `inventario.xlsx`, `ventas.xlsx` y `cuotas-vencidas.xlsx` existían desde 38.1 (CCLF-52), con permisos y validación, pero respondían 501. La subtarea 38.5 (CCLF-56) pedía generar el archivo con ExcelJS y cumplir REP-A5: el `.xlsx` tiene que traer las mismas filas que la vista JSON con los mismos filtros.

CCLF-37 fija las rutas, el `Content-Type`, la librería, el formato `"USD" #,##0.00`, las fechas como fecha de Excel y "una hoja con la fecha de corte y los filtros". No define nombres de archivo, nombres de hoja, columnas ni cómo mostrar los totales.

#### Prompt / intención

Implementar 38.5 en la rama ya creada, sin commits, migraciones ni cambios al schema, con estas condiciones:

1. Verificar la rama y que tuviera 38.2, 38.3 y 38.4 mergeadas; frenar si faltaba algo.
2. Usar los mismos services y la misma validación que los endpoints JSON, sin duplicar consultas ni reglas.
3. Responder los errores (400, 401, 403, 500) en JSON, nunca como archivo.
4. Sumar solo `exceljs`, en `dependencies`, y revisar que el lockfile quede coherente.
5. No exponer datos que el JSON no expone.
6. Proponer, y avisar en el informe, lo que la especificación no define.
7. Editar solo los tests nuevos o los que fallaran por el cambio.

#### Propuesta generada por IA

- **Módulo aparte:** `reporte.excel.ts` arma el libro a partir del objeto `data` que devuelve el service del JSON. No consulta la base ni recalcula nada, así REP-A5 se cumple por construcción.
- **Controller:** valida con el mismo schema, llama al mismo service y arma el libro completo antes de escribir headers. Si algo falla, el error sigue el camino normal (`next` → JSON) y nunca sale un archivo a medias.
- **Nombre de archivo:** `reporte-<tipo>[_<parámetros>]_corte-<YYYY-MM-DD>.xlsx`, solo con `[A-Za-z0-9._-]`. Va entre comillas en `Content-Disposition`; si un nombre no cumple, el controller responde 500 en lugar de mandar un header roto.
- **Hojas:**
  - Datos: encabezados en castellano, en negrita, con la fila congelada y autofiltro.
  - Totales: en bloques, con USD y ARS por separado.
  - Parámetros: fecha de corte, fecha y hora de generación en hora de Buenos Aires, cada filtro ("Todos" o "Todas" sin filtro) y la cantidad de filas exportadas.
- **Formatos de celda:**
  - Los montos son números con el formato de su moneda; en ventas, cada fila usa el de la suya.
  - Las fechas se arman desde el día calendario `YYYY-MM-DD` a las 00:00 UTC, que es como ExcelJS las serializa, así no se corre el día.
  - Los estados se muestran con las etiquetas del frontend.
  - Los nulos quedan como celda vacía.
- **Columnas que quedan afuera:** `enlace`, porque es una ruta del frontend, y `fraccionId`/`loteId`, porque son ids internos. Se mantienen los ids de lote, venta y cuota que ya devuelve el JSON.
- **Fracción en Parámetros:** se muestra el número visible y no el id. Para eso se agregó `fraccionDelFiltro`, una consulta que solo corre si se filtró por fracción. Una fracción inexistente se muestra como "Inexistente (id X)".
- **CORS:** se agregó `exposedHeaders: ['Content-Disposition']` para que el frontend pueda leer el nombre del archivo.
- **OpenAPI:** respuesta 200 binaria compartida (`ReporteXlsx`); se quitó `ExportacionPendiente`, que el test de paridad no admite sin uso.

#### Validación humana

- La persona responsable fijó las reglas, los casos de test y los límites de la tarea antes de empezar.
- Revisó el informe final: archivos, rutas, nombres de archivo, columnas, resultados de los comandos y los puntos no definidos por CCLF-37.
- No incluir usuario ni rol en la hoja Parámetros, porque la especificación no lo pide y así el archivo no lleva el email de quien lo descarga.
- Probó los tres endpoints `.xlsx` en Postman contra el backend y los tres archivos se descargaron bien.
- La revisión cruzada queda a cargo del PR.

#### Decisión adoptada

- `GET /api/reportes/inventario.xlsx` → `reporte-inventario_corte-<corte>.xlsx`, con las hojas Inventario, Totales y Parámetros.
- `GET /api/reportes/ventas.xlsx` → `reporte-ventas_<desde>_a_<hasta>_corte-<corte>.xlsx`, con las hojas Ventas, Totales y Parámetros. Parámetros incluye el período anterior.
- `GET /api/reportes/cuotas-vencidas.xlsx` → `reporte-cuotas-vencidas_<moneda>_corte-<corte>.xlsx`, con las hojas Cuotas vencidas, Totales y Parámetros. Totales trae siempre los 3 tramos.
- Mismos permisos (ADMINISTRADOR y GESTOR), parámetros y errores que el JSON.
- `exceljs` 4.4.0 en `dependencies`.

#### Evidencia / archivos relacionados

Verificado:

- REP-A5: para cada reporte, el `.xlsx` leído con ExcelJS trae las mismas filas, en el mismo orden, que el JSON con los mismos filtros (varios juegos de filtros por reporte).
- Formatos: montos numéricos con formato USD o ARS, fechas en el día correcto sin corrimiento, nulos vacíos y etiquetas de estado.
- Totales iguales a los del JSON. La hoja Parámetros trae el corte, la generación en hora de Buenos Aires, los filtros y la cantidad de filas.
- Headers `Content-Type`, `Content-Disposition` y `Cache-Control: no-store`. Casos vacíos (archivo válido solo con encabezados) y fracción inexistente.
- 400, 401 y 403 en JSON y sin adjunto; error de base → 500 en JSON. GESTOR descarga los tres reportes.
- `npm ls --all` sin errores: el lockfile suma 156 paquetes y solo sube `es-object-atoms` (transitiva) de 1.1.1 a 1.1.2.
- `npm run typecheck` y `npm run build` pasan.
- `npm test`: la primera corrida en paralelo tuvo 12 fallos intermitentes por timeouts en suites ajenas. En serie (`--runInBand`) y en una segunda corrida en paralelo pasa completo (94 suites, 3430 tests).
- Descarga manual de los tres `.xlsx` en Postman contra el backend.

No verificado:

- La apertura de los archivos en Excel o LibreOffice: los tests los leen con ExcelJS.
- La descarga desde el frontend.

Riesgos y deuda:

- Excel no guarda zona horaria: la hora de generación se escribe como hora de reloj de Buenos Aires, y la fila de Parámetros lo aclara.
- Los montos pasan de string decimal a número de Excel (doble precisión). Para dos decimales alcanza, pero no es exacto en montos muy grandes.
- Las etiquetas de estado están copiadas de `frontend/src/components/Reportes/etiquetas.js`: si cambian allí, hay que actualizar ambos.
- Persisten los timeouts intermitentes de `npm test` en paralelo, ya señalados en AI-025.

Archivos:

- `Backend/src/services/reporte.excel.ts`
- `Backend/src/services/reporte.service.ts`
- `Backend/src/controllers/reporte.controller.ts`
- `Backend/src/app.ts`
- `Backend/documents/documentacionApi.yaml`
- `Backend/package.json`
- `Backend/package-lock.json`
- `Backend/tests/unit/routes/reportes.excel.routes.test.ts`
- `Backend/tests/unit/routes/reportes.permisos.routes.test.ts`
- Jira CCLF-56 (38.5), CCLF-37 (especificación) y CCLF-53, CCLF-54 y CCLF-55 (reportes JSON, AI-017, AI-020 y AI-025)
- `AI-DECISIONS.md`

### AI-027 — Adaptación de Files a Google Cloud Storage

**Fecha:** 2026-11-24
**Área:** Backend / Files / Storage / Cloud
**Herramientas:** ChatGPT y Claude Code en el análisis, el diseño, la implementación y la revisión.

#### Problema

Files estaba acoplado a Supabase Storage. `file.service.ts` subía, firmaba y borraba con `@supabase/supabase-js`, y el proceso web no arrancaba sin `SUPABASE_URL` y `SUPABASE_SERVICE_KEY`. Staging en Google Cloud (`la-federala-staging-utn`, bucket `federala-staging-files-28822223940`) no debía quedar atado a Supabase de forma provisional. Render sí debe seguir usando Supabase. GitHub #288 / CCLF-21 / CL-07.

#### Prompt / intención

Auditar el módulo en solo lectura y, con el diseño aprobado, implementarlo sin migraciones Prisma, sin cambiar OpenAPI, JWT ni RBAC, sin claves JSON y sin operar recursos de GCP. Conservar Render cuando `STORAGE_PROVIDER` no está. Después de la revisión de seguridad, corregir la clasificación de 404 en la purga, impedir que un `statusCode` del SDK salga como error HTTP de dominio y limitar la compensación del upload al fallo de metadata.

#### Propuesta generada por IA

Se compararon estas alternativas:

- Un `if` dentro de `file.service.ts`. Menos archivos, pero el dominio queda atado a dos SDK.
- Un adaptador de tres operaciones, elegido al arrancar. Es la opción adoptada.
- Dejar solo GCS. Rompe Render y el entorno local.
- Una columna Prisma `storageProvider`. No hace falta: cada despliegue tiene un solo bucket y `linkArchivo` ya es la ruta interna.
- URLs firmadas de escritura para que el navegador suba directo. Cambia el modelo de autorización.
- Un puerto hexagonal con contenedor de inyección. Desproporcionado para tres llamadas.

La propuesta adoptada:

- Interfaz `putObject`, `getSignedReadUrl` y `deleteObject`. Rutas, UUID, metadata y RBAC siguen en `file.service.ts`.
- `STORAGE_PROVIDER`: ausente o vacío equivale a `supabase`. `gcs` exige `GCS_BUCKET` y no exige credenciales de Supabase. El job de vencimientos no lee storage.
- GCS con Application Default Credentials, sin clave JSON y sin `GOOGLE_APPLICATION_CREDENTIALS`. Subida no resumible, `ifGenerationMatch: 0`, sin ACL, contenido `application/octet-stream`. URL firmada V4 de lectura, 3600 segundos.
- Sin migración Prisma.
- Compensación best-effort: si el objeto se sube y falla la metadata, o si falla la transacción de una sustitución, se intenta borrar solo el objeto nuevo. No hay transacción distribuida.
- Dos sustituciones del mismo id: `updateMany` condicionado a `id` y `estadoOperativo = OPERATIVO`. Una sola crea la fila nueva. La otra responde el 400 ya existente y compensa su objeto.
- Purga: si el objeto se borra o se confirma que no existe, se borra la fila (204). Un error real de storage conserva la metadata. Esto corrige el comportamiento anterior, que borraba la fila aunque Supabase fallara.
- Correcciones posteriores a la revisión de seguridad: no usar `ignoreNotFound` de GCS, porque un 404 también es "el bucket no existe"; distinguir objeto ausente y bucket ausente por el mensaje estable de cada SDK; un 404 ambiguo falla y conserva la fila; `asStorageError` no copia `statusCode` del SDK; el 409 de path duplicado sigue siendo el de `StorageConflictError`; la compensación no corre si la metadata ya se guardó y después falla el envío de la respuesta.

#### Validación humana

- La auditoría de solo lectura se revisó antes de implementar. El equipo aprobó la arquitectura de adaptadores, el default `supabase`, la ausencia de migración y el alcance de las compensaciones.
- La implementación completa se revisó en una revisión cruzada. El cambio de arquitectura fue aprobado, con la observación de que faltaba esta entrada.
- La persona responsable fijó las restricciones: no desplegar, no tocar IAM desde el código, no cambiar contratos HTTP de negocio y no presentar CL-07 como probado contra el bucket real.

#### Decisión adoptada

Quedó implementado en `feat/CCLF-21-gcs-files-adapter`, pendiente de integrar por PR:

- Adaptadores `SupabaseStorageProvider` y `GcsStorageProvider`, elegidos por `STORAGE_PROVIDER`.
- Render sin la variable sigue en Supabase. Staging puede arrancar con `gcs` y `GCS_BUCKET`.
- Compensación best-effort, sustitución condicionada y purga que conserva la fila ante un error real, un bucket inexistente o un 404 ambiguo.
- Errores inesperados del SDK normalizados como `StorageOperationError`, sin convertir su status en respuesta pública. El 409 de negocio se mantiene.

No está desplegado. No se ejecutó ninguna operación contra el bucket de GCS.

#### Evidencia / archivos relacionados

Verificado en la implementación, con los resultados informados al cierre:

- `npm test`: 96 suites, 3449 tests aprobados.
- `npm run typecheck` y `npm run build` correctos.
- `git diff --check` correcto.
- Tests de ambos adaptadores, de compensación, de sustitución concurrente, de purga (objeto ausente, bucket ausente, 404 ambiguo, permisos y metadata conservada) y HTTP (403 y 404 técnico del proveedor en 500 sin el mensaje interno; 409 de negocio intacto).
- Revisión cruzada favorable, con la observación documental que cubre esta entrada.

No verificado:

- Habilitar `iamcredentials.googleapis.com` y conceder `iam.serviceAccounts.signBlob` a `federala-web-sa` sobre sí misma. Sin eso, la URL firmada en Cloud Run no puede emitirse.
- Despliegue del servicio en Cloud Run con `STORAGE_PROVIDER=gcs`.
- Pruebas reales de subida, firma, sustitución y purga contra `federala-staging-files-28822223940`.
- CORS `GET`/`HEAD` del bucket para el origen real del frontend. La vista previa hace `fetch` de la URL firmada.
- El caso en que la compensación también falla: el objeto nuevo puede quedar huérfano. No hay job de reconciliación.

Archivos:

- `Backend/src/storage/object-storage.ts`
- `Backend/src/storage/supabase-storage.provider.ts`
- `Backend/src/storage/gcs-storage.provider.ts`
- `Backend/src/storage/index.ts`
- `Backend/src/services/file.service.ts`
- `Backend/src/controllers/file.controller.ts`
- `Backend/src/config/env.ts`
- `Backend/src/utils/safeErrorLog.ts`
- `Backend/tests/unit/storage/storage.providers.test.ts`
- `Backend/tests/unit/services/file.storage.test.ts`
- `Backend/tests/unit/security/files.storage-errors.routes.test.ts`
- `docs/architecture/backend.md`
- GitHub #288, CCLF-21 / CL-07
- `AI-DECISIONS.md`

### AI-028 — Vista de ventas por período (frontend) y estilo de la pantalla de Reportes

**Fecha:** 2026-11-24  
**Área:** Frontend / Reportes / Estilos  
**Herramientas:** Claude Code para relevar el contrato y el código, implementar y verificar en el navegador.

#### Problema

La subtarea 39.3 (CCLF-61) pedía la vista "Ventas por período", que hasta ahora era un marcador de
posición: la pantalla de Reportes cargaba el reporte con los últimos 30 días y mostraba solo la
cantidad de filas.

El reporte del backend (38.3, CCLF-54) ya estaba en main, pero el mock del frontend había quedado
desalineado: emitía `montoUSD` en cada fila, sin `moneda` ni `fraccionId`, y con `otrasMonedas`
siempre vacío. Con ese mock no se podía construir ni probar la vista.

CCLF-37 V4 no sirve como referencia para la fila de ventas: no la especifica y todavía dice
`montoUSD`.

#### Prompt / intención

Hacer 39.3 en etapas, cada una con su informe y sin commits:

1. Relevamiento de solo lectura del contrato, del mock, del cliente HTTP y de la pantalla.
2. Alinear el mock de ventas con el backend ya mergeado.
3. Crear los componentes compartidos (tarjeta de filtros, tarjeta de KPI, tarjeta de tabla) sin
   tocar la vista de inventario.
4. La vista de ventas.
5. y 5b. Acercar el estilo de la pantalla al boceto.

Condiciones: no consultar Supabase ni levantar el backend (se verifica con el mock y con un
servidor local que sirve sus datos por HTTP), mantener el baseline de lint (113 errores y 50
warnings) y reportar en lugar de aproximar lo que no se pudiera cumplir.

#### Propuesta generada por IA

- **Mock:** alinearlo contra `reporte.service.ts` y no contra la especificación. Derivar la moneda
  de cada venta de su plan en `PLANES` (USD si no tiene plan), emitir `moneda`, `monto` y
  `fraccionId` en la fila, separar las tarjetas por moneda y llenar `otrasMonedas`. Exigir el
  estado además de la fecha en escrituradas y canceladas, como hace el backend. Sumar dos ventas
  en ARS y una sin plan, con sus planes sin cuotas impagas para no alterar el reporte de cuotas
  vencidas.
- **Componentes:** `FiltrosReporte`, `TarjetaKpi` y `TarjetaTabla` como archivos nuevos todavía sin
  consumidores, y `periodo.js` con `validarPeriodo`, que repite las reglas del validador del
  backend para deshabilitar "Generar" antes de gastar un 400.
- **Vista:** `aplicados` arranca en `null` y no se consulta nada hasta pulsar Generar; un objeto
  nuevo en cada clic, para que dos clics con los mismos filtros sean dos consultas; una fila por
  venta; tarjetas en USD y las otras monedas en un aviso aparte.
- **Verificación:** instancias propias de Vite en puertos que no pisan los del equipo, Chrome
  headless por CDP y un servidor local que importa el mock y lo sirve por HTTP, para poder contar
  los requests y leer sus parámetros.

#### Validación humana

- **Alinear el mock contra el código y no contra la especificación.** La persona responsable
  aceptó esa propuesta sabiendo que CCLF-37 V4 sigue diciendo `montoUSD` y no define la fila de
  ventas: la especificación quedó desactualizada respecto del contrato implementado.
- **Dos errores de redacción en los prompts, detectados por la IA.** El de la etapa 3 pedía a la
  vez "las mismas clases que hoy" y "prefijo `reporte-`", que no pueden cumplirse juntas; se
  resolvió con la misma estructura de marcado y clases nuevas, de modo que el estilo del boceto no
  tocara la vista de inventario. El de la etapa 4 pedía el ámbar de la variante `warn` de
  `TablaLotes.css`, que define el texto en `#FBBF24` sobre fondo claro: la IA avisó que es
  ilegible en un párrafo y se usó la paleta `warn` de `StatusBadge.jsx` de Ventas, que ya está en
  el código y tiene el texto oscuro.
- **Mayúsculas de las insignias.** `.tl-badge` fuerza `text-transform: uppercase`, que corresponde
  a un estado de una o dos palabras, y el rótulo "+3 vs. anterior" se veía "+3 VS. ANTERIOR".
  Primero se acotó una regla a la cabecera de la tarjeta; después las pastillas de diferencia
  pasaron a clases propias.
- **Color de ESCRITURADO.** El prompt pedía verde. La IA avisó de que la tabla de Ventas lo muestra
  en violeta y que reserva el verde para FINALIZADA. Se decidió usar violeta, apartándose del
  boceto, para que el mismo estado no tenga dos colores en la aplicación.
- **Cambio de criterio sobre la fidelidad al boceto.** El criterio inicial era mover solo la
  disposición, sin tocar tokens. Al ver el resultado, la persona pidió acercar el estilo, y se
  revirtieron dos recortes previos: el selector de reporte pasó de un `<select>` a chips, y se
  adoptaron los colores y el radio de 20px del boceto como variables locales de `.reportes-panel`,
  sin tocar `tokens.css`. El fondo `#f3f5f2` se aplica con `.app-content:has(.reportes-panel)`, de
  modo que no se filtra a otras rutas; se midió en `/`, `/ventas` y `/map`.
- **Dos cambios no pedidos, reportados por la IA y aceptados:** `flex: 1 1 auto` en `.app-content`,
  porque sin eso el fondo cortaba a mitad de pantalla en un reporte corto, y el título de la
  pantalla de `<h5>` a `<h1>`.
- **Decisiones de producto contra el boceto:**
  - Una fila por venta con sus tres fechas, en lugar de una fila por evento: el boceto obligaría a
    duplicar en la interfaz las reglas de conteo que ya tiene el backend.
  - "N ventas" en lugar de "Mostrando X de Y": ninguna lista del contrato está paginada, así que X
    siempre sería igual a Y.
  - El período viene precargado con los últimos 30 días, pero no se consulta nada hasta pulsar
    Generar.
  - La interfaz no calcula cifras. La única excepción es la diferencia entera de cantidades del
    rótulo "+N vs. anterior", que son dos números que el backend informa por separado.
- **Un diagnóstico equivocado, corregido con el código.** Ante una captura con "ARS 18.000,00" en
  el reporte y "US$ 18.000" en la ficha de la venta, se sospechó que el backend rotulaba mal la
  moneda. La verificación contra `pago.service.ts` —el total del plan tiene que coincidir con
  `Venta.monto` menos la seña, sin conversión— mostró que `Venta.monto` está en la moneda del plan
  y que el reporte es correcto: la inconsistencia está en `VentaVerCard`, que muestra "US$" fijo.

#### Decisión adoptada

- `reportes.mock.js` emite la fila del contrato de 38.3 (`moneda`, `monto` y `fraccionId`, sin
  `montoUSD`), las tarjetas solo con las ventas en USD y el resto en `otrasMonedas`; escrituradas
  y canceladas exigen el estado además de la fecha.
- `VistaVentas.jsx`: filtros con período obligatorio, tres tarjetas comparadas contra el período
  anterior, aviso de otras monedas y tabla de una fila por venta. No consulta hasta Generar y cada
  clic es una consulta.
- Componentes compartidos `FiltrosReporte`, `TarjetaKpi` y `TarjetaTabla`, y `periodo.js` con
  `validarPeriodo` y `MAX_DIAS_PERIODO`.
- `fmtMontoMoneda` en `etiquetas.js` para los montos en la moneda que informa el backend;
  `fmtPrecioUsd` pasa a usarlo sin cambiar lo que ve el inventario.
- `VARIANTE_ESTADO_VENTA` con `violet` para ESCRITURADO.
- Estilo de la pantalla: chips en lugar del `<select>`, breadcrumb y título, variables locales con
  los valores del boceto y fondo condicionado por `:has()`.
- El inventario comparte las clases de la tarjeta de filtros, pero sigue con su propio formulario.

#### Evidencia / archivos relacionados

Verificado:

- Mock: `getCuotasVencidas` y `getInventario` devuelven exactamente lo mismo que antes del cambio
  (comparación del JSON completo); los conteos de las tarjetas coinciden con los que el script
  recalcula sobre las filas, por moneda; la regla del estado se probó sobre copias parcheadas del
  mock, fuera del repositorio.
- Funciones puras en Node: `fmtMontoMoneda`, `fmtPrecioUsd` (los mismos resultados que la
  implementación anterior en 15 casos), `validarPeriodo`, `etiquetaEstadoVenta` y las fechas.
- En Chrome headless: 0 requests al abrir la vista, 1 al pulsar Generar y 2 en el segundo clic;
  tarjetas 6 / 2 / 2 con sus montos; aviso de ARS; 9 filas; `fraccion=12` en el request; período
  inválido sin consultar; el error del endpoint se muestra y no queda el spinner.
- Estilo: valores del boceto medidos con `getComputedStyle`, y el fondo medido en `/`, `/ventas` y
  `/map` para confirmar que no se filtra.
- El inventario sigue filtrando igual y mandando el id de la fracción y el valor del enum.
- `npm run lint` queda en el baseline (113 errores y 50 warnings) y `npm run build` pasa.

No verificado:

- Nada se probó contra el backend real: toda la verificación usó el mock, directamente o servido
  por HTTP desde un servidor local.
- El frontend no tiene infraestructura de tests: los scripts de verificación no se versionaron.

Riesgos y deuda:

- Las tarjetas principales informan solo USD y la tabla trae todas las monedas. Si una vista no
  mostrara `otrasMonedas`, la diferencia se leería como un error.
- El reporte muestra "Escriturada" donde la tabla de Ventas muestra FINALIZADA, que no está en el
  enum y no se puede derivar de la fila.
- El formato "USD 18.000,00" difiere del "US$" de la ficha de la venta, que usa `fmtMonto` de
  `pagoUtils.js`.
- Las cancelaciones pueden estar subcontadas, porque `cancelActivesOnNoDisponible` no setea
  `fechaCancelacion` (ya señalado en AI-020).
- El inventario no usa `FiltrosReporte` —solo comparte sus clases— y su tabla no está dentro de
  `TarjetaTabla`.
- Del boceto quedaron sin hacer la barra apilada por fracción, las cinco tarjetas con puntos, la
  hora del corte y la columna Superficie: el contrato no trae esos datos.

Archivos:

- `frontend/src/components/Reportes/VistaVentas.jsx`
- `frontend/src/components/Reportes/FiltrosReporte.jsx`
- `frontend/src/components/Reportes/TarjetaKpi.jsx`
- `frontend/src/components/Reportes/TarjetaTabla.jsx`
- `frontend/src/components/Reportes/periodo.js`
- `frontend/src/components/Reportes/etiquetas.js`
- `frontend/src/components/Reportes/Insignias.jsx`
- `frontend/src/components/Reportes/VistaInventario.jsx`
- `frontend/src/lib/api/reportes.mock.js`
- `frontend/src/lib/api/reportes.js`
- `frontend/src/lib/fechas.js`
- `frontend/src/pages/Reportes.jsx`
- `frontend/src/pages/Reportes.css`
- Jira CCLF-61 (39.3), CCLF-37 (especificación) y CCLF-54 (38.3, AI-020)
- `AI-DECISIONS.md`


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
