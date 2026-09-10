# Flujo de trabajo con Git

La rama principal es `main`. Crear ramas cortas, de un único objetivo, desde una base actualizada; abrir Pull Request y realizar revisión cruzada antes de mergear.

Ejemplos de nombres: `feature/documentacion-inicial`, `feature/login-usuarios`, `fix/error-validacion-formulario` y `docs/casos-uso`.

- Usar Conventional Commits, por ejemplo `docs: agrega trazabilidad de reservas`.
- Una tarea/issue pequeña por rama y PR; evitar ramas personales largas o commits acumulados.
- Gestionar prioridad, responsable, dependencia y límite WIP en GitHub Projects cuando el equipo formalice el backlog.
- Antes del PR revisar Git, enlaces Markdown y validaciones aplicables; quien realizó el cambio no aprueba su propio PR.
- Actualizar `docs/` al cambiar reglas, endpoints, casos de uso o decisiones.
- No modificar `Documentacion/` en esta consolidación sin decisión explícita.
- Registrar decisiones de arquitectura nuevas mediante ADR y usos relevantes de IA que afecten código o arquitectura en `AI-DECISIONS.md` cuando el equipo habilite ese flujo.
