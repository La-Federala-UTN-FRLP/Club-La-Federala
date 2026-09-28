
> **Proyecto:** Club de Campo La Federala  
> **Materia:** Desarrollo de Software Cloud — UTN FRLP  
> **Checkpoint:** 1 — Definición de Arquitectura  
> **Fecha:** 28/09/2026  
> **Entorno Cloud preparado:** Staging

---

# 1. Objetivo del checkpoint

El objetivo de esta primera entrega es presentar la arquitectura Cloud propuesta para La Federala y demostrar que comenzó su preparación técnica mediante:

- definición de arquitectura;
- diagrama Cloud;
- setup inicial de infraestructura;
- actividad incremental en el repositorio;
- documentación de decisiones y próximos pasos.

En esta instancia no se busca tener todavía toda la aplicación desplegada en Google Cloud.

El despliegue operativo del backend, la integración con la infraestructura y las pruebas de integración se realizarán progresivamente en las etapas siguientes.

---

# 2. Arquitectura Cloud

La propuesta completa se encuentra documentada en:

**[Arquitectura Cloud](./arquitectura-cloud.md)**

El documento incluye:

- arquitectura actual (`CURRENT`);
- arquitectura objetivo (`TARGET v1`);
- criterios utilizados para tomar decisiones;
- alternativas evaluadas;
- seguridad e identidad;
- CI/CD;
- observabilidad;
- separación de ambientes;
- costos y dimensionamiento inicial;
- decisiones todavía abiertas;
- posibles evoluciones futuras.

---

# 3. Diagramas

Se prepararon dos diagramas principales.

## Arquitectura CURRENT

Representa el estado actual de la aplicación antes de completar la migración Cloud.

Incluye:

```text
React + Vite
        ↓
Node.js + Express
        ↓
Prisma
        ↓
PostgreSQL
```

junto con:

- Supabase Storage;
- runner independiente de expiraciones.

---

## Arquitectura TARGET v1

Representa la arquitectura Cloud propuesta.

Principales componentes:

```text
Frontend Hosting 🟡
        ↓
Cloud Run Service
        │
        ├── Cloud SQL PostgreSQL
        ├── Google Cloud Storage
        └── Secret Manager

Cloud Scheduler
        ↓
Cloud Run Job
        ↓
Cloud SQL

GitHub Actions
        ↓
Workload Identity Federation
        ↓
Artifact Registry
        ↓
Cloud Run

OpenTelemetry
        ↓
Google Cloud Observability
```

Las decisiones todavía abiertas están indicadas explícitamente en el diagrama y en la documentación.

---

# 4. Decisiones arquitectónicas principales

| Área | Decisión | Estado |
|---|---|---|
| Backend | Cloud Run Service | ✅ Definida |
| Base de datos | Cloud SQL PostgreSQL | ✅ Definida |
| Archivos | Google Cloud Storage | ✅ Definida |
| Jobs | Cloud Run Jobs | ✅ Definida |
| Scheduling | Cloud Scheduler | ✅ Definida |
| Secretos | Secret Manager | ✅ Definida |
| Identidad | IAM + Service Accounts | ✅ Definida |
| Frontend | Firebase Hosting | 🟡 Preferido / pendiente validación final |
| Observabilidad | Google Cloud Observability | ✅ Definida |
| Instrumentación | OpenTelemetry | ✅ Incorporación progresiva |
| CI/CD | GitHub Actions | ✅ Definida |
| Registry | Artifact Registry | ✅ Definida |
| GitHub → GCP | Workload Identity Federation / OIDC | ✅ Definida |
| Entornos | Staging y producción separados | ✅ Definida |
| Región | `southamerica-east1` | ✅ Definida |
| Networking DB | Public IP segura vs Private IP + VPC | 🟡 Pendiente |
| Inteligencia Artificial | Caso de uso todavía en definición | 🟡 Pendiente |

---

# 5. Setup inicial de Google Cloud

La configuración realizada se encuentra documentada en:

**[Setup inicial de Google Cloud](./setup-gcp.md)**

El entorno creado corresponde a:

```text
Nombre:
La Federala - Staging

Project ID:
la-federala-staging-utn

Región principal:
southamerica-east1 — São Paulo
```

---

## Infraestructura/configuración completada

```text
Proyecto GCP                    ✅
Billing                         ✅
Budget + alertas                ✅
Región definida                 ✅
APIs base                       ✅
Artifact Registry               ✅
Service Accounts                ✅
IAM inicial del equipo          ✅
```

---

# 6. Control de costos

El proyecto cuenta con un presupuesto mensual inicial de:

```text
USD 30
```

Se configuraron alertas de:

```text
50% real      → USD 15
80% real      → USD 24
100% real     → USD 30
100% previsto → USD 30
```

El objetivo es utilizar staging para obtener datos reales de consumo antes de definir el presupuesto de producción.

El presupuesto funciona como mecanismo de monitoreo y alerta y no como un corte absoluto de todos los servicios.

---

# 7. Artifact Registry

Se creó el repositorio:

```text
federala-backend
```

Configuración:

```text
Formato: Docker
Tipo: Estándar
Región: southamerica-east1
```

Será utilizado posteriormente para almacenar la imagen Docker del backend.

La arquitectura prevé reutilizar la misma imagen para:

```text
Cloud Run Service
+
Cloud Run Job
```

ejecutando comandos diferentes según el workload.

Actualmente el repositorio se encuentra vacío, ya que la containerización productiva corresponde a la siguiente etapa.

---

# 8. Identidades de servicio

Se crearon las siguientes Service Accounts:

```text
federala-web-sa
federala-expirations-sa
federala-scheduler-sa
federala-deployer-sa
```

Responsabilidades previstas:

| Service Account | Responsabilidad |
|---|---|
| `federala-web-sa` | ejecución del backend web |
| `federala-expirations-sa` | ejecución del Job de expiraciones |
| `federala-scheduler-sa` | disparo programado del Job |
| `federala-deployer-sa` | CI/CD y despliegues |

No se crearon claves JSON para estas identidades.

La asignación futura de permisos seguirá el principio de mínimo privilegio.

---

# 9. APIs preparadas

Actualmente se encuentran habilitadas las APIs necesarias para la arquitectura inicial:

```text
Artifact Registry API
Cloud Run Admin API
Secret Manager API
Cloud SQL Admin API
Cloud Scheduler API
Google Cloud Storage JSON API
```

Habilitar una API no implica que el recurso correspondiente ya se encuentre desplegado.

---

# 10. Recursos deliberadamente no creados todavía

Todavía no fueron provisionados:

```text
Cloud Run Service
Cloud Run Job
Cloud SQL
Cloud Storage Bucket
Cloud Scheduler
Secretos reales
Firebase Hosting
Workload Identity Federation
CI/CD completo
VPC
```

Esta decisión es intencional.

El objetivo del Checkpoint 1 es definir y comenzar el setup de la arquitectura, no desplegar prematuramente componentes que pertenecen a las siguientes etapas.

---

# 11. Repositorio y proceso de ingeniería

El proyecto utiliza GitHub como repositorio principal y mantiene un proceso incremental de trabajo.

Actualmente se utiliza:

- ramas de corta duración;
- Pull Requests;
- revisión cruzada;
- Conventional Commits;
- GitHub Projects;
- documentación técnica versionada;
- seguimiento de trabajo mediante issues/tareas.

Repositorio:

**[Club-La-Federala](../../README.md)**

> Si la entrega se consulta desde GitHub, la navegación principal puede realizarse desde el repositorio y la carpeta `docs/cloud`.

---

# 12. Próximos pasos

Después del Checkpoint 1 comenzará la preparación para la siguiente entrega.

Roadmap técnico previsto:

```text
Containerización productiva del backend
        ↓
Build local y validación de imagen
        ↓
Artifact Registry
        ↓
Primer deployment en Cloud Run
        ↓
Cloud SQL
        ↓
Migración / integración PostgreSQL
        ↓
Google Cloud Storage
        ↓
Cloud Run Job + Scheduler
        ↓
Frontend staging
        ↓
Observabilidad
        ↓
CI/CD
        ↓
Pruebas de integración
```

Cada etapa será implementada y validada antes de avanzar a la siguiente.

---

# 13. Documentación relacionada

- **[Arquitectura Cloud](./arquitectura-cloud.md)**
- **[Setup inicial de Google Cloud](./setup-gcp.md)**
- Diagramas `CURRENT` y `TARGET v1` incluidos en la documentación de arquitectura.
