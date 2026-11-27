# G4 T2 — Preparación frontend y Hosting, sin publicar

Fecha: 2026-11-26. Issue de coordinación: #290. Estado: diff para revisión humana, sin publicación ni aprobación propia.

## Identidad y alcance

- Task: `task_d634a292e336`; dispatch: `ctx_7cc84f0e6799`.
- Worktree: `g4-t2-frontend`, hijo de `g4-base`, ejecución local.
- Rama: `chore/g4-frontend-preparation`. Se verificó su ausencia y se renombró solamente la rama nueva creada por Orca.
- Base y HEAD final, sin commits: `84490e678b388fa6053fcfe262167412ea0f40e7`. Estado inicial limpio.
- Repositorio canónico para futuras consultas/PR: `La-Federala-UTN-FRLP/Club-La-Federala`. `origin` conserva `justinasmith1/Club-La-Federala`; no hubo push ni PR.
- Revisión humana propuesta: Nicolas; coordinación: Santiago. La revisión y el eventual PR siguen pendientes.

Se consultaron `CONTRIBUTING.md`, `.github/pull_request_template.md`, `AI-DECISIONS.md` y las convenciones de código. No se encontraron `AGENTS.md` aplicables en el checkout ni sus directorios ascendentes inspeccionados. El registro de IA queda exclusivamente en [ai/T2.md](ai/T2.md), sin modificar el registro central.

## Revisión y cambios

| Área | Evidencia en la base y resultado |
| --- | --- |
| React/Vite | Frontend JSX, React 19 y React Router 7; Vite instalado por lockfile: 6.4.1. Sin cambios de stack ni dependencias. |
| Base API | `VITE_API_BASE_URL` canónica incluyendo `/api`; `VITE_API_BASE` queda como fallback legacy. Se quitan espacios externos y barras finales para evitar `//` al concatenar. Se preserva proxy local de desarrollo, con matching exacto de hostname local. |
| Hosting | Nuevo `firebase.json` en raíz: `public: frontend/dist`, fallback `**` a `/index.html`. Sin asociación a proyecto/sitio ni rewrite a API. |
| Build específico | Nuevo `npm run build:hosting`: modo `hosting`, ignora archivos `.env`, exige base HTTPS remota con `/api`, sin credenciales/query/fragmento; rechaza mocks y bypass visual. La validación de formato no certifica aprobación ni existencia del servicio. |
| Router | Único BrowserRouter en `main.jsx`; `/login`, `/`, `/map`, `/prioridades`, `/inmobiliarias`, `/ventas`, `/ventas/:ventaId/pagos`, `/reservas`, `/personas`, `/reportes`, `/403` y catch-all a `/`. Se conserva el router. El fallback estático prepara las recargas profundas. |
| Sesión | JWT Bearer desde localStorage, clave por defecto `lf_token`; usuario persistido en `lf_user`. Sin refresh, `/auth/me` ni cookies. 401 del transporte limpia token y redirige a login; 403 no cierra sesión. Login conserva fetch propio para mostrar credenciales inválidas sin redirección. |
| Multipart | Altas y sustituciones de archivos pasan a `http` compartido, conservan FormData y Bearer, sin Content-Type manual para que el navegador agregue boundary. Ahora comparten manejo de 401 y base API. |
| URL firmada | La solicitud autenticada de URL también usa `http`; conserva retorno de URL/null. La descarga posterior de esa URL sigue siendo fetch sin Bearer, para no enviar el JWT de API al almacenamiento. |
| Errores | Se conserva `parseApiError` y el contrato de adaptadores. Persisten adaptadores que convierten fallos en listas vacías/null; no se reescriben todos los errores del producto en T2. |
| Reportes | `VITE_REPORTES_MOCK` solo activa datos simulados cuando vale `true`; no se activó. El modo Hosting rechaza ese valor. La exportación usa Response/Blob, valida status y MIME XLSX, lee Content-Disposition si está expuesto y admite nombre de respaldo. |
| Descarga binaria | `descargarBlob` crea URL temporal y la revoca después del click; no se convierte binario a JSON. Los tests usan bytes simulados, no certifican un XLSX real. |

`frontend/README.md` corrige las instrucciones de testing que anunciaban una suite general inexistente y documenta el flujo de build. `.env.example` documenta variables públicas, sin tocar `.env.development`, `.env.production` ni leer sus valores para inspección. El lockfile permanece sin cambios. El build comparativo se ejecutó en modo `g4-verification` para no cargar esos archivos por modo; no se afirma validación del contenido de los env reales.

## Valores y decisiones pendientes de C2

No hay URL de Cloud Run, sitio ni dominio confirmado por esta tarea. Los valores siguientes requieren evidencia y autorización antes de generar el artefacto destinado a Hosting:

| Valor / decisión | Requisito exacto |
| --- | --- |
| `VITE_API_BASE_URL` | URL REAL HTTPS aprobada del servicio Cloud Run que publica la API, terminada en `/api`. No usar base relativa ni dominio supuesto. Se pasa al proceso de build; queda incorporada en los assets. |
| Proyecto Firebase y sitio Hosting | Identificadores reales y asociación autorizada. No se creó `.firebaserc`; si se decide multisitio, el target también requiere inventario. |
| Origin público del frontend | Origin HTTPS exacto aprobado, con el cual el responsable backend deberá configurar `FRONTEND_URL`; sin path, wildcard ni lista inventada. Configuración backend fuera de T2. |
| Acceso público y seguridad | Confirmar autorización de la arquitectura recomendada Hosting → API Cloud Run HTTPS con JWT/RBAC → PostgreSQL privado. Revisión de seguridad y autorización pública pendientes; sin BFF. |
| CORS de API | Validar el origin anterior, preflight, Authorization, métodos JSON y multipart. Para usar el nombre enviado por exportación, confirmar exposición de `Content-Disposition`; de lo contrario existe nombre de respaldo. No se alteró CORS. |
| Archivos binarios | Confirmar servicio/origin real de URLs firmadas, CORS para fetch de documentos y permisos; ninguna URL firmada ni credencial se almacena en este informe. |
| Flags de desarrollo | Mantener `VITE_REPORTES_MOCK`, `VITE_AUTH_USE_MOCK` y `VITE_RBAC_DISABLE_UI` ausentes o `false` en el build Hosting. El último selector es legacy, no una implementación de login mock. |
| `VITE_AUTH_TOKEN_KEY` | Conservar `lf_token`, salvo decisión explícita de migración de sesiones. No es un secreto. |

`VITE_API_FORCE_ABSOLUTE` solo altera desarrollo; no se necesita para Hosting. `VITE_PROXI_TARGET` conserva la grafía legacy y se lee del proceso por el servidor local de Vite, con default `http://localhost:3000`; no crea proxy en Hosting. `VITE_API_BASE` no debe usarse en configuraciones nuevas. No se utilizan `VITE_API_URL`, `VITE_AUTH_REFRESH_*`, `VITE_AUTH_ME_PATH` ni `VITE_AUTH_LOGIN_PATH`.

Todos los valores `VITE_*` son públicos. No pasar secretos al build. Cambiar URL después de compilar requiere reconstruir; Hosting no sustituye variables de runtime en los assets. El build genérico conserva `/api` relativo como fallback local/legacy y no debe tomarse como artefacto aprobado para esta arquitectura.

## Validaciones ejecutadas

Entorno: Node 22.14.0, npm 10.9.2. Comandos desde `frontend/`, salvo Git y revisión de configuración desde raíz. En PowerShell se usó `npm.cmd`.

| Comando / comprobación | Baseline | Resultado final |
| --- | --- | --- |
| `npm ci` | Instalación de la base, exit 0, 199 paquetes | Lockfile sin cambios. npm informó 15 vulnerabilidades: 1 low, 3 moderate, 11 high; no se ejecutó audit fix ni se modificaron dependencias. |
| `npm run lint` | Exit 1: 114 errores, 50 warnings | Exit 1: 112 errores, 50 warnings. Comparación de mensajes JSON sin novedades; desaparecen el catch sin uso de archivos y el `process` sin importar de Vite. El lint global continúa fallando. |
| ESLint de archivos de código añadidos/modificados | No aplica | Exit 0: `src/lib/http/http.js`, `src/lib/api/archivos.js`, `config/hosting.js`, `vite.config.js`, `tests/preparation.test.mjs`. |
| `npm run build -- --mode g4-verification` | Exit 0, 2632 módulos | Exit 0, 2632 módulos; warnings preexistentes de anotaciones Zod y chunk mayor a 500 kB. El warning de import dinámico/estático de token desaparece al quitar imports dinámicos de archivos. |
| `npm run test:preparation` | Script nuevo | Exit 0, 8 tests PASS: formato/flags, config estática SPA, base/JSON/Bearer, multipart alta/sustitución, URL firmada, 401/403 y binario/error/MIME. Fetch simulado, sin solicitudes a servicios. |
| `npm run build:hosting` sin base canónica | No aplica | Exit 1 esperado, rechaza configuración incompleta antes de compilar; es evidencia del guard, no build deployable. |
| `npm run build:hosting -- --outDir <directorio temporal de fixture>` | No aplica | Exit 0 con `https://api.invalid/api` y los tres flags en `false`. Dominio sintético reservado exclusivamente para validar compilación, sin red; artefacto temporal fuera de `frontend/dist`, no publicable. |
| `git diff --check` | Limpio | Exit 0. |

Dos intentos de lint/build mientras `npm ci` aún estaba activo fallaron porque los binarios todavía no existían. Se repitieron tras finalizar instalación; los resultados válidos de baseline son los de la tabla. La primera ejecución de los tests pasó assertions pero imprimió un error de cierre del escáner de dependencias de Vite; se deshabilitó el descubrimiento de dependencias en el harness y se repitió con exit 0 sin ese error.

No se ejecutaron QA de navegador, emulador Firebase, recargas reales en Hosting, login, CORS, multipart real, descarga real XLSX ni consultas/escrituras a staging. El test de fallback comprueba el JSON; no sustituye una prueba de BrowserRouter en el servicio. No se ejecutaron backend, jobs, migraciones, seeds, despliegues, APIs, cambios IAM ni operaciones de GCP/Firebase.

## Riesgos y entrega

- Build y tests locales no aprueban publicación, seguridad, permisos o integración real. El lint global y las vulnerabilidades informadas por npm siguen pendientes de triage; este informe no detalla vulnerabilidades explotables.
- JWT en localStorage y autorización visual conservan sus límites existentes; la autorización efectiva corresponde al backend. El usuario persistido no sustituye validación de token por servidor.
- El bundle sigue siendo grande; no se amplió a optimización de carga.
- Se entrega diff sin commits ni cambios de refs ajenos. Archivos: `frontend/.env.example`, `frontend/README.md`, `frontend/package.json`, `frontend/vite.config.js`, `frontend/config/hosting.js`, `frontend/src/lib/http/http.js`, `frontend/src/lib/api/archivos.js`, `frontend/tests/preparation.test.mjs`, `firebase.json`, este informe y `ai/T2.md`.
- Pendiente: revisión humana del diff, definición C2 de valores reales, build con valores aprobados, QA autorizada de integración y eventual PR en el repositorio canónico. Ninguna acción de publicación está autorizada por este resultado.
