# G4 T2 — Frontend y sitio Hosting verificado, sin publicar

Actualizado: 2026-11-27. Refs #290. Estado: preparación para revisión humana; C2 aprobado para reutilizar el sitio existente, C1 bloqueado y C3 no aprobado. No iniciar T5.

## Base, preservación y alcance

- Task: `task_94827607d9d9`; dispatch: `ctx_e4fb465d3554`.
- Worktree propio: `g4-t2-frontend`; rama `chore/g4-frontend-preparation`, ejecución local.
- Base canónica actual: `7f5597bae624967554c0da1116817f7e41e87746`. El merge-base de la rama con ese SHA coincide exactamente.
- El diff anterior, sobre `84490e678b388fa6053fcfe262167412ea0f40e7`, se preservó mediante commit selectivo y referencia local de respaldo antes de rebasar únicamente el trabajo propio. No se rebasó sobre árbol sucio.
- Único conflicto: `.env.example`. Se compararon baseline anterior, main actual y trabajo propio; se conservó la eliminación upstream del mock de reportes y la preparación propia de configuración.
- Reportes, componentes asociados, eliminación de `reportes.mock.js`, lockfile y `AI-DECISIONS.md` quedan idénticos al main canónico actual.
- Se consultaron instrucciones aplicables, `CONTRIBUTING.md`, convenciones, PR template y registro AI vigente. No se encontraron `AGENTS.md` aplicables en el checkout ni ascendentes inspeccionados.
- Repositorio canónico para eventual PR: `La-Federala-UTN-FRLP/Club-La-Federala`; `origin` conserva el fork `justinasmith1/Club-La-Federala`. Sin push, PR ni cambios de ramas ajenas.

Revisor propuesto: Nicolas; coordinación: Santiago. Se preparan commits selectivos y borrador privado de PR, sin aprobación propia. El coordinador consolidará el registro AI central; [ai/T2.md](ai/T2.md) conserva el borrador de este frente, sin reservar ID.

## C2 confirmado y configuración estática

La evidencia de asociación e inventario entregada por coordinación, capturada el 27/11/2026 a las 18:26–18:27 UTC, confirma proyecto Firebase `la-federala-staging-utn` ACTIVE y sitio homónimo `DEFAULT_SITE`. C2 autoriza reutilizar ese sitio y proyecto con billing Blaze existente, sin Analytics ni aplicaciones Firebase innecesarias. Esta tarea reutiliza esa evidencia; no repite consultas Cloud ni modifica recursos.

`firebase.json` en raíz selecciona únicamente `site: la-federala-staging-utn`, sirve `frontend/dist` y configura fallback `**` a `/index.html`. No incluye target, rewrite de API ni configuración backend; no se crea `.firebaserc`, SDK, aplicación Firebase o script de despliegue.

El origen `https://la-federala-staging-utn.web.app` está comprobado por la API de Hosting. `la-federala-staging-utn.firebaseapp.com` es el dominio estándar documentado; su contenido HTTP/DNS no se probó aquí. El inventario entregado registró cero versiones y releases; existencia de sitio/canal live no significa frontend desplegado. Esta captura no completa login, navegación ni recarga SPA de #290.

El test estático se denomina «Configura sitio verificado, dist y fallback SPA sin rewrite de API»: comprueba el JSON, no ejecuta BrowserRouter ni demuestra rutas profundas funcionando en Hosting.

## Transporte y compatibilidad con main

| Área | Resultado e inspección |
| --- | --- |
| React/Vite | Se conservan JSX, React 19, React Router 7 y Vite del lockfile actual. No se actualizan dependencias. |
| API | `VITE_API_BASE_URL` canónica con `/api`, normalizada sin espacios externos/barras finales; `VITE_API_BASE` queda como fallback legacy. Matching de hostname local preciso y proxy de desarrollo conservados. |
| Build Hosting | Modo `hosting`, `envDir: false`: solo entorno del proceso, sin cargar archivos `.env`. Exige base HTTPS remota con `/api`, sin credenciales/query/fragmento. Valida formato, no aprobación ni existencia de API. |
| Flags legacy | Rechaza `VITE_REPORTES_MOCK`, `VITE_AUTH_USE_MOCK` y `VITE_RBAC_DISABLE_UI` si no están ausentes o en `false`. El guard contra un flag obsoleto no restaura el mock de reportes. |
| Router | Se conserva un BrowserRouter en `main.jsx`, con `/login`, `/`, `/map`, `/prioridades`, `/inmobiliarias`, `/ventas`, `/ventas/:ventaId/pagos`, `/reservas`, `/personas`, `/reportes`, `/403` y catch-all a `/`. |
| Sesión/errores | Bearer JWT de localStorage, clave default `lf_token`; usuario en `lf_user`. Sin refresh ni `/auth/me`. 401 del transporte limpia token y redirige a login; 403 preserva sesión. Fetch de login separado para informar credenciales inválidas. Se conserva `parseApiError`; adaptadores que devuelven listas vacías/null ante fallos mantienen su deuda existente. |
| Multipart | Alta y sustitución usan `http` compartido; conservan FormData, campos y Authorization. No se impone Content-Type: el navegador agrega boundary. Comparten base y manejo 401. |
| Firma y descarga | Solicitar la URL firmada usa Bearer en la API. Inspección del componente actual: preview usa `fetch(signedUrl)` sin opciones/Bearer; descarga navega con un enlace a la URL firmada, sin agregar JWT. No se ejecutó descarga real del almacenamiento. |
| Reportes reales | Main se preserva íntegro: sin mock, plazos de 30 s para consultas/catálogo y 60 s para exportar, AbortSignal a través de `http`, catálogo `{ fracciones, total }` y aviso de truncado. Tests con fetch simulado comprueban compatibilidad; no son nuevas consultas reales. |
| Binarios | Exportar conserva Response/Blob, status y MIME XLSX, Content-Disposition y nombre de respaldo; se comprueba propagación de timeout durante lectura de blob. `descargarBlob` conserva enlace temporal y revocación diferida. No se certifica XLSX real ni comportamiento del navegador. |

## Valores pendientes y gates

| Valor / decisión | Estado y requisito |
| --- | --- |
| Proyecto/sitio/origen Hosting | Confirmados arriba por C2; no pendientes de inventar ni crear. No se modifica billing ni Analytics. |
| `VITE_API_BASE_URL` | Pendiente: URL REAL HTTPS aprobada de Cloud Run, terminada en `/api`, vinculada al contrato de acceso C1/C3. No se fija endpoint supuesto. |
| Acceso API y seguridad | C1 bloqueado, C3 no aprobado. Arquitectura recomendada Hosting → API Cloud Run HTTPS con JWT/RBAC → PostgreSQL privado; sin BFF. No se expone Cloud Run ni se realizan cambios IAM. |
| `FRONTEND_URL` backend | El origen Hosting comprobado es candidato para la configuración exacta; su aplicación y validación CORS requieren alcance y autorización posteriores. No se cambia backend. El dominio estándar alternativo no implica allowlist múltiple aprobada. |
| CORS API | Pendientes preflight, Authorization, métodos JSON/multipart y exposición de `Content-Disposition`; sin esta última existe nombre de respaldo. Sin validación de integración real aquí. |
| Archivos | Pendientes permisos, URLs firmadas reales y CORS de almacenamiento para preview/fetch. Sin URLs firmadas o credenciales en este informe. |
| Sesión/flags | Conservar `VITE_AUTH_TOKEN_KEY=lf_token` salvo migración explícita; flags legacy ausentes/false. No se activa autenticación mock ni bypass visual. |

Vite incorpora los valores públicos `VITE_*` al compilar; cambiarlos requiere otro build. No incluir secretos. `VITE_API_FORCE_ABSOLUTE` solo altera desarrollo; `VITE_PROXI_TARGET` conserva grafía legacy y default `http://localhost:3000` para el proxy local del proceso Vite. Hosting no ejecuta ese proxy. `VITE_API_BASE` no se recomienda para configuraciones nuevas; `VITE_API_URL`, `VITE_AUTH_REFRESH_*`, `VITE_AUTH_ME_PATH` y `VITE_AUTH_LOGIN_PATH` no se usan.

## Validación actual, contra 7f5597b

Entorno: Node 22.14.0, npm 10.9.2. En PowerShell se utilizó `npm.cmd`. Dependencias instaladas y lockfile no cambiaron respecto del canónico. El `npm ci` previo pasó sobre el mismo lockfile; no se presenta como reinstalación ejecutada en esta revisión.

| Comando / comprobación actual | Resultado |
| --- | --- |
| `npm run test:preparation` | Exit 0, 9 PASS, fetch simulado sin red. Guardas; JSON estático; base/JSON/Bearer; alta/sustitución FormData; solicitud de firma; reportes reales/catálogo/señal; 401/403; binario/MIME/status y abort durante lectura. |
| `npm run lint -- --format json --output-file <evidencia privada>` sobre canónico y rama | Ambos exit 1. Copia privada de 221 archivos de código/config de `7f5597b`, sin checkout Git ni env reales: 114 errores y 50 warnings. Rama: 112 errores y 50 warnings. Comparación multiconjunto por archivo relativo/regla/severidad/mensaje: cero añadidos. Se eliminan `no-unused-vars` del catch en archivos y `no-undef` de process en Vite. |
| ESLint dirigido a los cinco archivos de código nuevos/modificados | Exit 0: http, archivos, config Hosting, config Vite y tests. |
| `npm run build` ordinario local | Exit 0, production, 2631 módulos; avisos de anotaciones Zod y chunk superior a 500 kB. Artefacto local genérico; no es build Hosting con API aprobada ni validación de integración. Sin inspección de valores de env reales. |
| `npm run build:hosting`, sin `VITE_API_BASE_URL` en el proceso | Exit 1 esperado: configuración rechazada antes de compilar. En esta revisión no se genera build Hosting con URL sintética o no aprobada. |
| `npm audit --include=dev --json` | Exit 1: 15 paquetes afectados, 11 high, 3 moderate, 1 low. Todos los nodos afectados del lockfile tienen `dev: true`. |
| `npm audit --omit=dev --json` | Exit 0: cero vulnerabilidades reportadas. Lockfile idéntico a `7f5597b`: hallazgos preexistentes de tooling, no nuevas dependencias de T2. |
| `git diff --check` y comparación de archivos upstream preservados | Exit 0. Reportes/componentes, mock eliminado, lockfile y registro AI central sin diferencias frente al canónico. |

Lint remanente: 98 `no-unused-vars`, 8 `rules-of-hooks`, 5 `no-empty`, 1 `no-irregular-whitespace`; warnings: 44 `exhaustive-deps` y 6 `only-export-components`. Preexistencia no equivale a aceptación: el lint global sigue rojo. Comparación detallada y auditorías en evidencia privada, sin detalles explotables en documentos versionados. Un paquete dev puede influir en el bundle o cadena de build; actualización controlada y regresiones corresponden a otro alcance. Sin `npm audit fix`, upgrades o cambios de lockfile.

Los resultados antiguos sobre `84490e6` no acreditan el main nuevo. La compilación sintética de Hosting de la etapa inicial se conserva solo como antecedente privado, no como artefacto actual aprobado ni validación de C1/C3.

No se ejecutaron navegador, emulador Firebase, recargas reales de Hosting, login real, CORS, multipart real, descarga XLSX/GCS real, consultas/escrituras de staging, backend, jobs, migraciones, seeds, operaciones Cloud, deploy ni habilitación de APIs. Tampoco push, creación de PR, merge, cierre de issues o cambios de Projects.

## Entrega y revisión pendiente

Se entregan commits locales selectivos sobre la base canónica y borrador de PR privado con Refs #290, revisor Nicolas y coordinación Santiago. Falta revisión humana del código y consolidación AI central por el coordinador. C1/C3, API aprobada, configuración backend autorizada y QA real mantienen sus gates; C2 no autoriza publicación por sí mismo. Build y tests locales no aprueban despliegue ni completan #290.
