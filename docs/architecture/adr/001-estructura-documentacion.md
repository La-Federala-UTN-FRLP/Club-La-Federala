# ADR-001 - Documentación versionada dentro del repositorio

## Estado
Aceptada
## Contexto
El conocimiento estaba distribuido entre código y entregables históricos bajo `Documentacion/`, mayormente binarios.
## Decisión
Crear `docs/` en Markdown por dominio, requisitos, casos de uso, arquitectura, API y desarrollo; conservar `Documentacion/` sin cambios durante la transición.
## Consecuencias positivas
- Versionado con Git y revisión por Pull Request.
- Cercanía al código y menor pérdida de contexto.
- Trazabilidad entre necesidad, requisito, caso de uso, implementación y prueba.
## Consecuencias negativas
- Requiere actualización como parte de cada cambio.
- Coexistencia temporal con el histórico.
## Alternativas consideradas
- Mantener únicamente PDFs externos.
- Documentar solo mediante comentarios de código.
## Fecha
2026-09-02
