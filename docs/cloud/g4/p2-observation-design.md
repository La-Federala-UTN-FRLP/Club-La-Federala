# C1 / P2 — Diseño del observador y protocolo futuro O

Fecha: 2026-11-27. Revisión documental sobre `4e1338ec6b5f425db8460a376327851c18d92211`,
rama `feat/g4-login-ip-observer`. **DISEÑO; fase O NO EJECUTADA; H1 NO acreditada;
C1 BLOQUEADO; T5 no iniciado.** PR #377 integrada; P1 mantiene `legacy` por defecto.

## Alcance y revisión

Se revisaron [CONTRIBUTING](../../../CONTRIBUTING.md), AI-042 en
[AI-DECISIONS](../../../AI-DECISIONS.md), el [experimento P1](c1-login-ip-experiment.md),
`Backend/src/utils/loginClientIp.ts`, `Backend/src/routes/auth.routes.ts`, el limiter
y la validación del login. No se encontró AGENTS.md aplicable en los directorios revisados.
Este documento es la única escritura versionable de esta revisión; no modifica Backend,
el registro AI central ni archivos de otros responsables. El coordinador consolida AI-042.

La autorización actual permite desarrollo local P2 con configuración sintética. No permite
push, PR, merge, deploy, HTTP a staging, cambios cloud/IAM/Billing/Secret Manager,
entornos remotos, Projects/issues, activación del extractor ni trabajo T5.
El protocolo O siguiente requiere autorización separada y concreta. Sustituye, para O,
la propuesta histórica de hasta 48 requests por **hasta 24**, exclusivamente observacionales.

Hallazgos que condicionan la implementación:

- El helper P1 devuelve un candidato sintáctico derecho XFF, nunca una procedencia probada.
  `rawHeaders` permite detectar algunos duplicados recibidos por Node; no reconstruye
  duplicados que un intermediario ya haya combinado.
- La ruta actual ejecuta limiter, validación y controller en ese orden. El observador debe
  ir inmediatamente antes del limiter, exclusivamente en `router.post('/login', ...)`
  montado en `/api/auth`. Así puede observar también 400/429 sin saltar controles.
- `loginClientKey` ya distingue el modo experimental. P2 no debe llamarlo para calcular
  evidencia, cambiar sus entradas, usar sus namespaces ni reutilizar el agrupamiento /56.
- MemoryStore y el observador tienen estado por proceso; ni una instancia nominal única
  ni una expiración local convierten eso en una cuota global o persistente.

## Arquitectura mínima y frontera de confianza

Primero se evalúa la **igualdad ordinaria con un valor precargado**: para cada caso el operador
establece privadamente su IP de egreso esperada, obtenida de una fuente independiente del
XFF, socket, `req.ip` y resultado del observador. El servidor compara en memoria el candidato
P1 y ese valor usando igualdad exacta de dirección canónica (IPv4-mapped equivalente a IPv4;
IPv6 equivalente por bytes; sin agrupamiento de subredes). La equivalencia mapped exige el
prefijo /96 exacto; una coincidencia textual parcial no basta. El parser P1 conserva sus rechazos
de puertos, comillas, zone ID, controles y ambigüedad. La normalización para comparar es pura,
no emite su resultado y no deriva claves del limiter. Un candidato inválido/ausente/ambiguo
produce `match=false`; ese false no distingue por sí solo divergencia de formato inválido.

Una tabla fija sin admisión controlada permitiría que cualquier invocador consumiera casos
y contaminara su atribución. Se exige por ello un **selector opaco impredecible de un solo uso**
por caso: 32 bytes aleatorios codificados como 64 caracteres hexadecimales minúsculos,
generados por el generador criptográfico estándar, no derivados
de IP, etiqueta, tiempo o credencial. El operador distribuye cada selector solo al harness
autorizado. El único header `X-Login-Observation-Selector` transporta la
capacidad; nunca se coloca en URL, query, cuerpo, etiqueta o logs. No es un protocolo de
nonce/hash/commitment ni acredita la red: solo autoriza consumir una entrada de la tabla.
La comparación IP sigue siendo ordinaria; no se necesita criptografía propia ni hashes de IP.

Configuración privada precargada, validada una vez: habilitación explícita, inicio/fin UTC
absolutos, revisión aprobada, límites y hasta 24 entradas `selector -> {caseLabel, expectedIp}`.
Cada etiqueta pertenece a la enumeración cerrada `U{1|2}N{1|2}V{1..6}`. No se acepta del
request una IP esperada, hash, `match=true`, etiqueta o revisión; headers/cuerpo adicionales
no alteran los valores de confianza. El selector solo consulta la tabla; su valor nunca se
propaga al evento. Selector ausente, desconocido, repetido como header, malformado o ya usado:
sin evento y continuación normal del login, sin respuestas diagnósticas diferenciadas.

Secuencia síncrona, sin `await` entre admisión y consumo:

1. Verificar ruta/método, habilitación, ventana, revisión y presupuesto de proceso.
2. Admitir exactamente un selector válido; consumirlo y reservar un evento antes de comparar.
3. Examinar con P1 el candidato y los indicadores mínimos; comparar con el esperado en memoria.
4. Construir por selección explícita el objeto permitido y entregarlo a un sink acotado.
5. Continuar una sola vez con el pipeline original; ninguna decisión de login depende del resultado.

No se agrega endpoint de control ni almacenamiento/infraestructura. No se hace I/O de red,
persistencia de IP o callback remoto desde el observador. El sink no tiene cola sin límite ni
reintento; si falla, se desactiva el observador, conserva consumido el cupo y continúa el login.
El sink de producción serializa por selección explícita los ocho campos como una línea JSON
en `console.log`, sin wrapper del request. Los sinks internos de prueba pueden devolver una
promesa: no se espera su resolución, se maneja su rechazo sin imprimirlo y como máximo quedan
24 invocaciones pendientes. Una promesa que nunca resuelve no detiene `next`; una invocación
ya entregada al sink no se puede retirar al vencer/deshabilitar. No hay garantía de entrega
durable ni de que un sink síncrono arbitrario no bloquee el event loop; el sink es código de
confianza, con trabajo acotado. La ruta aísla excepciones y llama `next()` una sola vez,
nunca `next(error)` por un fallo de observación.
Una excepción no debe retener ni imprimir request, error original, stack, config o causa.
Una configuración inválida deja el observador deshabilitado sin volcar sus valores; no cambia
la validación P1 existente. Fallos de observación no cambian status, headers, body, key, cuota,
éxitos descontados, orden posterior o política del login. No hay bypass para el harness.

El operador/configuración, el binario revisado y el harness autorizado son de confianza para
la atribución; los datos HTTP y la red son objetos de la prueba. IAM restringido es defensa
de acceso adicional y no sustituye el selector. Un llamador sin selector no puede elegir el
esperado ni producir una muestra admitida, salvo robo/adivinación de la capacidad. Un operador
o harness malicioso autorizado puede mentir sobre egreso, cambiar el caso, filtrar un selector,
consumirlo desde otra red o fabricar prefijos compatibles con su mentira: **no hay garantía
contra eso**. Igualdad no prueba H1, autenticidad del operador, topología ni ausencia de spoofing.
Se exige harness controlado y egreso conocido independientemente, con revisión humana cruzada.

## Eventos y privacidad

El payload contiene **solo** estos ocho campos, sin campos extensibles ni objetos de error:

| Campo | Dominio permitido |
| --- | --- |
| `caseLabel` | Enumeración cerrada de 24 casos, tomada de la tabla del servidor. |
| `revision` | Identificador de revisión aprobado y validado contra allowlist; nunca entrada HTTP. |
| `processId` | Identificador aleatorio efímero nuevo por arranque; no PID del sistema, host o cuenta. |
| `source` | `xff-rightmost` o `none`; indica fuente examinada, no confianza. |
| `family` | `ipv4`, `ipv6` o `none`; `none` si no hay candidato aceptable. |
| `formatValid` | Booleano: candidato aceptado por P1, sin acreditar procedencia. |
| `duplicate` | Booleano: duplicación/array observable; no acredita ausencia de combinación previa. |
| `match` | Booleano calculado exclusivamente en servidor contra el esperado. |

La revisión debe coincidir exactamente con un identificador esperado previamente validado,
con longitud acotada y caracteres seguros; sanitizar no significa copiar texto arbitrario.
No emitir eventos por boot, errores o requests no admitidos con otro esquema. La atribución
de arranque se revisa privadamente antes del ensayo; no requiere un endpoint público nuevo.
El sink y sus envoltorios no deben adjuntar metadatos del request.

Prohibido registrar IP real o sintética, socket, XFF/headers, normalización, key/subred,
hash de IP, selector/capacidad, tokens, credenciales, cuerpo, config o valores de excepción.
La prohibición incluye stdout/stderr, pruebas, diagnósticos, trazas, serialización y errores
de configuración. No hacer `console.error(error)`, dumps del entorno ni logs del request.
Los eventos no constituyen anonimato de toda la plataforma: los request logs de Cloud Run
pueden conservar `remoteIp` por fuera del observador. No hay autorización para cambiar su
configuración. Revisar privadamente su exposición/retención y obtener aceptación antes de O;
si no se puede aceptar o controlar conforme a la autorización futura, O no comienza.

## Habilitación, límites y persistencia

Contrato implementado, **para configuración futura; no configurado remotamente aquí**:

- `LOGIN_OBSERVATION_ENABLED=on`: solo el string exacto `on` permite parsear. Ausente,
  vacío, `off`, mayúsculas, espacios o cualquier otro opt-in inválido deshabilitan sin leer
  el JSON dormido; no se interpretan como error de startup/login.
- `LOGIN_OBSERVATION_CONFIG`: JSON privado de hasta **16384 caracteres**, objeto con
  exactamente `startsAt`, `expiresAt`, `revision`, `maxEvents`, `cases`. Fechas estrictas
  `YYYY-MM-DDTHH:mm:ss.sssZ` válidas y ordenadas; ventana <=900000 ms; `maxEvents` entero
  1..24; `cases` 1..24 entradas de exactamente `caseLabel`, `selector`, `expectedIp`, con
  etiquetas y selectores únicos. Ningún valor de este JSON entra en errores de zod.
- `K_REVISION`: debe igualar exactamente `revision`, con sintaxis segura minúscula,
  alfanumérica/guiones, inicio letra, final alfanumérico y longitud <=63. Es una allowlist
  de una revisión aprobada, no una revisión declarada por el cliente.
- `LOGIN_CLIENT_IP_MODE=legacy`: exigido explícitamente tanto al parsear como al admitir
  observaciones; el default legacy por ausencia no basta para esta campaña.

Configuración inválida deshabilita solo el observador silenciosamente, sin error/input/stack
en logs; las validaciones ajenas de WebEnv conservan su comportamiento de startup.
`parseLoginObservation` copia y congela la configuración; `parseWebEnv` la guarda en WebEnv.
El primer login crea el observer con esa copia validada y registra timer de un segundo con
`unref`. Cambiar strings de env después no reparsea ni rearma el observador; modo/revisión sí
se vuelven a comprobar en runtime. Deshabilitar se refiere al latch interno; cambiar solo
`LOGIN_OBSERVATION_ENABLED` después del arranque no es un control dinámico de apagado.
Reemplazar WebEnv mediante código interno de confianza crea otro ciclo de vida y deshabilita
el previo en el siguiente login; no hay control HTTP para hacerlo. Producción debe inicializar
WebEnv una sola vez. El processId es efímero por instancia de observer: normalmente una por
proceso; una reinicialización interna también lo cambia y debe abortar la campaña.

Default: deshabilitado, sin parsear candidatos ni emitir eventos. `K_SERVICE`, producción o
`LOGIN_CLIENT_IP_MODE=cloud-run-direct` nunca habilitan el observador. Para O se exige
`LOGIN_CLIENT_IP_MODE=legacy` explícito; rechazar observación si el modo no es legacy.

Máximo 24 eventos por proceso y una admisión por selector por proceso, aun con requests
concurrentes. La ventana fija aprobada dura como máximo 15 minutos, con `startsAt` y
`expiresAt` UTC completos; al llegar al fin o agotar cupo se desactiva y libera la tabla.
La hora final nunca se calcula como «ahora + duración» durante un reinicio. Una comprobación
monótona adicional limita la vida del observer a <=15 minutos desde su creación y detecta
retrocesos de pared/monótono entre muestras; no demuestra detectar todo salto de reloj entre
muestras. Una creación anticipada puede agotar ese límite antes del fin de la ventana.
Timer y guardias al admitir y antes del sink evitan depender solo de un callback tardío.
La desactivación es irreversible durante ese ciclo de vida; rearmar exige otro acto
operativo aprobado, no un request. El operador puede detener antes el emisor; la desactivación
remota o restauración del artefacto requiere el cambio autorizado correspondiente.

Estos límites son **por proceso**. Configuración retenida puede volver a cargar selectores
consumidos en otro arranque o réplica antes del mismo vencimiento absoluto. Sin almacenamiento
compartido no se puede garantizar single-use/cuota global ni bloqueo distribuido de campaña.
El harness impone además máximo global de 24 intentos enviados, seriales, sin reintentos, y
aborta ante boot/revisión inesperados o solapamiento de procesos. Una observación emitida
por un proceso nuevo antes de detectar el cambio se descarta; no se afirma impedirla en servidor.
El manifiesto privado fija antes de empezar las revisiones y el máximo de un proceso por
revisión. La primera muestra admitida de cada revisión fija su processId de referencia;
no hace falta otro request de bootstrap. Cualquier cambio posterior o proceso adicional
invalida la campaña, no crea otro cupo. Antes de esa primera muestra no puede identificarse
un reinicio solo con estos eventos: contrastar el arranque con evidencia operativa independiente
aprobada; si no está disponible, declarar esa incertidumbre y no aceptar la campaña como válida.
El processId no es autenticación ni permite detectar procesos que nunca emiten una muestra.

En desarrollo local se usan exclusivamente IPs de documentación y capacidades sintéticas.
Para O, valores reales solo en memoria/config privada del operador y servidor. No ponerlos
en repo, argumentos CLI, historial, reportes, artefactos de build ni salida de herramientas.
El env original y la copia congelada de WebEnv pueden retener IPs normalizadas y selectores
aun después de limpiar el Map activo. Si una futura configuración usa env/file retenido,
también persisten en revisiones, metadatos, archivos o backups; no prometer borrado físico
por expiración ni por `disable()`.
La aprobación futura debe describir ubicación, acceso, copias, responsable y eliminación con
las limitaciones reales de la plataforma. No introducir Secret Manager ni otro servicio aquí.
Caducidad y no reutilización de selectores son obligatorias aunque existan copias residuales.

## Fase O — protocolo definitivo propuesto, no ejecutado

### Puerta previa de autorización

No existe todavía SHA/digest P2 construido/desplegado aprobado. El SHA base de esta revisión
no lo sustituye. Antes de O registrar privadamente y aprobar explícitamente:

- SHA completo del código final revisado, digest inmutable de imagen, revisión efectiva y
  concordancia entre los tres; build y deploy son trabajos separados sujetos a autorización.
- Dos URLs HTTPS directas de Run, U1/U2, obtenidas de metadatos verificados y su correspondencia
  con revisión/digest. No inventar endpoints, seguir redirects, usar dominio personalizado,
  Hosting, ALB o proxy local; verificar que ambas rutas cubren el ingreso que se pretende validar.
- Identidades IAM operadoras concretas existentes y autorizadas, permisos mínimos de invocación,
  audiencia OIDC y separación respecto de JWT de aplicación; sin publicar correos/IDs/tokens.
  No inventar identidades ni conceder roles aquí. Mantener servicio restringido por IAM.
- Harness exacto revisado que emite headers duplicados en el wire sin combinarlos, TLS correcto,
  sin redirects/reintentos ni verbose/trazas y sin registrar capacidades/autorización/headers.
- Dos redes de egreso realmente independientes N1/N2, con salida estable y distinta, conocidas
  mediante fuente independiente aprobada (administración de red o comprobación de egreso separada).
  Si necesita consultas adicionales para esa comprobación, deben autorizarse aparte: no usar
  respuestas del observador como fuente de verdad ni ocultarlas dentro del cupo de 24.
- Familia de dirección de cada red fijada y esperados por caso precargados; verificar egreso
  antes/después con evidencia privada. IPv4/IPv6 fuera de lo observado queda sin verificar.
- Ventana UTC exclusiva <=15 min, máximo 24 intentos, procesos esperados, ausencia de despliegues,
  rollouts, reinicios planificados y tráfico ajeno que pueda contaminar el ensayo. No provocar
  reinicios ni escalado; si no puede asegurarse el aislamiento operativo, no iniciar.
- Aceptación de privacidad del logging de plataforma, conservación y responsables; presupuesto
  incremental propuesto **USD 1** incluyendo recursos/logging relevantes. Es una estimación,
  no un hard cap ni autorización para modificar Billing, cuotas o infraestructura.
- Responsable presente con facultad de detener el emisor y rollback remoto expresamente
  autorizado, artefacto previo conocido y procedimiento aprobado. Ninguno se ejecuta ahora.

### Matriz exacta y emisión

Orden fijo U1/N1, U1/N2, U2/N1, U2/N2; dentro de cada bloque V1..V6. Una solicitud por
celda: 2 URLs × 2 redes × 6 variantes = **24 como máximo**. No warmups, sondeos de salud,
reintentos ni requests de diagnóstico adicionales en O. Toda solicitud enviada cuenta aunque
IAM/ingreso/limiter la rechace o no produzca evento. Intervalo entre inicios >=1 segundo y
esperar fin de la anterior: serial global, sin carga ni paralelismo. Timeout acotado y sin retry.

| Variante | Header XFF enviado por harness |
| --- | --- |
| V1 | Ausente (baseline legítimo). |
| V2 | Un único valor IPv4 de documentación, distinto de ambos egresos. |
| V3 | Un único valor IPv6 de documentación, distinto de ambos egresos. |
| V4 | Una línea con dos valores de documentación separados por coma. |
| V5 | Una línea con prefijo de documentación y sufijo inválido `not-an-ip`. |
| V6 | Dos líneas XFF distintas, con valores de documentación diferentes. |

Las direcciones sintéticas exactas se fijan en el harness privado revisado y no se registran.
Todas las celdas esperan la salida real independiente de N1/N2, **nunca el valor inyectado**.
No añadir puertos/controles fuera del protocolo HTTP ni pruebas de carga. El transporte y su
normalización son parte de lo observado: no deducir del resultado cómo llegó el wire a Node.

Enviar `POST /api/auth/login`, JSON `{}` con content-type JSON válido y el selector de su
celda, más autenticación IAM por el mecanismo aprobado. `{}` falla la validación local actual
y evita controller/consulta de cuentas; comprobar esa propiedad en el SHA final. No utilizar
cuentas, contraseñas, JWT de usuarios ni semillas. No omitir el limiter: su contador efímero
puede cambiar y puede responder 429 por el bucket legacy compartido; no es escritura de datos
de negocio. El observer previo al limiter puede observarlo. Respuesta inesperada de login
exitoso o indicio de ejecución del controller obliga a detener y revisar, sin insistir.

### Evidencia, decisión y parada

Conservar únicamente los ocho campos permitidos por muestra. El manifiesto privado contiene
aprobaciones, SHA/digest/revisiones, alias U/N, ventana, orden de envíos, status HTTP y la
atestación independiente del egreso, separada de la tabla sensible. No exportar request logs
crudos, cabeceras o trazas. El informe versionable usa etiquetas y conteos, sin IPs, identidades,
URLs privadas, selectores o tokens; no adjuntar la configuración sensible ni hashes de IP.

El harness verifica correspondencia uno a uno de los casos emitidos y eventos admitidos,
revisión/proceso esperados, límites y reloj. Un evento faltante, duplicado, extra, fuera de
ventana o de proceso/revisión no previstos invalida la campaña; no completar huecos con retries.
Un 401/403 de IAM, rechazo de ingreso, problema TLS, timeout, egreso desconocido/cambiante,
desvío de coste o fuga de datos detiene los envíos y mantiene C1 bloqueado. Revisar coste
con la demora real de métricas; no afirmar corte automático al alcanzar USD 1.

Apoyo limitado a H1: en todos los casos admitidos `formatValid=true`, `duplicate=false` y
`match=true`, egresos distintos conocidos independientemente y resultado estable frente a
los prefijos inyectados en ambas URLs. Eso es **evidencia empírica del alcance probado**,
no prueba universal de append/overwrite ni contrato normativo. Aun coincidencias completas
no distinguen todos los mecanismos posibles de sanitización; la aceptación de H1 requiere
además revisión humana del contrato/topología y sus limitaciones, no solo esta matriz.

Un candidato válido diferente del egreso independiente contradice la predicción de H1 para
ese caso; seguir el prefijo inyectado evidencia riesgo de control por el cliente. Detener al
primer desvío, sin gastar el resto del cupo. Ausencia/invalidez/duplicación, incluyendo V6 que
llegue a P1 como `unverified`, deja el caso ambiguo o incompatible: **prohíbe activar** si es
una solicitud legítima del camino previsto. Si V6 coincide porque el ingreso combinó líneas,
el comportamiento de duplicados solo queda observado para ese ingreso/caso; no se demuestra
su ausencia en otros caminos. No excluir V6 a posteriori para obtener un PASS.

Parada: cesar el harness inmediatamente, no emitir más capacidades, dejar vencer la ventana,
y ejecutar solo el rollback remoto previamente autorizado si corresponde. Mantener extractor
legacy; el rollback del observador no restaura contadores perdidos ni aprueba exposición pública.
Antes de nuevas muestras se exige una campaña nueva con revisión, autorización, ventana y
capacidades nuevas; no renovar tiempos ni reiniciar para ampliar el cupo.

Propuesta de retención para aprobación: eliminar tabla sensible y capacidades del harness y
configuración activa al cierre; eliminar evidencia privada de egreso en <=24 h tras revisión;
conservar solo informe sanitizado. Revisar y documentar copias residuales de env/file/revisiones,
backups y logs de plataforma: esta propuesta no cambia su política ni garantiza su borrado.
Si las restricciones de retención no son aceptables, no iniciar O.

## Criterios de revisión local antes de implementar O

La implementación local revisada incorpora pruebas sintéticas que deben seguir cubriendo:
default apagado y habilitación inválida sin fuga; aislamiento de la ruta según el matching
existente de Express (incluye mayúsculas, slash final y query); igualdad
canónica sin /56; spoofing del esperado ignorado; selector desconocido/repetido/reusado y
consumo concurrente; presupuesto y vencimiento absolutos sin renovación; reinicio/procesos
independientes mostrando la limitación; sink/config/parse fallidos sin logs sensibles; y
regresión que conserve key, política, validación y respuesta del login. Capturar stdout/stderr
con centinelas sintéticos en todos los caminos de fallo para detectar filtraciones.
Esas pruebas acreditan comportamiento local, nunca IAM, privacidad cloud, H1 o fase O.

Recomendación: conservar la implementación local bajo revisión hasta completar la validación
ampliada del patch corregido y la consolidación del coordinador; este protocolo no autoriza O ni activación.
Siguen pendientes valores operativos/aprobaciones concretos de la
puerta previa y aceptación humana de los límites de atribución y persistencia. Incluso una
O favorable no resuelve por sí sola C1 (estado distribuido, reinicios y disponibilidad), C3 o T5.

## Revisión independiente del patch local P2

Se leyó el diff completo y los seis archivos Backend nuevos, además del reporte privado del
implementador; esta revisión no modificó Backend. Hallazgos y estado del código examinado:

- **P1 bloqueante, corregido en fuente y verificación focalizada:**
  `Backend/src/config/loginObservation.ts:24` reconocía cualquier prefijo textual mapped,
  pudiendo fabricar igualdad entre IPv6 nativo e IPv4 o entre IPv6 distintos. El cambio en
  líneas 24–31 ahora exige exactamente dos palabras finales tras el prefijo /96 normalizado.
  Los tests nuevos en `Backend/tests/unit/config/login.observation.config.test.ts:8` usan
  resultados literales independientes; `Backend/tests/unit/security/login.observation.test.ts:63`
  comprueba que no haya eventos de falso match y conserva equivalencias IPv6 legítimas.
  La revisión cerró el defecto sobre el código leído; los resultados anteriores al fix no
  acreditan ese patch y aún deben consolidarse las validaciones ampliadas posteriores.
- **P2 no bloqueante para desarrollo local, limitación operativa explícita:**
  `Backend/src/middlewares/loginObservation.middleware.ts:70` limpia el Map activo, pero
  `Backend/src/config/env.ts:366` y la caché WebEnv conservan configuración privada congelada;
  ni expiración ni disable borran físicamente env/copia/capacidades. El protocolo exige
  aceptación y manejo privado antes de O; no se ofrece borrado que el código no implementa.
- **P2 no bloqueante para desarrollo local, condición de campaña:**
  `Backend/src/middlewares/loginObservation.middleware.ts:52` crea estado/cap/identificador
  por factory y `:135` lo reemplaza ante otro WebEnv. No hay single-use global, control
  distribuido de arranque ni apagado por cambiar solo el opt-in del entorno. El harness debe
  detenerse por deriva de proceso/revisión y limitar globalmente los intentos.
- **P3 no bloqueante, límite de entrega:**
  `Backend/src/middlewares/loginObservation.middleware.ts:113` invoca el sink sin esperar
  promesas; rechazos deshabilitan, invocaciones pendientes están acotadas por <=24 y no se
  reintentan. Una entrega ya iniciada no se retracta y un sink síncrono arbitrario sigue
  siendo código de confianza. No presentar el evento como entrega durable o prueba HTTP.

No se identificaron otros defectos bloqueantes en el diff revisado: esperado/caso/revisión
vienen del servidor validado, selección consume antes del sink, comparación usa dirección
completa, serializer elige ocho campos, errores no pasan a `next(error)`, y la única inserción
de ruta precede al limiter existente. Se conserva el matching original de Express, no una
nueva coincidencia literal restrictiva de URL. No hay cambios de política/keys, dependencias,
endpoint de control, protocolo criptográfico propio ni cliente de red en el observador.

Evidencia independiente: ejecución local posterior al fix, Node v24.22.3, tres suites P2,
**189 PASS / 0 FAIL / 0 omitidas**; JSON y log privados con nombre
`g4-p2-security-followup-focused` en Temp. Los archivos se leyeron y los tests se ejecutaron;
no se repitió aquí build/typecheck ni toda la regresión ampliada del implementador.
El reporte previo de 108 suites/4003 PASS es anterior a la corrección y no se atribuye al
patch final. Enlaces Markdown y whitespace revisados. Ninguna validación remota se ejecutó:
H1 no probada, C1 BLOQUEADO; no se aprueba GitHub ni se declara el cambio listo para publicar.

## Consolidación local posterior a la revisión independiente

La coordinación verificó la validación ampliada posterior al fix, vinculada al commit de código
`5c26092e8e51ec08ab6e285d7da4c839a7231eca`: build/typecheck PASS, 108 suites/4026 pruebas
PASS, 0 FAIL y 0 SKIPPED. Incluye las 271 focalizadas P1/P2 y las 189 nuevas P2; no se suman.
QA contrastó código, assertions y JSON finales y cerró el defecto de normalización sin hallar
otro bloqueante de implementación; no repitió tests. El mapeo correcto de los 21 requisitos
actuales está en [la entrega local](p2-observation-local.md), no en la numeración histórica P1.
Los avisos de validación pendiente de la sección anterior describen su snapshot de revisión.
La consolidación satisface desarrollo/pruebas locales, no revisión humana ni autorización de
publicación, deploy, configuración o fase O. Todos los límites operativos de este protocolo
permanecen vigentes. H1 no acreditada, C1 BLOQUEADO, C3 pendiente y T5 no iniciado.
