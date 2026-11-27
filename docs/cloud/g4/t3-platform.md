# G4 · T3 — Inventario de plataforma y decisión C2

Estado: **C2 listo para decisión humana; no aprobado**. Corte: 2026-11-26, 16:12–16:16 ART (UTC−03). Revisor propuesto: Santiago; validación: Nicolas. Referencia: issue principal #290 del repositorio canónico `La-Federala-UTN-FRLP/Club-La-Federala`; coordinación `g4-base`.

## Alcance y procedencia

Inventario control-plane de `la-federala-staging-utn`, región `southamerica-east1`. Las consultas globales (Service Usage, IAM del proyecto, buckets, redes y Cloud SQL) llevan proyecto explícito; las regionales de Run, subredes y Scheduler llevan además región o ubicación explícita. No se modificó infraestructura, configuración local de gcloud ni datos de aplicación.

Base congelada y HEAD final: `84490e678b388fa6053fcfe262167412ea0f40e7`. Checkout limpio antes de editar. La rama nueva de Orca se renombró de `SantiTalavera/g4-t3-platform` a `docs/g4-platform-proposal` tras comprobar que la requerida no existía. `origin` conserva `https://github.com/justinasmith1/Club-La-Federala.git`. No hubo commit, push, PR ni cambios en issues o Projects.

Se consultaron `CONTRIBUTING.md`, `.github/pull_request_template.md` y el registro `AI-DECISIONS.md`, incluida su plantilla y AI-015. No se encontraron `AGENTS.md` en el checkout ni en sus directorios ancestros consultados. La excepción explícita del encargo conserva el registro central sin cambios: borrador exclusivo en [ai/T3.md](ai/T3.md).

## Inventario comprobado

| Componente | Evidencia observada | Límites de interpretación |
| --- | --- | --- |
| Cloud Run | Servicio `federala-staging-api`, Ready=True; revisión creada y lista `federala-staging-api-00001-7b4`; tráfico 100% a esa revisión | Ready no demuestra corrección de aplicación ni QA de seguridad |
| Imagen de API | Digest `sha256:61550f344b1259c85a86f7b56b10a8921c0accf5f6dcef6973a5a231148de0ac` en Artifact Registry regional, repositorio `federala-backend`, imagen `api` | No se estableció correspondencia entre digest y SHA del código; no se ejecutó imagen ni análisis de dependencias |
| Capacidad API | 1 vCPU, 1 GiB; concurrencia 10; timeout 60 s; CPU idle habilitada y startup CPU boost habilitado | Sin prueba de carga ni cálculo de conexiones SQL |
| Escalado API | Máximo de servicio 5; máximo de revisión/template 1; mínimos omitidos en respuesta | Conservar ambos niveles; no informar capacidad real de 5 instancias. Mínimo omitido es valor por defecto, no una reserva positiva comprobada |
| Ingress | `INGRESS_TRAFFIC_ALL` | Aceptar ingress no equivale a invocación pública autorizada |
| Acceso Run | Política IAM directa con 0 bindings; 0 bindings públicos `roles/run.invoker` en política del proyecto; `invokerIamDisabled` omitido en respuesta v2 | No se auditó herencia de carpeta/organización, roles personalizados ni políticas organizacionales; no se probó HTTP anónimo. No afirmar apertura pública ni autorización pública aprobada |
| Red API | Direct VPC egress con red `federala-staging-vpc`, subred `federala-staging-subnet`, `PRIVATE_RANGES_ONLY` | No se inspeccionaron reglas detalladas de firewall, rutas, peers ni tráfico |
| Red del proyecto | Red de staging custom y red `default` automática; subred de staging regional con Private Google Access=True | La existencia de `default` no demuestra uso por la API |
| Cloud SQL | `federala-staging-db`, `POSTGRES_17`, RUNNABLE, regional indicado, ZONAL, `db-g1-small`, SSD 20 GB; IPv4 pública deshabilitada y red privada de staging configurada | No se consultaron tablas, usuarios, conexiones, credenciales ni contenido SQL |
| Protección SQL | Backups habilitados, retención de 7 backups, protección de borrado habilitada y `sslMode=ENCRYPTED_ONLY` | `pointInTimeRecoveryEnabled` no apareció; retención de logs de 7 días no demuestra PITR habilitado. No se probó restauración |
| Run Job expiraciones | `federala-staging-expirations`: 1 tarea, paralelismo 1, 1 vCPU/512 MiB, timeout 600 s, 0 retries | Solo metadata; no se ejecutó ni se consultaron logs o payloads |
| Run Job migraciones | `federala-staging-migrate`: 1 tarea, paralelismo 1, 1 vCPU/1 GiB, timeout 900 s, 0 retries | Existencia no demuestra migraciones aplicadas ni esquema al día |
| Scheduler | `federala-staging-expirations-daily`, ENABLED, `0 9 * * *`, zona `America/Argentina/Buenos_Aires`, método POST, deadline 60 s | Estado observado preexistente; no se pausó ni ejecutó. Payload, headers, destino e identidad no inventariados |
| GCS | Bucket `federala-staging-files-28822223940`, STANDARD, `SOUTHAMERICA-EAST1`; Public Access Prevention enforced; Uniform Bucket-Level Access=True; 0 bindings públicos directos | No se listaron objetos ni se generaron URLs firmadas; permisos efectivos e identidad firmante pendientes |
| Recuperación GCS | Soft delete 604800 s (7 días); campos de versionado y retention policy omitidos | No afirmar versionado ni retención inmutable configurados; protección soft delete no es una prueba de recuperación |
| Firebase Management | `firebase.googleapis.com`: **DISABLED**, obtenido por Service Usage GET | Bloquea inventario Firebase; no demuestra ausencia de proyecto Firebase |
| Firebase Hosting | `firebasehosting.googleapis.com`: **DISABLED**, obtenido por Service Usage GET | Sitios, versiones, canales, releases y dominios: **desconocidos**. No se intentó crearlos ni habilitar APIs |

Jobs: digest de expiraciones `sha256:632756ac9ed63cd659c9630acb7cdc485590b45965354599aae20b624cc3574b`; digest de migraciones `sha256:bfefaeffac79154208b50c4f3d7316d914b43eea86cce222c7952d5c3cad67cf`. Son imágenes distintas de la API: la diferencia exige verificar procedencia antes de un futuro despliegue, sin deducir por sí sola incompatibilidad.

No se consultaron `.env`, versiones/valores de secretos ni envs completas. `FRONTEND_URL` y `NODE_ENV` quedan sin verificar en esta corrida: no se empleó una extracción de env completa para obtenerlos. Secret Manager solo figura como API habilitada; no se listaron secretos.

## APIs: estado y necesidad

| API exacta | Estado comprobado | Papel en la propuesta |
| --- | --- | --- |
| `serviceusage.googleapis.com` | ENABLED | Consulta y futura habilitación controlada |
| `firebase.googleapis.com` | DISABLED | Firebase Management: identificar asociación del proyecto y apps existentes |
| `firebasehosting.googleapis.com` | DISABLED | Inventariar Hosting y, con otra autorización, publicar estáticos |
| `run.googleapis.com` | ENABLED | API HTTPS existente y Jobs existentes |
| `artifactregistry.googleapis.com` | ENABLED | Imágenes existentes; no implica necesidad de nueva imagen |
| `compute.googleapis.com` | ENABLED | Red y Direct VPC egress existentes |
| `servicenetworking.googleapis.com` | ENABLED | Conectividad de servicios privados existente |
| `sqladmin.googleapis.com` | ENABLED | Administración metadata de PostgreSQL existente |
| `storage.googleapis.com` | ENABLED | Archivos existentes |
| `cloudscheduler.googleapis.com` | ENABLED | Programación existente; no necesaria para servir el frontend |
| `iam.googleapis.com`, `iamcredentials.googleapis.com` | ENABLED | Identidades y operaciones de firma existentes; permisos efectivos no validados |
| `secretmanager.googleapis.com` | ENABLED | Configuración sensible existente; contenido fuera del inventario |
| `logging.googleapis.com`, `monitoring.googleapis.com` | ENABLED | Observabilidad; no se consultaron logs de aplicación |

Los estados ENABLED proceden de `gcloud services list --enabled --project=la-federala-staging-utn`. DISABLED se confirmó individualmente por Service Usage REST; la ausencia en la lista no se usó como única prueba. No se propone habilitar Authentication, Firestore, App Hosting, Functions, Cloud Build ni otras APIs por conveniencia; cualquier dependencia adicional observada requiere nueva revisión.

## C2 — Propuesta delimitada para decisión

**Decisión solicitada a revisión humana:** autorizar exclusivamente habilitar `firebase.googleapis.com` y `firebasehosting.googleapis.com` en el proyecto existente `la-federala-staging-utn`, seguido de un nuevo inventario read-only. No es autorización para crear proyecto Firebase, apps, sitios, canales, dominios, releases, recursos de facturación ni para desplegar. Hosting es global; no asignar ficticiamente `southamerica-east1` a sus sitios. Run y SQL conservan esa región.

Secuencia propuesta, no ejecutada:

1. Santiago revisa este inventario y el alcance; Nicolas valida seguridad, titularidad del proyecto y presupuesto. Registrar autorización expresa de C2, APIs, operador y ventana.
2. Guardar evidencia filtrada del estado de ambas APIs y de sus dependencias. Un operador autorizado habilita solo las dos APIs exactas. Esta acción puede aprovisionar identidades gestionadas del servicio; revisar el cambio efectivo sin conceder roles amplios manualmente.
3. Esperar operación de habilitación; verificar ENABLED. Consultar Firebase `projects.get` y apps existentes mediante list; Hosting `projects.sites.list`, y get/list de versiones, canales y releases de los sitios devueltos. No ejecutar `addFirebase`, `projects.create`, `sites.create` ni inicializaciones que creen recursos. Si no existe asociación Firebase o falta permiso, detener y presentar otra decisión; no inferir autorización para corregirlo.
4. Actualizar inventario con sitios y dominios efectivamente devueltos, estado de facturación/plan accesible y límites de permisos. No inventar dominios ni tratar un 403/404 como prueba general de inexistencia.
5. Presentar autorización **separada** para cualquier recurso, despliegue estático, configuración CORS/URL, configuración de facturación y acceso público de Run. Seguridad y pruebas JWT/RBAC deben preceder a la apertura pública. C2 no habilita T5.

### Permisos mínimos propuestos

Los permisos se describen como necesidades de operaciones futuras; no se concedieron ni se demostró su posesión con la identidad actual fuera de las lecturas exitosas.

| Operación | Permisos/rol acotado propuesto |
| --- | --- |
| Ver estado de APIs | `serviceusage.services.get`, `serviceusage.services.list`; rol predefinido `roles/serviceusage.serviceUsageViewer` |
| Habilitar y observar operación | `serviceusage.services.enable`, `serviceusage.operations.get` sobre proyecto exacto; permiso `serviceusage.services.use` si el consumo/cuota del método lo exige. Delegación temporal acotada por política organizacional; no solicitar Owner/Editor |
| Inventariar Firebase | `firebase.projects.get` y los get/list correspondientes a las apps que se consulten; evaluar `roles/firebase.viewer` para la lectura requerida |
| Inventariar Hosting | `firebasehosting.sites.get`, `firebasehosting.sites.list`, `roles/firebasehosting.viewer`; la documentación vigente indica que Hosting no admite custom roles para controlar acceso a sus recursos |
| Eventual reversa de APIs | `serviceusage.services.disable` y lectura de operaciones/dependencias, solo con autorización de rollback y tras evaluar consumidores |
| Eventual apertura pública Run | `run.services.getIamPolicy` / `run.services.setIamPolicy` sobre ese servicio, sujeto a políticas de organización y aprobación distinta de C2 |

Referencia de permisos: [Service Usage](https://docs.cloud.google.com/iam/docs/roles-permissions/serviceusage), [Firebase IAM](https://firebase.google.com/docs/projects/iam/permissions). Las consultas de inventario posteriores deben limitar las respuestas a metadata pública; permisos de lectura no autorizan descargar configuraciones con credenciales.

### Costos y supuestos

Fuentes oficiales consultadas el 2026-11-26; valores ilustrativos en USD, sin impuestos ni conversión monetaria. No se consultó facturación, consumo real ni créditos de la cuenta.

- **C2 acotado:** habilitación y lectura, sin publicar contenido ni crear recursos de consumo. Incremento de Hosting esperado USD 0 bajo ese supuesto; no representa una garantía de factura total cero ni detiene costos existentes.
- **Hosting futuro:** tarifa publicada de almacenamiento extra USD 0,026/GB y transferencia extra USD 0,15/GB, con franquicia de almacenamiento de 10 GB. Como ejemplo de consumo ya determinado como facturable tras aplicar franquicias: 20 GB adicionales almacenados y 20 GB adicionales transferidos implican `20 × 0,026 + 20 × 0,15 = USD 3,52` en el período tarifario. No equivale a pronóstico de uso. La tabla de pricing presenta transferencia gratuita de 360 MB/día; la guía de Hosting expresa 10 GB/mes. Reconciliar el período aplicable en el plan/console antes del presupuesto final. [Precios Firebase](https://firebase.google.com/pricing), [cuotas Hosting](https://firebase.google.com/docs/hosting/usage-quotas-pricing).
- **Run existente/futuro público:** cobro según región, modalidad, vCPU-s, GiB-s, requests y transferencia; cuotas gratuitas compartidas por cuenta de facturación. Para estimar usar 1 vCPU y 1 GiB observados y separar CPU boost/arranques, tiempo facturable, requests y egress. No se midieron esos consumos ni se calculó un precio regional inventado; solicitar estimación en calculadora para `southamerica-east1` antes de otra autorización de recursos. [Cloud Run pricing](https://cloud.google.com/run/pricing).
- **Base existente:** SQL `db-g1-small` ZONAL y 20 GB SSD, backups y transferencia; GCS STANDARD regional, operaciones, almacenamiento recuperable y soft delete. Presupuestar con horas de SQL, GB y operaciones efectivos; no aplicar franquicias de otras regiones ni atribuir estos costos a C2. Imágenes, secretos y observabilidad también pueden generar cargos; inventario sin factura no proporciona un total. [Cloud SQL pricing](https://cloud.google.com/sql/pricing), [GCS pricing](https://cloud.google.com/storage/pricing).
- **Scheduler existente:** USD 0,10 por job/31 días, con 3 jobs gratuitos por cuenta de facturación; un job aquí sería USD 0 incremental si la cuenta conserva franquicia, o hasta USD 0,10 por período completo si ya la consumió. El precio no incluye el trabajo ejecutado por Run. [Scheduler pricing](https://cloud.google.com/scheduler/pricing).

El presupuesto mensual total y los límites de consumo quedan pendientes de lectura autorizada de billing o estimación humana. Aprobar C2 no implica aceptar un gasto ilimitado ni aprobar los recursos posteriores.

### Rollback de C2

Si solo se habilitaron APIs y el inventario posterior no detecta consumidores, proponer restaurar cada API al estado DISABLED inicial mediante operador autorizado. Antes de deshabilitar, comprobar dependencias e impactos: no usar deshabilitación forzada/cascada. Si hay sitios, integraciones o consumidores preexistentes, detener la reversa y acordar ventana/impacto; no borrarlos para hacer coincidir el estado inicial. Retirar únicamente la delegación temporal concedida para esta operación, sin alterar permisos previos. No usar borrado de proyecto como rollback.

## Arquitectura recomendada y acceso público: otra decisión

Propuesta pendiente de seguridad y autorización pública: **Firebase Hosting → API Cloud Run HTTPS con JWT/RBAC → PostgreSQL privado**. El navegador llamaría directamente a la API existente; el frontend estático no guarda secretos de backend. No se propone BFF ni un dominio nuevo. El proyecto/servicio de Firebase real y el origen permitido se determinan después del inventario, antes de configurar CORS.

La apertura de ingress ya observada no resuelve la invocación desde un navegador. El JWT de aplicación y la autorización IAM de Run son capas distintas. Antes de permitir invocaciones anónimas en la capa Run hay que revisar autenticación, RBAC, aislamiento de tenants, CORS, rate limiting, proxies/IP y endpoints deliberadamente públicos; no se validaron en este inventario.

Diff conceptual futuro, **no aplicado y fuera de C2**:

```diff
 # Solo política del servicio federala-staging-api, tras revisión de seguridad
+roles/run.invoker: allUsers
 # Sin ampliar permisos SQL, secretos, GCS ni cambiar ingress/red
```

Reversa conceptual: quitar exclusivamente el binding `allUsers` que se hubiera agregado, conservando cualquier otro binding/condición. Guardar y comparar política antes/después; no restaurar una política completa que pise cambios concurrentes. No se propone deshabilitar el chequeo IAM como segundo cambio paralelo. [Opciones oficiales para acceso público de Run](https://docs.cloud.google.com/run/docs/authenticating/public).

## Consultas ejecutadas y resultados

Ejecutable utilizado: `gcloud.cmd` instalado, con autenticación existente. Se usaron `--format` con campos seleccionados; las lecturas IAM se redujeron a conteos de bindings públicos sin versionar miembros. Las llamadas REST llevaron token solo en memoria y no lo imprimieron.

| Consulta ejecutada | Resultado |
| --- | --- |
| `git status --short`, `git rev-parse HEAD`, `git branch --show-current`, `git remote -v`, `git branch --list docs/g4-platform-proposal` | Base correcta, limpio inicialmente, rama requerida ausente y origin conservado |
| `git branch -m docs/g4-platform-proposal` | Renombrada solo rama nueva autorizada |
| `gcloud services list --enabled --project=la-federala-staging-utn --format='value(config.name)'` | Exit 0; APIs relevantes en tabla anterior |
| `gcloud run services describe federala-staging-api --project=la-federala-staging-utn --region=southamerica-east1 --format=<proyección>` | Exit 0; servicio listo, ingress, red y escalado |
| `gcloud run revisions describe federala-staging-api-00001-7b4 --project=la-federala-staging-utn --region=southamerica-east1 --format=<proyección>` | Exit 0; digest y recursos |
| `gcloud run services get-iam-policy federala-staging-api --project=la-federala-staging-utn --region=southamerica-east1 --format=json` y proyección de roles | Exit 0; política directa vacía; confirmado mediante REST |
| `gcloud projects get-iam-policy la-federala-staging-utn --format=json`, reducido en memoria a conteos | Exit 0; 0 bindings públicos de `roles/run.invoker` a nivel proyecto |
| `gcloud sql instances list --project=la-federala-staging-utn --format=<proyección>` y `sql instances describe federala-staging-db` con el mismo proyecto | Exit 0; metadata SQL y protecciones |
| `gcloud run jobs list` y `run jobs describe` de cada nombre devuelto, proyecto y región explícitos | Exit 0; 2 jobs y capacidad/digests; no ejecuciones |
| `gcloud scheduler jobs list --project=la-federala-staging-utn --location=southamerica-east1 --format=<proyección>` | Exit 0; 1 job programado |
| `gcloud storage buckets list --project=la-federala-staging-utn --format=<proyección>`, `buckets describe` y `buckets get-iam-policy` del bucket devuelto con proyecto explícito | Exit 0; protecciones y conteo IAM directo |
| `gcloud compute networks list --project=la-federala-staging-utn --format=<proyección>`; `compute networks subnets list --project=la-federala-staging-utn --regions=southamerica-east1 --format=<proyección>` | Exit 0; redes y subredes regionales |
| Dos intentos `gcloud services describe <API> --project=la-federala-staging-utn --format='json(config.name,state)'` | **Fallaron**: subcomando `describe` no soportado por esta CLI. No hubo mutación; sustituidos por GET REST |
| Service Usage GET `/v1/projects/la-federala-staging-utn/services/firebase.googleapis.com?fields=config/name,state` y equivalente Hosting | HTTP exitoso; ambos DISABLED. No se volvió a invocar Firebase/Hosting tras confirmar la dependencia |
| Run REST GET v1 de política IAM del servicio y GET v2 del servicio con máscara `name,ingress,invokerIamDisabled,scaling,template(scaling,vpcAccess,timeout,maxInstanceRequestConcurrency,containers(resources))` | HTTP exitoso; confirmó política vacía, CPU idle, límites y red sin extraer envs |

El antecedente `SERVICE_DISABLED` no fue regenerado contra Firebase; esta corrida comprobó el estado DISABLED mediante Service Usage y se detuvo en esa dependencia. Un error de sintaxis CLI no es una falla de recursos ni una regresión del producto.

## Validación documental y pendientes humanos

Solo se agregaron este informe y el borrador AI, con intent-to-add para permitir revisar el diff sin commit. Se verificaron enlaces Markdown relativos y patrones de credenciales/datos personales en ambos documentos: PASS. El primer `git diff --check` detectó tres líneas con espacios finales de Markdown en el borrador AI; se eliminaron y se repitió la validación. No se ejecutaron tests, builds, lint de aplicación, HTTP de negocio, login, migraciones, seeds, jobs, logs, pruebas de restauración ni pruebas de carga; no corresponde atribuirles PASS. El baseline global de CI no se volvió a medir.

Pendientes de revisión: aprobar o rechazar C2, revisar presupuesto total, inventariar Firebase una vez autorizadas las APIs, resolver procedencia de imágenes, validar configuración pública de frontend/CORS, revisar acceso efectivo e identidades y aprobar por separado cualquier recurso o acceso público. El reviewer humano deberá revisar el diff y abrir un eventual PR en el repositorio canónico; esta tarea no lo crea ni aprueba.
