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
