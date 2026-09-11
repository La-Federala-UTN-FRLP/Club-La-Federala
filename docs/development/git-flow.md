# Estrategia de ramas (GitHub Flow)

La Federala utiliza un **GitHub Flow liviano**: `main` es la única rama estable y cada cambio vive en una rama corta que se integra mediante Pull Request.

No utilizamos GitFlow clásico (`main` + `develop` + `release/*` + `feature/*` + `hotfix/*` como modelo permanente).

## Por qué no GitFlow clásico

GitFlow es una estrategia válida para productos con ciclos de release paralelos, varias líneas de mantenimiento o un equipo que necesita congelar versiones con frecuencia.

En La Federala, hoy no aporta ese valor:

- el equipo es pequeño;
- hay una aplicación principal;
- el trabajo es incremental;
- el costo de sincronizar `develop`, `release/*` y `hotfix/*` sería mayor que el beneficio;
- los cambios entran a `main` mediante Pull Request, revisión cruzada y validaciones pertinentes, sin *direct pushes*; la branch protection de GitHub todavía debe configurarse.

Por eso no existe una rama permanente `develop`. Tampoco se usan ramas personales (`nico`, `santi`, `agus`, `backend`, `frontend`) como línea de desarrollo. La rama identifica el **cambio**, no a la persona.

## Rol de `main`

`main` representa la versión integrada más confiable conocida del producto.

Eso no implica ausencia de deuda técnica. Sí implica que `main` no debe recibir:

- desarrollo incompleto;
- experimentos;
- cambios sin revisión;
- cambios sin validación pertinente;
- *direct pushes*.

Los cambios entran mediante Pull Request. `main` debe quedar técnicamente protegida en GitHub; esa branch protection todavía debe configurarse.

## Convención de ramas

Cada rama debe tener un único propósito, vida corta y origen en `main` actualizado.

Prefijos:

- `feature/<descripcion>`
- `fix/<descripcion>`
- `docs/<descripcion>`
- `refactor/<descripcion>`
- `test/<descripcion>`
- `chore/<descripcion>`
- `ci/<descripcion>`
- `perf/<descripcion>`
- `experiment/<descripcion>`

Ejemplos válidos: `fix/ventas-ownership`, `fix/lotes-pii`, `docs/repository-governance`, `chore/backend-production-start`, `test/backend-suite-alignment`, `ci/backend-quality-gates`, `feature/reportes-resumen`, `experiment/cloud-run-poc`.

El número de GitHub Issue no forma parte obligatoria del nombre.

## Integración

El camino esperado es:

1. rama corta desde `main`;
2. Pull Request hacia `main`;
3. revisión de otra persona;
4. validaciones pertinentes al cambio;
5. **Squash & Merge**.

Squash & Merge deja en `main` un commit conceptual por PR. Quien implementó el cambio no aprueba su propio Pull Request.

## Seguimiento del trabajo

GitHub Projects se utiliza para el seguimiento del trabajo: forma parte de los estándares de ingeniería del TPI Cloud 2026. No es opcional.

El tablero es un Kanban simple, adecuado al tamaño del equipo:

- Backlog
- In Progress
- Review
- Done

Límite WIP inicial: **máximo una tarea principal In Progress por integrante**.

GitHub Issues siguen siendo opcionales. No es obligatorio asociar cada rama a un Issue ni incluir el número de Issue en el nombre de la rama. Un PR puede usar `Closes #123` cuando el Issue exista y aporte trazabilidad real.

La estrategia de ramas no cambia: GitHub Flow con ramas cortas hacia `main`.

No se utiliza Jira.

## Commits

Usamos [Conventional Commits](https://www.conventionalcommits.org/) con **scope obligatorio**, validado por `.githooks/commit-msg`:

```text
tipo(scope): descripción
```

Ejemplos: `fix(ventas): restringe acceso entre inmobiliarias`, `docs(git): documenta estrategia de ramas`, `test(reservas): actualiza escenarios de expiración`, `ci(backend): agrega quality gates`.

Tipos aceptados: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `build`, `ci`, `perf` y `revert`.

## Validaciones y CI

El baseline de auditoría 2026 registra quality gates preexistentes en rojo. Durante la transición **no** se afirma que el CI completo esté verde ni que todos los checks globales sean obligatorios para merge.

Antes de abrir un PR:

- ejecutar las validaciones pertinentes al cambio;
- documentar qué se ejecutó;
- diferenciar fallos preexistentes de regresiones introducidas por el PR.

Cuando TypeScript, tests y build estén saneados, se habilitarán status checks obligatorios sobre `main`. Hasta entonces, la revisión humana debe considerar el alcance real del cambio.

## Experimentos

`experiment/*` es excepcional y temporal. Sirve para probar una hipótesis técnica sin afirmar que sea arquitectura final. Ejemplo: `experiment/cloud-run-poc`.

Un experimento debe terminar en una de estas salidas:

- aprendizaje → decisión o ADR → implementación limpia en una rama normal (`feature/*`, `fix/*`, `chore/*`, etc.);
- experimento descartado.

No se mantienen ramas experimentales de forma permanente ni se mergean a `main` como arquitectura definitiva.

## Checkpoints y releases

Los checkpoints y entregas importantes se identifican mediante tags sobre commits ya validados de `main`. Ejemplos conceptuales: `checkpoint-1-2026`, `checkpoint-2-2026`, `final-2026`.

Las ramas `release/*` solo deberían usarse si aparece una necesidad real de congelar una versión mientras `main` sigue evolucionando.

## Documentación

Actualizar `docs/` cuando cambie una decisión, una regla o un comportamiento observable. Registrar decisiones arquitectónicas importantes como ADR en `docs/architecture/adr/`.

`AI-DECISIONS.md`, en la raíz del repositorio, es obligatorio para el TPI Cloud 2026. Registra usos relevantes de IA que afecten código, arquitectura, seguridad o decisiones técnicas. Cada entrada debe evidenciar el problema abordado, el prompt o la herramienta, la propuesta generada y la validación o corrección humana.
