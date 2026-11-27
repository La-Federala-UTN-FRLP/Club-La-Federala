# G4 · T3 — Plataforma y cierre documental de C2

Actualización: 2026-11-27. **C2 completado y reutilización del sitio existente aprobada por coordinación; C1 BLOQUEADO; C3 pendiente, no aprobado; T5 no iniciado.** C2 no aprueba exposición de Cloud Run, despliegue ni nuevas modificaciones Cloud. Revisor propuesto: Santiago, con validación Nicolas. Refs #290.

## Procedencia y límites

El inventario inicial del 2026-11-26 se realizó sobre `84490e678b388fa6053fcfe262167412ea0f40e7`: ambas APIs Firebase estaban DISABLED y sus recursos eran desconocidos. Es evidencia histórica, sustituida para Firebase por la auditoría posterior del 2026-11-27, 18:26–18:27 UTC. No se interpreta la situación inicial como inexistencia de recursos ni como estado vigente.

La actualización documental parte del main canónico `7f5597bae624967554c0da1116817f7e41e87746`, preservando previamente el trabajo propio mediante commit y respaldo local. Rama: `docs/g4-platform-proposal`; repositorio canónico: `La-Federala-UTN-FRLP/Club-La-Federala`. Origin conserva el fork. No se modificaron otras ramas o archivos de otros frentes.

Se consultaron `CONTRIBUTING.md`, el PR template y `AI-DECISIONS.md` canónico, con última entrada real AI-041. No se encontró `AGENTS.md` aplicable en checkout o ancestros consultados. El registro central queda reservado al coordinador; [ai/T3.md](ai/T3.md) es un insumo temporal sin ID definitivo para consolidación posterior.

En esta actualización **no hubo llamadas a recursos Cloud**: se reutilizaron las capturas privadas y el informe de auditoría entregados por coordinación, junto con documentación oficial pública. No se obtuvieron valores de claves, tokens, secretos, configuraciones de apps ni envs completas; tampoco datos o logs de aplicación. Las rutas privadas, identidades personales, identificadores de claves y detalle de seguridad no se incorporan al repositorio.

## Estado Firebase observado y autorizado

| Elemento | Evidencia del 2026-11-27 | Interpretación y límite |
| --- | --- | --- |
| Proyecto GCP/Firebase | `projectId=la-federala-staging-utn`, `projectNumber=28822223940`, FirebaseProject ACTIVE, projects.get HTTP 200 | Identificadores conservados, no proyecto nuevo |
| Asociación | Auditoría AddFirebase con operación terminada y respuesta del proyecto, sin error final | Asociación completada por el responsable en consola; los intentos REST fallidos anteriores no describen el resultado final |
| Facturación | billingEnabled=true y mismo vínculo de cuenta antes/después | Blaze por regla oficial; projects.get no devolvió un campo plan. Sin cambio de cuenta, auditoría de factura ni garantía de costo cero |
| Sitio | `la-federala-staging-utn`, tipo DEFAULT_SITE | Reutilización aprobada; no crear otro sitio ni una app Firebase innecesaria |
| URL Hosting | `https://la-federala-staging-utn.web.app`, devuelta por API | URL del sitio vacío, no evidencia de frontend funcional |
| Canal | Solo `live` | Canal no equivale a release |
| Publicación | 0 versiones, 0 releases del sitio y 0 releases de live; listados completos HTTP 200 | No hay despliegue observado en las capturas |
| Apps | 0 web, 0 Android, 0 iOS; listados completos HTTP 200 | No registrar una app solo para alojar estáticos |
| Dominios | 0 customDomains, listado completo HTTP 200 | No crear dominios. `la-federala-staging-utn.firebaseapp.com` deriva de la regla oficial; no fue devuelto como customDomain ni probado por HTTP/DNS |
| Analytics | getAnalyticsDetails HTTP 404 NOT_FOUND, con proyecto ACTIVE | Sin vínculo encontrado; consistente con la elección de no habilitarlo. No se inventariaron propiedades externas |
| Labels | `firebase=enabled`, `firebase-core=disabled` | Valores literales; sin semántica acreditada del segundo ni contradicción demostrada con ACTIVE |

Billing implica Blaze según [Firebase sobre un proyecto GCP existente](https://firebase.google.com/docs/projects/use-firebase-with-existing-cloud-project). Hosting es global: la región de Run/SQL no se asigna al sitio. [Reglas del sitio predeterminado](https://firebase.google.com/docs/hosting/default-site). No se atribuye el disparador exacto de la creación del sitio: la consulta específica de auditoría no obtuvo un evento que lo demostrara.

## APIs: resultado real, no previsión

La comparación posterior a la asociación registra **57 → 67 APIs habilitadas, diez adiciones y ninguna baja**. `firebase.googleapis.com` y `firebasehosting.googleapis.com` ya estaban habilitadas en el baseline inmediato previo a la asociación. Las diez adiciones son:

| API añadida | API añadida |
| --- | --- |
| `cloudresourcemanager.googleapis.com` | `fcm.googleapis.com` |
| `firebaseinstallations.googleapis.com` | `firebaseremoteconfig.googleapis.com` |
| `firebaseremoteconfigrealtime.googleapis.com` | `firebaserules.googleapis.com` |
| `identitytoolkit.googleapis.com` | `runtimeconfig.googleapis.com` |
| `securetoken.googleapis.com` | `testing.googleapis.com` |

`appengine.googleapis.com` (App Engine Admin) y `firebasedynamiclinks.googleapis.com` siguen **DISABLED**, comprobadas individualmente. La previsión condicional de 69 APIs no se materializó y no es criterio para habilitarlas: el proyecto ya está ACTIVE. Pub/Sub estaba habilitada antes. No inferir uso, facturación o APIs habilitadas a partir de las restricciones de una clave.

## Revisión de metadatos IAM y de clave

Las cuentas listables pasaron de 6 a 7. La nueva cuenta `firebase-adminsdk-fbsvc` recibió `roles/firebase.sdkAdminServiceAgent` y `roles/iam.serviceAccountTokenCreator` **en el proyecto**. La auditoría atribuye ambas altas al agente Firebase Management. Ese agente ya existía desde la habilitación C2; no se cuenta como nueva identidad de esta asociación. No se observaron bajas o cambios de vinculaciones anteriores. Los agentes gestionados no necesariamente aparecen en serviceAccounts.list.

Token Creator contiene permisos para credenciales temporales y firma; no es solo autorización OIDC. El nivel proyecto se hereda a recursos descendientes pertinentes y es más amplio que una concesión sobre una cuenta específica. Eso no concede por sí solo acceso a cualquier dato: evaluar por principal, permiso y recurso las políticas allow heredadas/directas y sus condiciones, deny y límites de acceso del principal aplicables. No se probó acceso ni se usó el rol. [Definición del rol](https://docs.cloud.google.com/iam/docs/roles-permissions/iam#iam.serviceAccountTokenCreator), [herencia IAM](https://docs.cloud.google.com/iam/docs/resource-hierarchy-access-control), [evaluación IAM](https://docs.cloud.google.com/policy-intelligence/docs/troubleshoot-access).

Revisión humana de mínimo privilegio pendiente: documentar necesidad gestionada por Firebase, recursos que la requieren y alternativas de alcance admitidas por el producto. Ser automático no acredita necesidad mínima ni autoriza revocarlo; cualquier cambio exige evaluación de impacto y autorización separada. No se recomiendan concesiones adicionales ni remediaciones automáticas.

Se observó una Browser key nueva con **27 API targets**, sin `generativelanguage.googleapis.com`. Se cotejó con la tabla oficial de APIs relacionadas con Firebase: 24 coincidencias y 3 objetivos no enumerados, cuyo detalle y revisión de restricciones de aplicación quedan en evidencia privada para seguridad. Una allowlist de APIs no acredita restricción de origen HTTP ni permisos IAM; tampoco obliga a habilitar APIs de la tabla que no figuren en la clave. No se obtuvo su valor ni se cambió la clave. React con JWT hacia Cloud Run no debe incorporarla por su mera existencia. [Guía oficial de claves Firebase](https://firebase.google.com/docs/projects/api-keys).

## Plataforma GCP: último inventario histórico conservado

Esta tabla mantiene el corte del **2026-11-26** y no afirma una reverificación de Run/SQL/GCS/Jobs el 27. Las capturas Firebase posteriores no prueban cambios ni continuidad de todos esos controles.

| Recurso | Metadata observada el 26 | Límite |
| --- | --- | --- |
| Run `federala-staging-api` | Ready=True; revisión `federala-staging-api-00001-7b4`, tráfico 100%; 1 vCPU/1 GiB, concurrencia 10, timeout 60 s, CPU idle y startup boost habilitados | Sin prueba funcional ni de carga |
| Escalado Run | Máximo servicio 5 y template/revisión 1; mínimos omitidos | No presentar capacidad efectiva de 5 instancias ni reserva positiva verificada |
| Ingress e IAM | Ingress all, política directa con 0 bindings, 0 bindings públicos run.invoker en proyecto, invokerIamDisabled omitido en respuesta v2 | Sin auditoría de herencia organizacional ni HTTP anónimo; ingress no prueba acceso público |
| Red | Direct VPC egress PRIVATE_RANGES_ONLY, `federala-staging-vpc` / `federala-staging-subnet`; Private Google Access=True; también existe red default | La salida a SQL no demuestra topología de ingreso/proxies |
| SQL `federala-staging-db` | PostgreSQL 17, RUNNABLE, db-g1-small, ZONAL, SSD 20 GB, IPv4 pública deshabilitada, red privada, backups y protección de borrado, ENCRYPTED_ONLY | PITR no confirmado; sin lectura SQL ni restauración probada |
| Run Jobs | Expiraciones: 1 tarea/paralelismo 1, 1 vCPU/512 MiB, 600 s, 0 retries; migraciones: 1 tarea/paralelismo 1, 1 vCPU/1 GiB, 900 s, 0 retries | `federala-staging-expirations` y `federala-staging-migrate` no ejecutados; existencia no acredita esquema migrado |
| Scheduler | `federala-staging-expirations-daily`, ENABLED, `0 9 * * *`, America/Argentina/Buenos_Aires, POST, deadline 60 s | Estado preexistente; no ejecutado ni modificado |
| GCS | `federala-staging-files-28822223940`, STANDARD, SOUTHAMERICA-EAST1; PAP enforced, UBLA=True, 0 bindings públicos directos, soft delete 7 días | Sin objetos, firmas o recuperación probados; versionado/retención inmutable no confirmados |

Digest API observado: `sha256:61550f344b1259c85a86f7b56b10a8921c0accf5f6dcef6973a5a231148de0ac`. Expiraciones: `sha256:632756ac9ed63cd659c9630acb7cdc485590b45965354599aae20b624cc3574b`. Migraciones: `sha256:bfefaeffac79154208b50c4f3d7316d914b43eea86cce222c7952d5c3cad67cf`. No se estableció correspondencia con SHA de código ni compatibilidad entre imágenes. FRONTEND_URL y NODE_ENV no verificados en T3; no se extrajeron envs completas.

## Arquitectura e invocación pública: propuesta futura única

Recomendación: **Hosting existente → API Cloud Run HTTPS con JWT/RBAC → PostgreSQL privado**. Sin BFF, dominios inventados ni secretos de backend en frontend. Origen/CORS y build con valores aprobados quedan sujetos a C3. La URL de Hosting conocida no implica aprobación de endpoint API ni publicación.

Tras resolver C1, aprobar C3 y autorizar expresamente la exposición, se propone **desactivar Invoker IAM check solo en `federala-staging-api`**, sin agregar allUsers. Es el mecanismo recomendado por Google. Diff conceptual pendiente, no aplicado:

```diff
 # Servicio existente, proyecto la-federala-staging-utn
 # Región southamerica-east1; conservar políticas, ingress y red
+invokerIamDisabled: true
```

La [documentación oficial de acceso público Run](https://docs.cloud.google.com/run/docs/authenticating/public) enumera `run.services.create`, `run.services.update` y `run.services.setIamPolicy` para desactivar/restablecer el control. Incluidos en roles/run.admin; no se concedió ese rol ni se propone crear un servicio. Verificar permisos efectivos del operador para el flujo autorizado y constraints `run.managed.requireInvokerIam` y, donde corresponda, `run.requireInvokerIam`. No modificar constraints para eludir una restricción.

La alternativa allUsers mantiene el control IAM y agrega roles/run.invoker, requiere setIamPolicy y está sujeta a restricciones de compartición por dominio. No es la recomendación elegida ni un fallback automático. Ambos mecanismos admiten solicitudes anónimas en la capa Run; JWT/RBAC siguen en backend y no sustituyen rate limiting/identidad IP de C1. La carga pública puede aumentar costos.

Rollback futuro: restablecer el control (`invokerIamDisabled: false`; opción CLI documentada `--invoker-iam-check`) y verificar, en ventana autorizada, configuración efectiva, ausencia de bindings públicos y rechazo anónimo. Preservar demás permisos; no reemplazar la política completa ni confiar en revertir solo imagen/revisión. Revisar efectos del flujo de consola sobre bindings públicos antes de usarlo. Ninguna instrucción de este apartado se ejecutó.

## C2 completado: límites de continuidad y reversa

La instrucción vigente aprueba reutilizar DEFAULT_SITE y proyecto homónimos con billing existente Blaze, sin Analytics ni apps innecesarias. Se conserva el resultado observado de APIs, identidades, sitio y clave; no se habilitan servicios para igualar una previsión. La revisión de seguridad de metadatos no se presenta como aprobación de mínimo privilegio.

La antigua propuesta de volver ambas APIs a DISABLED era condicional, anterior a la asociación. **No es rollback integral de C2 actual:** añadir Firebase a un proyecto existente no se puede deshacer completamente según la [regla oficial](https://firebase.google.com/docs/projects/use-firebase-with-existing-cloud-project). No borrar proyecto/sitio/identidades, desvincular billing ni revocar roles para simular reversión. Una reversa parcial requiere inventariar dependencias, acordar impacto y autorización específica, sin force/cascada. No se ejecuta en este frente.

## Costos con supuestos

Sin auditoría de consumo o factura. El mismo billing conserva costos GCP previos; Blaze no es presupuesto ni garantía de gasto cero. La captura sin versiones/releases no prueba una factura futura.

- Hosting: la [tabla de precios](https://firebase.google.com/pricing), consultada el 27, publica 10 GB de almacenamiento gratuito, luego USD 0,026/GB; transferencia extra USD 0,15/GB. Ejemplo sobre cantidades ya facturables: 20 GB extra almacenados y 20 GB extra transferidos → USD 3,52, sin impuestos; no es pronóstico. La tabla expresa transferencia gratuita de 360 MB/día y la [guía de Hosting](https://firebase.google.com/docs/hosting/usage-quotas-pricing) usa 10 GB/mes; reconciliar período/plan en presupuesto humano.
- Run, SQL, GCS, Scheduler, imágenes, secretos y observabilidad siguen generando costos según uso. El inventario del 26 no midió horas SQL, almacenamiento/operaciones, requests, vCPU-s/GiB-s o transferencia; no permite total mensual. Referencias: [Run](https://cloud.google.com/run/pricing), [SQL](https://cloud.google.com/sql/pricing), [GCS](https://cloud.google.com/storage/pricing), [Scheduler](https://cloud.google.com/scheduler/pricing).
- Completar C2 no aprueba gasto ilimitado, nuevos recursos o carga pública. Se requiere presupuesto con región southamerica-east1 para Run/SQL y franquicias efectivas de la cuenta antes de la siguiente operación autorizada.

## Verificación, errores históricos y entrega

Consultas originales del 26: gcloud list/describe/get-iam-policy de Run/revisión, SQL metadata, Jobs, Scheduler, buckets y redes, con proyecto explícito y región/ubicación donde aplica; Service Usage GET de ambas APIs. Resultados exitosos del corte histórico. Dos intentos gcloud services describe fallaron por subcomando no soportado y se sustituyeron por GET REST. No se inventa un PASS de aplicación a partir del inventario.

La auditoría del 27 suministrada por coordinación incluye JSON de estados/diff y listados completos de Hosting/apps, metadata IAM/clave y auditoría de asociación/altas IAM. Una consulta inicial de versiones falló HTTP 400 por campo inválido; la corregida dio HTTP 200 y cero versiones. Se conserva esa trazabilidad sin repetir Cloud calls. El 404 de vínculo Analytics no es fallo de asociación.

Verificación local de esta actualización: PASS del merge-base contra el SHA canónico, diff solo de dos documentos T3, registro central sin cambios, whitespace, enlaces relativos, contraste de cifras/listados JSON y escaneo acotado de datos sensibles; 37 checksums de evidencia privada verificados. Es validación documental, sin suites/build/lint de producto, staging HTTP, login, jobs, migraciones, seeds, logs, restauraciones o carga; no se atribuye PASS funcional ni se reevalúa el baseline CI.

El borrador privado de PR sigue el template y usa Refs #290, revisor Santiago con validación Nicolas. Sin push/PR ni cambios en issues/Projects. Pendientes: revisión humana de documentos y metadatos, consolidación AI por el coordinador, C1 bloqueado, C3 no aprobado y autorización posterior de exposición/publicación; el sitio vacío no completa los criterios de despliegue, login, navegación por rol o recarga SPA de #290.

## Cierre de coordinación del registro AI

Después de las cuatro entregas se consolidaron AI-042 a AI-045 en AI-DECISIONS.md de esta rama, con aportes T1/T2/T3/T4 y validaciones humanas diferenciados. Los insumos temporales se sustituyeron por referencias para evitar duplicados. Las menciones anteriores a consolidación pendiente describen el estado de entrega de los workers; ahora queda pendiente la revisión e integración humana. Esta PR documental se propone primero; las demás ramas deberán actualizarse tras esa integración autorizada. No se realizó ningún merge ni publicación.
