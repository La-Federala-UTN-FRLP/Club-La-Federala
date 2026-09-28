
> **Proyecto:** Club de Campo La Federala  
> **Entorno:** Staging  
> **Google Cloud Project ID:** `la-federala-staging-utn`  
> **Región principal:** `southamerica-east1` — São Paulo  
> **Estado:** Setup inicial listo para Checkpoint 1

---

# 1. Objetivo

Este documento registra la configuración inicial realizada en Google Cloud para el entorno de staging de La Federala.

La intención de esta etapa no fue desplegar todavía toda la aplicación, sino preparar una base de infraestructura coherente con la arquitectura definida previamente.

El setup inicial busca dejar preparado el proyecto para que, en los próximos avances, puedan incorporarse de manera progresiva:

- Cloud Run para el backend;
- Cloud SQL para PostgreSQL;
- Google Cloud Storage para archivos;
- Cloud Run Jobs y Cloud Scheduler;
- Secret Manager;
- CI/CD mediante GitHub Actions;
- observabilidad.

En esta etapa se priorizó crear solamente los recursos necesarios para establecer la base del proyecto, evitando provisionar infraestructura que todavía depende de decisiones pendientes o que corresponde a etapas posteriores.

---

# 2. Proyecto de Google Cloud

Se creó un proyecto independiente destinado exclusivamente a staging.

```text
Nombre:
La Federala - Staging

Project ID:
la-federala-staging-utn
```

Este proyecto se utilizará para:

- pruebas de integración;
- despliegues de preproducción;
- validaciones técnicas;
- demos;
- pruebas con infraestructura Cloud;
- futuras pruebas junto al cliente.

La decisión de separar staging de producción busca evitar que pruebas, cambios o errores del equipo afecten datos o recursos productivos.

El entorno productivo se creará más adelante como un proyecto independiente.

---

# 3. Facturación

El proyecto quedó vinculado a una cuenta de facturación activa.

La cuenta dispone de los créditos promocionales que no da GCP que serán utilizados durante la etapa de staging para:

- validar la arquitectura;
- realizar pruebas reales;
- estimar consumo;
- obtener una referencia más precisa del costo productivo futuro
- aprender para la materia.

El objetivo no es consumir los créditos sin control, sino utilizarlos para conocer mejor el comportamiento económico de la arquitectura antes de trasladarla a producción.

---

# 4. Presupuesto y alertas

Se configuró un presupuesto mensual específico para el proyecto de staging.

```text
Presupuesto mensual:
USD 30
```

El presupuesto se aplica únicamente al proyecto:

```text
la-federala-staging-utn
```

y contempla todos los servicios utilizados por el proyecto.

Se configuraron los siguientes umbrales:

| Umbral | Importe | Tipo |
|---|---:|---|
| 50% | USD 15 | Gasto real |
| 80% | USD 24 | Gasto real |
| 100% | USD 30 | Gasto real |
| 100% | USD 30 | Gasto previsto |

Las alertas se envían por correo electrónico a los administradores de facturación.

## Importante

El presupuesto funciona como mecanismo de monitoreo y alerta.

No constituye un límite absoluto que detenga automáticamente todos los servicios cuando se alcanzan USD 30.

Por ese motivo, en etapas posteriores el control de costos se complementará con:

- dimensionamiento conservador de Cloud SQL;
- límites de instancias de Cloud Run;
- cuotas;
- configuración específica de los servicios que lo permitan.

---

# 5. Región principal

Se definió como región principal:

```text
southamerica-east1
São Paulo
```

Esta región será utilizada, salvo necesidad justificada, por los recursos regionales del proyecto.

La intención es mantener próximos entre sí:

- Cloud Run;
- Cloud SQL;
- Cloud Storage;
- Cloud Run Jobs;
- Artifact Registry.

Esto simplifica la arquitectura y evita distribuir innecesariamente recursos entre distintas regiones.

---

# 6. APIs habilitadas

Se habilitaron las APIs necesarias para los servicios que forman parte de la arquitectura propuesta.

## Artifact Registry API

```text
artifactregistry.googleapis.com
```

Permite administrar los repositorios donde se almacenarán las imágenes Docker del backend.

---

## Cloud Run Admin API

```text
run.googleapis.com
```

Permitirá desplegar y administrar:

- Cloud Run Service;
- Cloud Run Jobs.

En esta etapa todavía no se creó ningún servicio Cloud Run.

---

## Secret Manager API

```text
secretmanager.googleapis.com
```

Permitirá almacenar y administrar secretos como:

- `JWT_SECRET`;
- credenciales de base de datos;
- futuras API keys externas.

Todavía no se crearon secretos reales.

---

## Cloud SQL Admin API

```text
sqladmin.googleapis.com
```

Permitirá crear y administrar la futura instancia PostgreSQL.

Cloud SQL todavía no fue provisionado.

---

## Cloud Scheduler API

```text
cloudscheduler.googleapis.com
```

Permitirá programar la ejecución del Job de expiraciones.

Todavía no se creó ningún Scheduler.

---

## Google Cloud Storage JSON API

```text
storage-api.googleapis.com
```

La API ya se encontraba habilitada en el proyecto.

Será utilizada por el backend para trabajar con archivos almacenados en Google Cloud Storage.

Todavía no se creó el bucket definitivo.

---

# 7. Artifact Registry

Se creó un repositorio Docker para almacenar las imágenes del backend.

```text
Nombre:
federala-backend

Formato:
Docker

Tipo:
Estándar

Región:
southamerica-east1
```

La función futura del repositorio será:

```text
Código backend
      ↓
Docker build
      ↓
Artifact Registry
      ↓
Cloud Run Service
Cloud Run Job
```

La misma imagen base será utilizada tanto por el backend web como por el Job de expiraciones, ejecutando comandos diferentes según el workload.

## Configuración inicial

Se dejó configurado:

- cifrado administrado por Google;
- etiquetas de imagen inmutables deshabilitadas;
- sin políticas de limpieza activas;
- análisis de vulnerabilidades deshabilitado;
- configuración de logs heredada del proyecto.

Estas configuraciones podrán revisarse cuando exista un flujo real de build y releases.

Actualmente el repositorio está vacío, lo cual es esperado porque todavía no se realizó la containerización productiva del backend.

---

# 8. Service Accounts

Se crearon cuentas de servicio independientes para evitar que todos los componentes utilicen una misma identidad.

Actualmente las cuentas no poseen claves JSON descargadas.

---

## `federala-web-sa`

```text
federala-web-sa@la-federala-staging-utn.iam.gserviceaccount.com
```

Responsabilidad futura:

```text
Cloud Run Service
→ Backend web
```

Más adelante recibirá únicamente los permisos que necesite para acceder a:

- Cloud SQL;
- Cloud Storage;
- secretos específicos.

---

## `federala-expirations-sa`

```text
federala-expirations-sa@la-federala-staging-utn.iam.gserviceaccount.com
```

Responsabilidad futura:

```text
Cloud Run Job
→ expiración de reservas y promociones
```

Se mantiene separada del backend web porque este workload debería necesitar un conjunto de permisos menor.

---

## `federala-scheduler-sa`

```text
federala-scheduler-sa@la-federala-staging-utn.iam.gserviceaccount.com
```

Responsabilidad futura:

```text
Cloud Scheduler
→ ejecutar Expirations Job
```

No debería necesitar acceso directo a:

- Cloud SQL;
- Cloud Storage;
- secretos de aplicación.

---

## `federala-deployer-sa`

```text
federala-deployer-sa@la-federala-staging-utn.iam.gserviceaccount.com
```

Responsabilidad futura:

```text
GitHub Actions
      ↓
Workload Identity Federation
      ↓
federala-deployer-sa
      ↓
deploy
```

Esta identidad se utilizará para CI/CD.

La intención es evitar almacenar Service Account JSON Keys dentro de GitHub.

---

# 9. Política de claves

No se crearon ni descargaron claves JSON para las cuentas de servicio del proyecto.

El objetivo es utilizar identidades administradas y credenciales temporales siempre que sea posible.

Para CI/CD se prevé utilizar:

```text
GitHub Actions
→ OIDC
→ Workload Identity Federation
→ federala-deployer-sa
```

De esta forma, GitHub no necesitará almacenar una clave privada permanente de Google Cloud.

---

# 10. IAM del equipo

Se configuró acceso individual para los integrantes del equipo.

## Administración

El responsable actual del proyecto mantiene permisos administrativos sobre staging.

## Resto del equipo

Los demás integrantes fueron incorporados con rol:

```text
Visualizador
roles/viewer
```

Este rol permite inspeccionar:

- recursos;
- configuración;
- Service Accounts;
- APIs;
- infraestructura creada;

sin poder modificar el proyecto. Esto para evitar problemas para la entrega 1 pero instantáneamente luego se darán roles amplios para que la división de tareas pueda ser realizada.

Durante las próximas etapas podrán asignarse permisos más específicos si algún integrante necesita trabajar directamente sobre un servicio determinado.

---

# 11. Cuenta de servicio automática de Compute Engine

Google creó automáticamente una cuenta de servicio de Compute Engine asociada al proyecto.

Actualmente posee un rol amplio (`Editor`).

Esta configuración no fue modificada durante el setup inicial para evitar realizar cambios sin conocer todavía si algún servicio futuro dependerá de ella.

Queda registrada como punto de revisión dentro del hardening posterior de IAM.

---

# 12. Recursos que todavía no fueron creados

El setup inicial no incluye todavía los siguientes recursos:

```text
Cloud Run Service
Cloud Run Job
Cloud SQL
Cloud Storage Bucket
Cloud Scheduler
Secret Manager secrets
Firebase Hosting
Workload Identity Federation
GitHub Actions CD
VPC
```

Esto es intencional.

La creación de estos componentes se realizará de forma incremental durante las etapas siguientes.

---

# 13. Decisiones pendientes

Quedan principalmente dos decisiones técnicas abiertas.

## Frontend Hosting

Actualmente la opción preferida es:

```text
Firebase Hosting
```

pero todavía debe validarse definitivamente frente a alternativas como Vercel.

---

## Networking de Cloud SQL

Todavía se evalúa entre:

```text
Public IP + conexión segura
```

y:

```text
Private IP
+
VPC
+
Direct VPC Egress
```

Cloud SQL no se creará hasta resolver esta decisión.

---

# 14. Inteligencia Artificial

La incorporación de Inteligencia Artificial forma parte de los requisitos académicos del proyecto.

Todavía no se definió suficientemente el caso de uso.

Existe interés en utilizar IA en funcionalidades relacionadas con reportes, pero no se seleccionará proveedor, modelo ni arquitectura hasta definir primero la necesidad concreta.

---

# 15. Estado del setup

Al finalizar esta etapa se encuentra configurado:

```text
Proyecto staging                  ✅
Billing                           ✅
Budget y alertas                  ✅
Región principal definida         ✅
APIs base                         ✅
Artifact Registry                 ✅
Service Accounts                  ✅
IAM humano inicial                ✅
```

Todavía pendiente:

```text
Runtime Cloud                     ⏳
Base de datos                     ⏳
Storage                           ⏳
Jobs/Scheduler                    ⏳
Secrets reales                    ⏳
CI/CD completo                    ⏳
Frontend hosting                  ⏳
Observabilidad desplegada         ⏳
```

---