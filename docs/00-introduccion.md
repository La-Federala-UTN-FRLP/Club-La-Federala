# Documentación del sistema

`docs/` es la Knowledge Base viva y versionada del Sistema de Gestión de Información de Lotes del Club de Campo La Federala. Es la única fuente documental activa del repositorio: no crear `knowledge-base/`, `wiki/` ni otra carpeta paralela.

El [README](../README.md) presenta el producto y la navegación inicial. El seguimiento operativo vive en GitHub Projects; no duplicar el backlog dentro de `docs/` salvo que aporte trazabilidad real.

## Organización

- [`domain/`](domain/glosario.md): conceptos, actores, reglas y flujos del negocio.
- [`requirements/`](requirements/requisitos-funcionales.md): requisitos y trazabilidad.
- [`use-cases/`](use-cases/casos-uso-principales.md): casos de uso.
- [`architecture/`](architecture/overview.md): arquitectura actual, riesgos y decisiones.
- [`architecture/adr/`](architecture/adr/001-estructura-documentacion.md): decisiones arquitectónicas importantes.
- [`development/`](development/setup-local.md): puesta en marcha, convenciones y [estrategia de ramas](development/git-flow.md).
- [`AI-DECISIONS.md`](../AI-DECISIONS.md): registro obligatorio de usos relevantes de IA que afecten código, arquitectura, seguridad o decisiones técnicas.
- [OpenAPI existente](../Backend/documents/documentacionApi.yaml): contrato HTTP pendiente de reconciliación exhaustiva con la implementación actual antes de volver a considerarlo contrato oficial.
- [`Documentacion/`](../Documentacion/README.md): documentación histórica; no es la Knowledge Base activa.

## Transición y mantenimiento

Actualizar `docs/` al modificar reglas, endpoints, casos de uso, entidades o decisiones. Evitar duplicar lo evidente en código: documentación mínima, útil, viva y con Git. Conservar `Documentacion/` sin cambios durante la consolidación, salvo decisión explícita.

## Baseline de auditoría 2026

La auditoría interna del 02/09/2026 establece que el producto es un MVP funcional, pero el backend aún no es production-ready ni Cloud-ready. Esta documentación no debe presentar como resueltos los riesgos de seguridad, runtime, calidad u operabilidad hasta que existan cambios revisados y evidencia de validación. Las decisiones posteriores a ese baseline se registran en ADRs, sin reescribir los entregables históricos.
