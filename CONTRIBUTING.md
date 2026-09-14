# Guía de contribución

Esta guía describe cómo preparar cambios para el Sistema de Gestión de Información de Lotes del Club de Campo La Federala. El detalle de la estrategia de ramas está en [`docs/development/git-flow.md`](docs/development/git-flow.md). El resto de decisiones y convenciones permanece en [`docs/`](docs/00-introduccion.md).

## Estrategia de ramas

`main` es la **única rama estable**. No existe `develop`.

No se realizan cambios directamente sobre `main`. Cada aporte vive en una rama corta, de un único propósito, creada desde `main` actualizado. La rama identifica el cambio, no a la persona: no usar ramas personales permanentes (`nico`, `santi`, `agus`, `backend`, `frontend`).

Prefijos:

- `feature/<descripcion>`
- `fix/<descripcion>`
- `docs/<descripcion>`
- `refactor/<descripcion>`
- `test/<descripcion>`
- `chore/<descripcion>`
- `ci/<descripcion>`
- `perf/<descripcion>`
- `experiment/<descripcion>` — solo para hipótesis técnicas temporales; ver [git-flow](docs/development/git-flow.md#experimentos)

Ejemplos: `fix/ventas-ownership`, `docs/repository-governance`, `feature/reportes-resumen`.

## Flujo de trabajo

1. Partir de `main` actualizado y crear una rama corta según el tipo de cambio.
2. Implementar un único objetivo, siguiendo las [convenciones de código](docs/development/convenciones-codigo.md).
3. Crear commits con Conventional Commits y scope obligatorio (ver abajo).
4. Ejecutar las validaciones pertinentes al cambio y anotar qué se ejecutó.
5. Abrir un Pull Request hacia `main`. Otra persona del equipo debe revisarlo.
6. Integrar con **Squash & Merge** cuando la revisión y las validaciones pertinentes estén en orden.

El seguimiento del trabajo se hace en **GitHub Projects** (requisito del TPI Cloud 2026), con columnas Backlog / In Progress / Review / Done y un límite WIP de una tarea principal In Progress por integrante.

GitHub Issues son opcionales. No hace falta asociar cada rama a un Issue ni poner el número en el nombre. Si el cambio cierra un Issue existente, usar `Closes #123` en el PR.

## Validaciones

Ejecutar solo las validaciones que correspondan a los componentes modificados. Documentar en el PR qué se corrió. Distinguir fallos preexistentes del baseline de auditoría 2026 respecto de regresiones introducidas por el cambio.

No afirmar que el CI completo está verde: varios quality gates globales siguen en rojo. Cuando TypeScript, tests y build estén saneados, `main` pasará a exigir status checks obligatorios.

Backend (si el cambio lo toca):

```bash
cd Backend
npm run build
npm test
```

Frontend (si el cambio lo toca):

```bash
cd frontend
npm run lint
npm run build
```

Para cambios exclusivamente documentales, revisar enlaces Markdown, coherencia con el comportamiento vigente y la estructura de los documentos afectados.

## Convención de commits

Los commits deben respetar el formato exigido por `.githooks/commit-msg`:

```text
tipo(scope): descripción
```

Ejemplos: `feat(reservas): agrega cancelación`, `fix(ventas): restringe acceso entre inmobiliarias`, `docs(git): documenta estrategia de ramas`.

Para activar el hook localmente, ejecutar una vez desde la raíz:

```bash
git config core.hooksPath .githooks
```

Los tipos aceptados son `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `build`, `ci`, `perf` y `revert`.

## Documentación

- Aplicar las [convenciones de código](docs/development/convenciones-codigo.md).
- Actualizar [`docs/`](docs/00-introduccion.md) cuando cambie una decisión, una regla o un comportamiento observable.
- Registrar decisiones de arquitectura importantes mediante ADR en [`docs/architecture/adr/`](docs/architecture/adr/001-estructura-documentacion.md).
- Registrar en [`AI-DECISIONS.md`](AI-DECISIONS.md) los usos relevantes de IA que afecten código, arquitectura, seguridad o decisiones técnicas: problema, prompt/herramienta, propuesta y validación humana.
- Conservar [`Documentacion/`](Documentacion/README.md) como material histórico; no modificarla sin una decisión explícita.
- El contrato OpenAPI en `Backend/documents/documentacionApi.yaml` existe, pero está pendiente de reconciliación con la API actual: no tratarlo todavía como contrato oficial validado.

## Checklist para Pull Requests

- [ ] La rama tiene un único propósito y un nombre descriptivo.
- [ ] Los commits cumplen `tipo(scope): descripción`.
- [ ] Ejecuté las validaciones aplicables y documenté el resultado, incluidos fallos preexistentes.
- [ ] No incluí secretos, archivos generados ni cambios ajenos a la tarea.
- [ ] Actualicé `docs/` o un ADR cuando el cambio lo requiere.
- [ ] Si el cambio usó IA de forma relevante, quedó registrado en [`AI-DECISIONS.md`](AI-DECISIONS.md).
- [ ] El PR explica el problema, el cambio, la validación y las limitaciones conocidas.
