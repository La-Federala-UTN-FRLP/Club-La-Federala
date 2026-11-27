# Borrador AI de P1 — sin numeración reservada

Complemento de AI-042 propuesto para consolidación humana; AI-DECISIONS.md central permanece
intacto y su numeración debe reconsultarse antes de una futura publicación. No editar PR #373.

### AI-XXX — Identidad IP experimental del limitador de login para G4

**Fecha:** 2026-11-27
**Área:** Backend / seguridad / Cloud Run / G4
**Herramientas:** Codex, Orca CLI, Git, GitHub CLI en lectura, Node24, TypeScript y Jest

#### Problema

C1 no tiene evidencia de una identidad de cliente confiable en el ingreso administrado de Run.
El limitador usa estado por proceso y conservaba un supuesto incorrecto sobre instancia única.

#### Prompt / intención

El coordinador autorizó exclusivamente P1: implementar y validar localmente un helper del login,
modo explícito inactivo por defecto, bucket unverified, logs saneados, documentación y commits;
preparar un borrador de PR sin publicar ni operar staging.

#### Propuesta generada por IA

Mantener legacy como default y trust proxy=false. Evaluar el sufijo derecho XFF solo como candidato
condicionado a H1; rechazar ambigüedad/duplicación recibida por Node y conservar un bucket
unverified constante separado. Mantener política/contrato del limiter y retirar datos de red del log.

#### Validación humana

P1 fue autorizado expresamente por el coordinador. No aprobó H1, C1, publicación, despliegue,
instrumentación ni activación. Otra persona deberá revisar los cambios antes de integración.

#### Decisión adoptada

Implementado localmente en rama independiente desde 058a648a, sin modificar configuración cloud.
Node24: typecheck/build PASS; cuatro suites focalizadas 82 PASS; regresión 105 suites/3837 PASS,
0 fallidas y 0 omitidas. Las focalizadas se incluyen en ese total. Los 21 escenarios son locales,
incluidos headers duplicados reales de Node, no pruebas del ingreso de Run. C1 sigue BLOQUEADO.
No se aceptan por inferencia los riesgos residuales de H1 ni de estado efímero/NAT.

#### Evidencia / archivos relacionados

- [Informe P1 y matriz L01–L21](../c1-login-ip-experiment.md).
- Backend/src/utils/loginClientIp.ts y middleware/config/tests asociados.
- Refs #290 y #302; sin cierre automático ni publicación de PR.
- Referencia AI-042; eventual número nuevo pendiente de consolidación, sin colisión con G5.
