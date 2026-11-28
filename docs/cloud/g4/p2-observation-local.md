# C1/P2 — Instrumentación observacional local

Fecha de consolidación: 2026-11-27. Base: `4e1338ec6b5f425db8460a376327851c18d92211`, con P1
integrada por PR #377. Rama `feat/g4-login-ip-observer`.
Código y pruebas revisados en `5c26092e8e51ec08ab6e285d7da4c839a7231eca`.
**IMPLEMENTADA / PROBADA LOCALMENTE. Fase O NO EJECUTADA. H1 NO acreditada. C1 BLOQUEADO;
C3 pendiente; T5 no iniciado.** Refs #290 y #302, sin cierre automático.

## Arquitectura y alcance

El middleware se inserta solo en POST login, inmediatamente antes del limiter, seguido de
validación y controller. Examina sin modificar request, identidad, key, store, cuota, descuento
de éxitos, respuesta o headers. No agrega endpoints ni cambia globalmente trust proxy.
El matching existente de Express admite sus variantes de mayúsculas, slash final y query;
no se reemplaza por otro contrato de rutas. El parser JSON global sigue antes: JSON malformado
puede cortarse sin evento; JSON válido que no cumple esquema sí puede observarse antes de 400/429.

El helper P1 suministra solo candidato sintáctico. Se compara dirección completa canónica
contra el esperado de operador: IPv6 equivalente e IPv4-mapped se normalizan, pero NO se usa
el agrupamiento /56 del limiter. El reconocimiento mapped es el /96 exacto, no un prefijo
textual que pudiera colisionar con IPv6 nativas. Sin candidato válido, match es false.

La observación usa una tabla precargada por el operador, copiada/congelada y luego copiada a
un Map del proceso. El request solo puede presentar la capacidad de un caso existente; no
elige IP esperada, etiqueta, revisión o resultado, ni registra/rearma casos. Un selector
desconocido, repetido, ambiguo o usado no produce evento ni respuesta diagnóstica.

## Modelo de confianza

Se eligió igualdad ordinaria en memoria; no hay nonce/compromiso/hash de IP ni protocolo
criptográfico propio. Cada caso tiene una capacidad opaca de 32 bytes generada mediante el
CSPRNG estándar por el operador. El transporte es únicamente el header dedicado
`X-Login-Observation-Selector`; el selector nunca se registra ni aparece en el evento.
La sintaxis de 64 hex minúsculas no prueba entropía: obtenerla correctamente es una obligación
del operador. Los fixtures locales son deterministas y sintéticos, nunca valores operativos.

El valor esperado procede de una fuente de egreso independiente de XFF/socket/req.ip y de
la salida del observador. El servidor calcula match; claims expectedIp/hash/match del cliente
se ignoran. Esto impide una declaración unilateral o sobrescritura del esperado por el request.
No protege frente a robo de la capacidad o un operador/harness autorizado deshonesto que
falsee egreso o casos. La coincidencia NO autentica origen ni demuestra H1. Hace falta control
del harness, egreso independiente y contraste humano del camino real.

## Configuración: desactivada por defecto

| Entrada de operador | Contrato local implementado |
| --- | --- |
| LOGIN_OBSERVATION_ENABLED | Solo el literal `on` permite evaluar configuración. Ausente/off/otros valores deshabilitan. |
| LOGIN_OBSERVATION_CONFIG | JSON privado con startsAt, expiresAt, revision, maxEvents, cases; máximo 16384 caracteres. |
| LOGIN_CLIENT_IP_MODE | Para observar debe ser `legacy` explícito al iniciar y mantenerse así. El default general sigue legacy. |
| K_REVISION | Coincidencia exacta con revisión preaprobada; no activa la observación por sí sola. |
| startsAt/expiresAt | UTC canónico con milisegundos; ventana absoluta positiva de máximo 15 minutos. |
| maxEvents | Entero 1..24 por proceso; no coerción de strings. |
| cases | 1..24 entradas únicas caseLabel/selector/expectedIp. Etiquetas cerradas U1/U2 × N1/N2 × V1..V6. |

La configuración inválida deshabilita solamente el observador, sin volcar valores ni impedir
login. No se analiza JSON dormido cuando está apagado. No se activa por NODE_ENV/K_SERVICE,
por estar en Cloud Run ni por habilitar el extractor experimental. P2 no activa cloud-run-direct.
No se agrega configuración activa a .env, Docker, manifiestos, CI o recursos cloud.

## Límites, fallos y privacidad

Selección/consumo/reserva son síncronos, sin await. Máximo 24 intentos de sink y un uso por
selector por proceso. El mismo cupo cuenta match, mismatch y candidato inválido. No hay
reintentos, refunds de eventos ni cola ilimitada. El timer unref y guardias por request y antes
del sink controlan vencimiento absoluto, modo/revisión, clocks no finitos o regresivos, cupo
y disable irreversible durante esa instancia. Un límite monótono adicional acota vida activa.

La factory expone disable en código, sin control HTTP. Cambiar solo el opt-in de process.env
no rearma ni sustituye la configuración cacheada: apagar remotamente requiere el procedimiento
de configuración/artefacto autorizado. Un WebEnv nuevo es otro ciclo interno de confianza.
Errores del observador/config/getters/clock o sink no pasan a next(error), no se imprimen y
no interrumpen el pipeline. Una promesa rechazada deshabilita; login no la espera. Hasta 24
promesas pendientes son posibles. Un sink síncrono arbitrario sigue siendo código de confianza;
no se promete ejecución no bloqueante frente a código que bloquee deliberadamente el hilo.

El evento tiene exactamente ocho campos primitivos: caseLabel, revision, processId, source,
family, formatValid, duplicate y match. processId es UUID efímero, no PID/host/cuenta. La fuente
es xff-rightmost o none; familia ipv4/ipv6/none. El serializer elige campos explícitamente,
sin request/stack/error/contexto. No hay IP, socket, XFF, normalización, key, subred, hash,
selector, credencial, cuerpo ni token en los eventos o errores del código agregado.

La expiración limpia Map/timer, no borra físicamente copias en env, WebEnv congelado, revisiones,
archivos/backups ni emisiones ya iniciadas. Reinicio/réplica puede reutilizar capacidades y cupo
antes del mismo vencimiento. No hay garantía distribuida o persistente; el harness debe aplicar
el cupo global y detenerse por deriva de proceso/revisión. Los request logs administrados de Run
pueden retener remoteIp por separado; aquí no se modificaron y requieren revisión de privacidad.

## Pruebas locales ejecutadas: requisitos P2-01..21

Esta matriz corresponde al pedido actual P2, NO a la numeración P1 L01–L21. Las etiquetas O
permiten localizar las assertions en las tres suites nuevas; no afirman que toda variante
especulativa de la planificación O01–O35 haya sido ejecutada independientemente.

| Requisito P2 | Cobertura local ejecutada / PASS |
| --- | --- |
| 01 Default off | O01/O16; no lectura de candidato ni JSON dormido. |
| 02 Habilitación explícita | O02/O16–19; literal on, legacy explícito y revisión, sin autodetección. |
| 03 Shadow | O02/O21; mismas keys/cuotas/HTTP con observador on/off. |
| 04 Coincidente | O03; esperado independiente en tabla de servidor. |
| 05 No coincidente | O03/O12; mismatch sin actualizar verdad. |
| 06 Prefijos manipulados | O04; extremo derecho, no prefijo aportado. |
| 07 Sufijo inválido | O05/O08; no buscar candidato anterior. |
| 08 XFF duplicado | O07/O27; duplicados reales de Node, arrays/rawHeaders ambiguos. |
| 09 Headers ausentes | O06/O13; no sustituir con socket ni otra fuente. |
| 10 IPv4 | O03/O08; validación estricta y comparación completa. |
| 11 IPv6 equivalente | O09/O10 y regresiones mapped; igualdad canónica, sin colisión /56. |
| 12 IPv4-mapped | O09 y 23 regresiones; reconocer /96 exacto y no convertir IPv6 nativas. |
| 13 NAT | O11; egreso compartido puede coincidir, no identidad de usuario. |
| 14 Caso no permitido | O29–31; sin autorregistro, fallback body/query o selección fuera de capacidad. |
| 15 Evidencia falsificada | O14/O28/O31; esperado/hash/match/label/revision de request ignorados. |
| 16 Límite de eventos | O23/O32; reserva síncrona y todos los resultados cuentan. |
| 17 Caducidad/disable | O33; deadline no deslizante, clocks, timer y latch. |
| 18 Reinicio | O22; factories independientes demuestran reset local sin extender deadline absoluto. |
| 19 Fallos sin interrumpir | O24–26; sink throws/reject/no resolución y boundary del middleware. |
| 20 Privacidad | O24/O27; esquema exacto, centinelas, errores, stdout/stderr y config. |
| 21 Contrato login/limiter | O20/O21 + P1; 200/400/401/429, cuota/headers/servicios/rutas sin cambios. |

## Resultados y regresiones

Node v24.22.3; dependencias propias del lockfile, sin cambios de package/lock. Prisma se generó
con valores sintéticos, sin DB. Tests sobre mocks y loopback; integration/DB y jobs no se ejecutaron.

| Verificación post-corrección | Resultado |
| --- | --- |
| Build | PASS, exit 0. |
| Typecheck aplicación y tests | PASS, exit 0. |
| Focalizadas P1/P2 | 7 suites / 271 PASS / 0 FAIL / 0 SKIPPED. |
| Regresión seleccionada | 108 suites / 4026 PASS / 0 FAIL / 0 SKIPPED. |
| Nuevas P2 incluidas | 3 suites / 189 PASS (87 config, 91 observador, 11 HTTP). |
| Revisión independiente Seguridad | 3 suites P2 / 189 PASS / 0 FAIL / 0 SKIPPED. |
| git diff --check | PASS. |

Los 271 focalizados y 189 P2 están incluidos en 4026: no sumar ejecuciones ni subsets.
No se certifica CI global ni runtime real. Incidencias iniciales: fixtures de tests con cinco
errores de tipo y dos assertions fallidas fueron corregidos; después se identificó un defecto
real de normalización mapped. Sus nuevas regresiones reprodujeron 16 fallos antes del arreglo.
La corrección precisa /96 agregó 23 tests y la ejecución final pasó. Los resultados históricos
4003 no se atribuyen al patch corregido. No se detectaron otros bloqueantes en la revisión
independiente de Seguridad. QA cerró el defecto sobre el commit indicado, contrastó los 21 requisitos
actuales y verificó JSON/assertions finales sin repetir tests, sin hallar otro bloqueante de implementación.
Sus límites de cobertura permanecen explícitos: simulación por factories, no procesos remotos;
sin prueba de un sink síncrono que bloquee deliberadamente el hilo ni prueba de procedencia del ingreso.
La revisión de agentes no sustituye aprobación humana, publicación o aceptación operativa.

## Fase O futura y aprobaciones pendientes

El [protocolo O](p2-observation-design.md) es el documento operativo propuesto: 2 URLs directas
verificadas × 2 redes independientes × 6 variantes, hasta 24 solicitudes seriales, <=1/s,
sin probes adicionales, paralelismo, reintentos, nuevas cuentas o escrituras de negocio.
IAM permanece restringido; extractor legacy. SHA/digest/revisión efectivos, identidades IAM,
fuente independiente de egreso, capacidades privadas, ventana <=15min, aislamiento operativo,
recolección categórica y privacidad/logs requieren aprobación concreta antes de desplegar.
No se inventa digest ni se considera aprobado el SHA por ejecutar tests.

Propuesta presupuestaria incremental: USD 1 para campaña, no hard cap ni garantía de costo;
no añade servicios cloud ni cambia Billing. Detener por mismatch, unverified legítimo, emisión
inesperada/faltante, boot/revisión diferente, afectación ajena, timeout, 5xx o cupo/tiempo agotado.
No convertir ausencia de evento en match ni descartar casos para obtener un resultado favorable.
Coincidencias aportan evidencia empírica acotada, no prueba universal ni aprobación de H1/C1.

Retención propuesta para aprobar: borrar tabla/capacidades activas al cierre, evidencia privada
de egreso <=24h tras revisión y conservar solo informe sanitizado; revisar copias persistentes
y logging de plataforma por separado. No se ejecutó borrado ni cambios cloud. Rollback remoto
debe autorizar digest/config anterior, detener harness y retirar observación manteniendo legacy/IAM;
no reabrir Run ni restaurar contadores perdidos. Ninguna de estas acciones se realizó.

Publicación/PR, integración, construcción/deploy de imagen, configuración y fase O necesitan
autorizaciones posteriores. No hay push, PR, merge, staging HTTP, cambios remotos, T5 ni cierre C1/C3.
El registro material se amplía en AI-042 sin reservar números ni modificar registros de G5.
