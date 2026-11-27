# G4 T1 — Revisión de seguridad previa a C1

Fecha inicial: 2026-11-26; actualización y preparación local de PR: 2026-11-27. Estado: revisión humana pendiente; **C1 bloqueado y C3 no aprobado**. C2 aprobado para reutilizar el sitio DEFAULT_SITE y proyecto homónimo `la-federala-staging-utn`, con billing existente Blaze, sin Analytics ni apps Firebase innecesarias; esa aprobación no habilita exposición ni publicación. Este informe sanitizado no constituye aprobación de publicación.

## Trazabilidad y alcance

- Task actual `task_ab561a932c2f`; dispatch `ctx_70584fbe1056`; coordinación `g4-base`, Refs #290. Procedencia: task `task_f5d1f5cbe11d`, dispatch `ctx_dd0b8c8d17ca`.
- Rama `fix/g4-security`; base de integración `7f5597bae624967554c0da1116817f7e41e87746`. El trabajo inicial sobre `84490e678b388fa6053fcfe262167412ea0f40e7` se preservó mediante commit selectivo y respaldo local antes de rebasar únicamente esta rama; actualización sin conflictos, sin cambios de ramas ajenas. Los SHA de commits de entrega constan en el reporte privado para evitar autorreferencias.
- Base verificada limpia antes de editar. La rama nueva de Orca fue renombrada tras verificar que la requerida no existía.
- Repositorio canónico para consultas y futuros PRs: `La-Federala-UTN-FRLP/Club-La-Federala`. Se conserva `origin` apuntando a `justinasmith1/Club-La-Federala`.
- Consultados CONTRIBUTING, PR template y AI-DECISIONS de la base; no se encontraron AGENTS.md aplicables en el checkout ni sus ancestros inspeccionados. El registro AI central permanece intacto; borrador en [ai/T1.md](ai/T1.md).
- Solo backend, pruebas con mocks y documentación T1. Sin frontend, escrituras remotas, DB, staging, migraciones, seeds, ejecución operativa de jobs, cloud, push ni PR.

## Inspección y pruebas locales

| Control | Evidencia y resultado | Límite |
| --- | --- | --- |
| Rutas y OpenAPI | 84 operaciones API y GET /health concuerdan con el contrato; únicas operaciones públicas declaradas: GET /health y POST /api/auth/login. | No prueba el ingress real. |
| Orden de controles | Regresión recorre las 83 operaciones API protegidas: authenticate primero, authorize después; requests anónimos reciben 401 antes del controller. | Inventario runtime de Express local. |
| HEAD y OPTIONS | HEAD de cada GET protegido conserva 401; HEAD /health es público y HEAD de login devuelve 404. Preflight permitido devuelve 204 sin datos; origen no autorizado no recibe concesión CORS. Express puede responder OPTIONS automático 200 con Allow. | Métodos implícitos, excluidos de operaciones OpenAPI; no ejecutan la operación de negocio. |
| JWT | Emisión y verificación fijan HS256; se requiere expiración finita y sujeto válido. Tests cubren firma, expiración, activación temporal y rechazo antes de consultar identidad. | Se endurece intencionalmente la aceptación: algoritmo distinto de HS256 o expiración ausente, inválida o vencida se rechazan. Los tokens del login vigente cumplen la política. Se conserva compatibilidad del sujeto legacy id; retiro requiere decisión humana. |
| Identidad vigente | Cada request consulta DB para usuario, rol y relación inmobiliaria; baja de usuario/tenant impide acceso. Tests verifican cambio de rol/tenant con claims anteriores y fallo de consulta. | DB simulada; no se verificó conectividad ni estado real. |
| Aislamiento A/B | Suites de Reservas, Ventas, Personas, Prioridades y Files ejercitan IDs, filtros, body y relaciones; las escrituras restringidas y lecturas comerciales respetan el actor vigente. | Cobertura local, no prueba exhaustiva de todos los estados ni concurrencia en DB. |
| Files y enlaces | Autorización precede a la firma; objeto se resuelve por metadata, no por URL del body. Tests de documentos propios/ajenos, rol técnico, bajas y errores de storage. | PLANO/IMAGEN conservan su política compartida vigente. URL emitida es una credencial temporal de lectura, con vigencia actual de una hora. Sin firma GCS real ni prueba de bucket privado. |
| CORS | Allowlist exacta, sin credenciales de cookies. Production no agrega localhost automáticamente; un FRONTEND_URL explícitamente configurado como localhost sí coincide incluso en production. Regresión HTTP cubre ambos casos. | FRONTEND_URL e ingress definitivos no verificados. La configuración explícita requiere revisión antes de C1. |
| Errores y logs | Respuestas inesperadas genéricas; suites de exposición, redacción y logging pasan. Logger de requests registra plantilla de ruta y marcador para paths desconocidos. | Retención, acceso y logging de plataforma pendientes; el limiter conserva identificador de red en sus eventos. |
| Login | Limiter antes de validación/login; política local de 10 fallos por 15 minutos, 429 posterior; éxitos se descuentan. Pruebas de rotación de headers, IPv6 y separación de buckets. | MemoryStore por proceso; no prueba protección distribuida ni identidad de cliente en Cloud Run. |

Cambios acotados: política JWT explícita y consistente con el emisor, minimización del path en logs, fixtures con vencimiento y regresiones de límites HTTP. Rutas, roles y formatos de respuesta se preservan; la compatibilidad de aceptación de JWT cambia intencionalmente como se describe arriba. No se modifica OpenAPI: conserva las operaciones, respuestas y esquema Bearer JWT vigentes.

## Validaciones históricas sobre 84490e6 (2026-11-26)

Entorno local Windows, Node v22.14.0 y npm 10.9.2; sin archivo Backend/.env y sin lectura de secretos reales. No acredita paridad con la imagen productiva.

| Comando desde Backend | Resultado |
| --- | --- |
| `npm.cmd ci --ignore-scripts --no-audit --no-fund` | Exit 0; 732 paquetes, lockfile sin cambios; avisos de deprecación. No se ejecutó auditoría de dependencias. |
| `./node_modules/.bin/prisma.cmd generate` | Exit 0, generación local del cliente; sin conexión DB. |
| `npm.cmd test -- --runInBand tests/unit/security tests/unit/app tests/unit/openapi --silent` antes de corregir | 25 suites, 518 pruebas PASS. |
| Nuevas regresiones JWT y rutas, antes del fix | RED: tres diferencias de política JWT confirmadas; corregidas y reejecutadas. Ajustes iniciales del harness documentados en evidencia privada. |
| Mismo comando security/app/openapi tras el fix inicial | 27 suites, 734 pruebas PASS; después se agregaron dos assertions/casos de inventario e IP incluidos en la corrida ampliada. |
| `npm.cmd test -- --runInBand tests/unit/security tests/unit/app tests/unit/openapi tests/unit/services tests/unit/routes tests/unit/middlewares tests/unit/utils tests/unit/config tests/unit/validations tests/unit/domain tests/unit/architecture tests/unit/storage tests/unit/runtime --silent` | 97 suites, 3709 pruebas PASS; DB/integration y directorio jobs excluidos. |
| `npm.cmd test -- --runInBand tests/unit/middlewares/logger.middleware.test.ts --silent` | 1 suite, 5 pruebas PASS sobre el logger final. |
| `npm.cmd test -- --runInBand tests/unit/security tests/unit/app tests/unit/openapi tests/unit/middlewares/logger.middleware.test.ts tests/unit/services/auth.service.test.ts --silent` | Corrida final: 29 suites, 748 pruebas PASS. |
| `npm.cmd run typecheck` | PASS tras completar preparación local; app y tests. |
| `npm.cmd run build` | PASS tras completar preparación local. |
| `git diff --check` | PASS. |

Incidencias históricas de preparación, no fallos ocultos: la primera comprobación de tipos encontró TS2305 en Pagos porque `--ignore-scripts` omitió el stub de @prisma/client. Se revisó y ejecutó `node node_modules/@prisma/client/scripts/postinstall.js`, que creó los archivos locales omitidos; emitió un aviso de descubrimiento de CLI. El build inicial encontró además EPERM del engine Prisma mientras seguía vivo un proceso de pruebas propio; se detuvo ese proceso y se repitió secuencialmente. Build y typecheck posteriores pasaron sin modificar Pagos ni dependencias versionadas. Estos resultados no se atribuyen a la base nueva ni constituyen CI global verde.

## Validación actual sobre 7f5597b (2026-11-27)

Se revisaron configuración Jest, exclusión de integration y mocks, incluido el cliente de IA incorporado upstream; sin llamadas reales a IA, DB, storage ni login. Node v22.14.0 y npm 10.9.2; no acredita paridad con imagen productiva.

| Comando desde Backend | Resultado actual |
| --- | --- |
| `npm.cmd ci --ignore-scripts --no-audit --no-fund` | Exit 0, 758 paquetes; lockfile intacto. Avisos de deprecación, sin audit ni upgrade. |
| `node node_modules/@prisma/client/scripts/postinstall.js` | Script revisado, exit 0; prepara stubs locales omitidos por ignore-scripts y emite aviso de descubrimiento de CLI, sin operación DB. |
| `npm.cmd run build` | Exit 0: cliente Prisma, compilación y copia local a dist. |
| `npm.cmd run typecheck` | Exit 0, app y tests. |
| `npm.cmd test -- --runInBand tests/unit/security tests/unit/app tests/unit/openapi tests/unit/services tests/unit/routes tests/unit/middlewares tests/unit/utils tests/unit/config tests/unit/validations tests/unit/domain tests/unit/architecture tests/unit/storage tests/unit/runtime --silent` | Exit 0, 103 suites y 3789 pruebas PASS. Incluye JWT, identidad, logger, rutas montadas, limiter, CORS y OpenAPI. Integration/DB y directorio jobs excluidos. |
| `git diff --check` | Exit 0. |

No se observaron fallos persistentes preexistentes ni regresiones nuevas en estas verificaciones actuales. Los avisos de preparación están identificados; los resultados no equivalen a CI global, revisión humana ni validación Cloud. Rebase sin conflictos y merge-base verificado igual a 7f5597b; el diff conserva los cambios upstream fuera del ownership T1.

## Bloqueantes C1 y pendientes humanos

1. **Identidad de cliente y topología:** falta evidencia del camino real hasta Cloud Run, de headers sobrescritos y de acceso directo. El código conserva trust proxy=false y no usa X-Forwarded-For como identidad. No se configura un número de saltos sin evidencia. La modalidad heredada de Render no debe trasladarse automáticamente; confirmar configuración efectiva antes de autorizar C1.
2. **Rate limit runtime:** aprobar alcance requerido entre procesos/instancias y reinicios, estrategia de almacenamiento y disponibilidad. El limiter en memoria local no demuestra un límite agregado y el fallback de proxy puede compartir bucket entre clientes. Resolver y probar en un trabajo autorizado antes de C1.
3. **Superficie pública y arquitectura:** confirmar y autorizar Hosting → API Cloud Run HTTPS con JWT/RBAC → PostgreSQL privado. Es recomendación pendiente, sin BFF ni dominios nuevos. Sin cambios de ingress, APIs, IAM o infraestructura en T1.
4. **Privacidad y credenciales temporales:** revisar política de acceso/retención de logs, URLs firmadas y permisos efectivos de storage; verificar configuración segura de producción y origen definitivo. Las pruebas mock no acreditan controles de plataforma ni revocación de enlaces ya emitidos.
5. **Revisión y QA:** revisión humana del diff y QA autorizada pendiente. Nicolas propuesto como revisor y Justina para contraste QA, todavía sin asignación ni aprobación. Refs #302 para seguimiento QA; no se cierran issues. El entorno ejecutor local no acredita paridad con runtime cloud ni aprobación pública.

Protocolo futuro de IP/rate limiting: documentar caminos de ingreso y frontera de confianza; luego, solo con autorización separada, validar clientes distintos, headers reenviados no confiables, IPv4/IPv6, concurrencia, separación de buckets y continuidad entre reinicios/revisiones. El fallback determinista puede agrupar usuarios y MemoryStore pierde contadores; no equivale a identificación correcta ni a un límite agregado persistente. Sin sondas activas, instrumentación, despliegues ni cambios de trust proxy o limiter en este frente. La evidencia privada de C2 se consultó sin repetir operaciones Cloud ni trasladar identificadores o detalles sensibles a este documento.

La evidencia sensible queda en un archivo temporal privado cuya ruta se entrega al coordinador por canal local; no se incorpora su contenido ni su ubicación a este documento publicable. No se ejecutaron suites DB, QA contra staging ni pruebas de recursos cloud. Este trabajo entrega un diff revisable; no aprueba su propia integración.
