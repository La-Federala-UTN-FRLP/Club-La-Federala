# ADR-003 - Adoptar el baseline de auditoría técnica 2026

## Estado
Aceptada

## Contexto

La auditoría interna del 02/09/2026 confirma un MVP funcional con React, Express, Prisma y PostgreSQL, pero identifica riesgos abiertos de autorización, PII, CORS, logs, empaquetado de producción, cron, TypeScript, pruebas y operabilidad.

## Decisión

Usar el informe como baseline técnico para decisiones posteriores. Se conserva la arquitectura base y la documentación histórica; los cambios futuros se registran en ramas pequeñas, PRs revisados y ADRs, sin afirmar readiness productivo o Cloud hasta contar con evidencia verificable.

## Consecuencias positivas

- Evita reescrituras o migraciones prematuras.
- Hace explícitos los riesgos antes de ampliar alcance.
- Conserva trazabilidad entre auditoría, decisiones y cambios.

## Consecuencias negativas

- El equipo debe validar y priorizar los hallazgos antes de implementarlos.
- Este ADR no sustituye pruebas ni corrige los riesgos señalados.

## Alternativas consideradas

- Continuar incorporando cambios sin baseline común.
- Reescribir el producto antes de estabilizar la base existente.

## Fecha
2026-09-03
