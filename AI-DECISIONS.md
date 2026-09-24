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
