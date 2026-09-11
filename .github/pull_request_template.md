## Qué problema resuelve

<!-- Una o dos oraciones. Si no hay Issue, igual describí el motivo del cambio. -->

## Qué se cambió

<!-- Resumen del alcance. Ejemplos de área: Lote, Reserva, Oferta, Venta, Pago, Persona, Inmobiliaria, Prioridad, Archivos, Auth, Frontend, Backend, Infra, Docs. -->

-

## Por qué esta solución

<!-- Completar cuando haya más de un enfoque razonable o una decisión no obvia. Si el cambio es directo, se puede omitir. -->

## Cómo se validó

<!-- Qué comandos, pruebas o revisiones se ejecutaron. Distinguir fallos preexistentes de regresiones de este PR. No afirmar que el CI global está verde si el baseline sigue en rojo. -->

-

## Limitaciones

<!-- Deuda, alcance recortado, riesgos conocidos o seguimiento pendiente. Si no hay, indicarlo. -->

## Documentación afectada

<!-- docs/, ADR, README, CONTRIBUTING, AI-DECISIONS.md u otro. Si no aplica, indicarlo. -->

## Issue relacionado

<!-- Opcional: completar solo si existe un GitHub Issue. Issues no son obligatorios. -->
<!-- Si aplica: Closes #123 -->

---

## Checklist del autor

- [ ] La rama parte de `main` actualizado y tiene un único propósito
- [ ] Los commits siguen `tipo(scope): descripción`
- [ ] No incluí secretos, `.env` ni archivos ajenos a la tarea
- [ ] Documenté las validaciones ejecutadas y el resultado
- [ ] Actualicé documentación o ADR si el comportamiento o una decisión cambió
- [ ] Si usé IA de forma relevante (código, arquitectura, seguridad o decisión técnica), lo registré en `AI-DECISIONS.md`
- [ ] Actualicé el tablero de GitHub Projects (Backlog / In Progress / Review / Done)

### Configuración y seguridad

<!-- Marcar solo lo que aplique al cambio. -->

- [ ] No expuse credenciales, tokens ni URLs con secretos
- [ ] Revisé impacto de autorización / datos personales si el cambio toca Auth, Persona, Inmobiliaria o archivos

---

## Checklist del reviewer

- [ ] El alcance coincide con lo que describe el PR
- [ ] Revisé las validaciones o la evidencia indicada
- [ ] No hay cambios ajenos a la tarea
- [ ] Las conversaciones relevantes del PR están resueltas
