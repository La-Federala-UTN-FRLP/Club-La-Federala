# Documentación del sistema

`docs/` es la referencia viva y versionada del Sistema de Gestión de Información de Lotes del Club de Campo La Federala. Registra contexto de negocio, trazabilidad y decisiones técnicas para facilitar mantenimiento real.

## Organización

- [`domain/`](domain/glosario.md): negocio, actores, reglas y flujos.
- [`requirements/`](requirements/requisitos-funcionales.md): requisitos y trazabilidad.
- [`use-cases/`](use-cases/casos-uso-principales.md): casos de uso.
- [`architecture/`](architecture/overview.md): arquitectura, datos y ADR.
- [Contrato de API (OpenAPI)](../Backend/documents/documentacionApi.yaml): fuente de verdad de la API HTTP.
- [`development/`](development/setup-local.md): puesta en marcha y convenciones.

## Transición y mantenimiento

`Documentacion/` es el antecedente histórico y permanece sin cambios durante la consolidación. Actualizar `docs/` al modificar reglas, endpoints, casos de uso, entidades o decisiones. Evitar duplicar lo evidente en código: documentación mínima, útil, viva y con Git.

## Baseline de auditoría 2026

La auditoría interna del 02/09/2026 establece que el producto es un MVP funcional, pero el backend aún no es production-ready ni Cloud-ready. Esta documentación no debe presentar como resueltos los riesgos de seguridad, runtime, calidad u operabilidad hasta que existan cambios revisados y evidencia de validación. Las decisiones posteriores a ese baseline se registran en ADRs, sin reescribir los entregables históricos.
