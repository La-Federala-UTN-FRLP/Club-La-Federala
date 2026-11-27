# C1 — Identidad IP experimental del login (P1 local)

Fecha: 2026-11-27. Base canónica: `058a648a5d8d0f4456b43fdfaeab35e0a0449735`.
Commit de código y pruebas: `13ce4e700a0a0a87b00ba63a1cbd5e2d6446a67d`.
Estado: **implementado y validado localmente; H1 pendiente; C1 BLOQUEADO; C3 pendiente; T5 no iniciado**.
Refs #290 y #302. PR #375 y #376 ya integradas; esta preparación no modifica esas PRs.

## Alcance y autorización

El coordinador autorizó P1: rama/worktree independientes, código experimental inactivo por defecto,
pruebas locales, documentación, commits y borrador de PR. No autorizó publicación de la rama/PR,
despliegue, tráfico a staging, instrumentación remota, activación ni aprobación de C1.
Se preservan `origin`, main local y los demás worktrees. No se agregan dependencias versionadas.

## Contrato y comportamiento

H1 es la hipótesis de que el ingreso directo administrado de Run agrega al final de XFF una
dirección observada del peer, después de todo contenido suministrado por el cliente, sin otro
intermediario posterior. **El código y los tests no demuestran H1.** La muestra oficial de Google
con `trust proxy=1` es un antecedente, no una garantía normativa de sanitización y duplicados.
No se extrapolan contratos de ALB propio, Functions, App Engine ni Render.

`LOGIN_CLIENT_IP_MODE=legacy|cloud-run-direct` se valida al arrancar. Ausente o vacío conserva
`legacy`; `NODE_ENV` y `K_SERVICE` no seleccionan el modo. No se agrega la variable a manifiestos,
Docker, `.env`, CI o infraestructura. Valores inválidos y combinación Run/RENDER=true se rechazan.

En `legacy`, se conserva la resolución actual (incluida la rama heredada de Render). En el modo
Run experimental, solo el sufijo derecho XFF se trata como **candidato condicionado a H1**.
El helper puro no selecciona otro header ni busca una IP válida más a la izquierda. No altera
`trust proxy`, `req.ip`, `hostname` ni `protocol` globales. El peer observado corresponde a una
salida de red, no a una persona detrás de NAT/VPN.

Se admiten IPv4/IPv6 válidas y whitespace HTTP SP/HTAB. Se rechazan sufijos con puerto, comillas,
zone ID, formato inválido y controles. Arrays y duplicación observada en `rawHeaders` son ambiguos.
Node puede combinar duplicados en `headers`; la comprobación no asume que siempre sean arrays.
Esto detecta lo recibido por Node, no reconstruye duplicados ya combinados por intermediarios.

`ipKeyGenerator(...,56)` normaliza IPv4-mapped y agrupa IPv6 por /56. Los candidatos usan un
namespace propio; ausentes/inválidos/ambiguos usan el bucket constante `unverified`, separado.
Ese fallback no acredita identidad ni una cuota por cliente. Su semántica de cupo compartido y
disponibilidad necesita aceptación antes de activar; no se interpreta como éxito de C1.

Se mantienen 10 fallos/15min, MemoryStore, descuento de éxitos, orden y respuesta 429. El log del
limiter contiene únicamente evento, status y ruta fija: no IP/subred/key, URL, headers ni cuerpo.
No se modifica JWT/RBAC/CORS, rutas, OpenAPI ni transporte frontend. Los logs propios de plataforma
son un control independiente y no se afirma su saneamiento por este cambio.

## Casos ejecutados localmente

Todos los escenarios L01–L21 se ejecutaron en Node **v24.22.3**, con mocks o servidores loopback.
`login.client-ip.test.ts` y `login.client-ip.http.test.ts` están en
`Backend/tests/unit/security/`; la regresión de la app real está en `login.rate-limit.test.ts`.

| ID | Evidencia local / resultado PASS |
| --- | --- |
| L01 | Legacy ignora headers de cliente y detección implícita de Run. |
| L02 | Mismo socket con sufijos A/B distintos separa candidatos bajo H1 sintética. |
| L03 | Prefijos variables conservan el mismo candidato derecho. |
| L04 | Sufijo inválido no selecciona una entrada anterior válida. |
| L05 | Ausente, vacío y trailing comma producen unverified estable. |
| L06 | Arrays/rawHeaders duplicados ambiguos; HTTP real de Node combina valores y conserva nombres raw. |
| L07 | IPv4 válida; rechazo de puerto, forma no canónica, comillas y zone ID; trim HTTP acotado. |
| L08 | IPv4-mapped y variantes IPv6 equivalentes normalizan. |
| L09 | Dentro de /56 comparte; fuera separa. |
| L10 | Usuarios bajo la misma NAT comparten bucket deliberadamente. |
| L11 | Cambio de egreso cambia bucket: no es identidad persistente de persona. |
| L12 | Socket ausente/variable no altera candidato ni genera fallback aleatorio. |
| L13 | req.ip, otros headers, email y usuario no sustituyen el candidato. |
| L14 | Proxy adicional/ausencia de H1 evidencia la limitación del parser; no prueba topología. |
| L15 | Defaults en development/test/production; enum inválido y conflicto Render/Run rechazados. |
| L16 | HTTP local conserva trust proxy=false, hostname/protocol y rutas ajenas sin limiter. |
| L17 | Diez fallos, 429 posterior, éxitos descontados, B independiente y expiración con reloj simulado. |
| L18 | Stores independientes y reemplazo de store que simula reinicio muestran pérdida de estado. |
| L19 | Éxitos pendientes consumen temporalmente cupo; al completar lo restituyen. |
| L20 | Logs fijos y funciones puras sin datos de red, credenciales ni entradas manipuladas. |
| L21 | Inputs extremos/controles sin excepción; servidor Node real rechaza headers fuera de su límite local. |

La prueba del parser usa un límite local explícito para verificar rechazo previo al helper;
no modifica el servidor de aplicación ni afirma cuál es el límite efectivo del ingreso Run.
L18 simula sustitución del estado de proceso mediante stores independientes: no se reinició Run.
La prueba L14 registra deliberadamente que, sin H1, un parser sintáctico no autentica procedencia.

## Verificaciones y resultados

Entorno nuevo, dependencias exactas del lockfile y Node24 aislado; variables de generación Prisma
sintéticas. No se leyeron `.env` privados ni se conectó DB, storage, IA o staging.

| Verificación | Resultado |
| --- | --- |
| `npm.cmd ci --ignore-scripts --no-audit --no-fund` | Exit 0, lockfile intacto. |
| `npm.cmd rebuild @prisma/client --foreground-scripts` | Exit 0; completa el postinstall local omitido. |
| `npm.cmd run build` | Exit 0 tras preparar Prisma; genera solo archivos locales ignorados. |
| `npm.cmd run typecheck` | Exit 0: aplicación y tests. |
| Cuatro suites focalizadas de identidad/limiter | **82 PASS, 0 FAIL, 0 omitidas**. |
| Regresión unitaria/HTTP ampliada | **105 suites, 3837 PASS, 0 FAIL, 0 omitidas**. |
| `git diff --check` | Exit 0. |

La regresión ampliada incluye security, app, openapi, services, routes, middlewares, utils,
config, validations, domain, architecture, storage y runtime. Excluye integration/DB y jobs.
Las 82 focalizadas están incluidas en las 3837: no se suman. Se agregan 48 pruebas frente a la
selección anterior de 3789; no se detectaron regresiones persistentes en esta selección.
No se certifica CI global, imagen desplegada ni QA cloud.

Incidencia de preparación: build/typecheck iniciales devolvieron TS2305 por falta del stub
Prisma omitido con ignore-scripts. Se completó postinstall y ambos pasaron, sin cambiar Pagos,
schema, lockfile o dependencias. Las advertencias LF/CRLF de Git no son errores de diff --check.

## Revisión, riesgos y activación

La evidencia local prueba determinismo, aislamiento del cambio y política bajo entradas
sintéticas. No demuestra que un cliente remoto no pueda controlar el sufijo: esa garantía
depende de H1. El modo no debe activarse en una topología distinta o implícitamente por Run.

La selección humana de A es una propuesta de trabajo. No se aceptaron definitivamente NAT,
agrupamiento /56, estado efímero, separación por proceso/revisión, sobrepasos transitorios ni
disponibilidad del bucket degradado. Una instancia nominal única no conserva contadores.

Antes de autorizar P2 se requieren revisión humana de código, respaldo/decisión explícita sobre
H1, SHA/digest y despliegue observacional autorizados, diseño de instrumentación privada sin
IPs/headers/tokens, revisión del logging de plataforma, ventana exclusiva, operadores/redes,
casos, presupuesto y rollback. No se implementa instrumentación en P1. La observación no autoriza
activar el extractor: esa decisión debe separarse y basarse en resultados reales.

Hay un camino propuesto de prueba directa con IAM y headers separados para Google OIDC y JWT
de aplicación. No se ejecutó. El proxy local no sustituye prueba del camino directo.
El protocolo previo propone dos fases, hasta 48 requests y <=1/s, sin carga ni reinicios remotos;
requiere nueva autorización, incluida su ventana y estimación incremental de USD 1.

Reversión futura: volver a `legacy` mediante cambio autorizado o revertir el commit mediante
flujo revisado y restaurar artefacto previo si se desplegó. Legacy conserva su limitación detrás
del proxy; no habilita exposición pública. Los contadores perdidos no tienen restauración.
No se realiza push/PR, merge, cierre de issues ni cambio de Projects en P1.

## Gobernanza AI y fuentes

AI-001–AI-045 estaban ocupados al consultar main; PR #373 de G5 permanece fuera del alcance.
El [borrador AI sin número reservado](ai/C1-IP.md) complementa AI-042 y requiere consolidación
coordinada antes de publicar una PR; el registro central no se modifica concurrentemente.

- [Runtime Cloud Run](https://docs.cloud.google.com/run/docs/container-contract).
- [Muestra oficial Google](https://github.com/GoogleCloudPlatform/nodejs-docs-samples/pull/3586/files).
- [Express detrás de proxies](https://expressjs.com/en/guide/behind-proxies/).
- [Node24 HTTP y rawHeaders](https://nodejs.org/docs/latest-v24.x/api/http.html).
- [Normalización ipKeyGenerator](https://express-rate-limit.mintlify.app/reference/helpers).
- [Máximos de instancias](https://docs.cloud.google.com/run/docs/configuring/max-instances).
- [IAM y autenticación separada](https://docs.cloud.google.com/run/docs/authenticating/service-to-service).
