# Escenarios G4 — ejecución futura condicionada

Consolidación local: 28/11/2026 (UTC−03:00). Base canónica verificada por GitHub: `f6fea9415c6cb100b4e9abe1f0cb8bb80b097c1c`; rama `test/g4-qa-preparation`. Recuperación selectiva de `4f274f083099e86186bcd653a4d70182880259a4`, base anterior `52a1d346aee960114647f9d885ce398bdcb275e3`; no se actualizó el worktree anterior. [Auditoría de los 52 IDs y estados separados](auditoria-preparacion.md).

**Estado: 52 casos preparados; 0 ejecutados; 0 PASS funcionales.** Este documento no autoriza QA contra staging. T4 solo hizo consultas GitHub READ-ONLY e inspección/validación documental local; no inició sesión ni ejecutó app, seeds, migraciones, jobs, scripts QA, escrituras de datos o cambios de Cloud. Se prepararon commits documentales locales y borrador privado de PR; no se hicieron push, PR, comentarios ni cambios de issues/Projects.

## Preparar una ejecución sin efectos no autorizados

1. El responsable confirma versión objetivo (SHA frontend/backend), entorno y ventana, propietario de datos, mecanismo de recuperación y alcance exacto de permisos A1–A6. No inferir autorización de que una issue esté cerrada, que la API sea accesible o que una credencial existente funcione.
2. Reconsultar GitHub canónico #290/#302 y bloqueadores; registrar fecha. Hoy #302 sigue bloqueada por #290/#294/#299/#300/#301 abiertos. Revisar los criterios de cada dependencia y la seguridad/autorización pública; la recomendación Hosting → API HTTPS Cloud Run JWT/RBAC → PostgreSQL privado sigue condicionada por C1 bloqueado y C3 despliegue pendiente; T5 prohibido. C2 aprobado: reutilizar proyecto/DEFAULT_SITE `la-federala-staging-utn`, Blaze existente, sin Analytics ni apps innecesarias. La evidencia recibida acredita asociación y sitio sin versiones/releases, no aplicación publicada; sin nuevas operaciones Cloud de T4.
3. Confirmar con el operador los orígenes y endpoints aprobados, sin inventar dominios, abrir APIs ni cambiar IAM/servicios. Verificar que el frontend usa la API objetivo y no una base compartida distinta. No leer ni copiar secretos, credenciales o archivos .env para completar la ficha.
4. El operador autorizado entrega cuentas y fixtures sintéticos por canal privado. U-ADM, U-GES, U-TEC, U-A/U-B corresponden a cinco identidades distintas; A/B tienen datos comerciales separados. No reutilizar IDs de la guía local como IDs de staging. No crear fixtures, seeds o migraciones dentro de esta preparación.
5. Revisar con una persona el contrato de cada operación, los fixtures y las reglas financieras. Los casos negativos mutantes requieren A2 aunque se espere rechazo. Si faltan datos, permisos, una decisión contractual o recuperación, dejar la variante BLOQUEADA, con motivo.
6. Ejecutar primero la sesión/lecturas autorizadas y validar identidad/entorno. Hacer después mutaciones únicamente dentro de la ventana y sobre fixtures autorizados. Purgas requieren A5 específico; no ejecutar jobs, alterar reloj, habilitar infraestructura ni usar scripts QA existentes sin revisión y autorización independientes.
7. Capturar evidencia mínima sanitizada por variante. Detener la ejecución ante acceso inesperado, datos reales, efecto fuera del fixture o fallo de recuperación; informar al responsable por canal aprobado. No publicar ejemplos explotables ni continuar para completar una tasa de PASS.
8. Al terminar, el operador revisa los estados y realiza solo la recuperación aprobada; no borrar masivamente ni resembrar. Registrar cualquier residuo/bloqueo, sin afirmar restauración si no fue comprobada.

No se incluyen comandos ejecutables de login/escritura ni llamadas para activar jobs. Para completar en el futuro una variante bloqueada hace falta una autorización nueva y concreta de su responsable.

## Catálogo ficticio por preparar

Estos datos no existen por efecto de T4. Son especificaciones para el operador; cualquier creación queda fuera de esta tarea.

| Grupo | Alias y condición deseada |
|---|---|
| Identidades | U-ADM, U-GES, U-TEC, U-A, U-B activas; auxiliares inhabilitadas para negativos, sin cambiar cuentas principales |
| Agencias | A y B operativas; AG-AUX descartable para ABM/baja y usuario auxiliar asociado |
| Personas | P-A/P-B clientes separados; P-TITULAR/P-MIEMBRO para familia plana; P-ASOCIADA para restricciones; identificadores sintéticos válidos revisados, nunca personas reales |
| Lotes | L-D disponible; L-N no disponible; L-V vendido; L-DEUDA; L-MAP con mapId; L-SIN-MAP; lotes separados para escritura por caso |
| Comercial | R-A/R-B reservas propias; Q-A/Q-B y prioridad del Club; V-A/V-B; casos vigentes, cancelados, consumidos y vencidos separados |
| Financiero | Plan 1000 en dos cuotas de 500; 300 + 200 secuencial; cuotas separadas para 200 + 200 concurrentes (saldo 100), 300 + 300 concurrentes (un rechazo, saldo 200), pago 200 + recargo 50 (saldo 350); moneda/redondeo/fechas revisadas |
| Archivos | PDF/PNG inocuos pequeños creados por operador; PLANO/IMAGEN y documentos de venta A/B; archivos separados para sustitución, baja/restauración y purga |
| Vencimientos | R-VENC, Q-VENC y PROMO-VENC con fechas y estados aprobados para observación de mecanismo existente, sin trigger manual |
| Vacíos y errores | Filtros sin coincidencias, ausencia de mapId y simulaciones locales revisadas; nunca borrar datos para generar vacío ni provocar caída real |

## Recorridos

Cada recorrido usa los pasos, expected, datos, dependencia, evidencia y autorización de **cada ID** en la matriz. Ejecutar cada combinación de rol/tenant por separado; no acreditar INMO-B con evidencia de INMO-A ni transferir evidencia local a staging.

| Recorrido | Orden de casos | Preparación y punto de control |
|---|---|---|
| Sesión por cinco identidades | AUTH-01 → AUTH-05/06 → AUTH-03 → AUTH-04; AUTH-02/07 con auxiliares | Cada perfil tiene almacenamiento separado; sin JWT en capturas. Logout se valida en cliente; no equivale a revocación en servidor. Volver atrás se documenta por separado si muestra vista cacheada; no debe obtener datos nuevos sin sesión |
| Agencia A y espejo B | TEN-01/02 → LOT-01 → RES-02/04 → PRI-02/03 → DOC-05; TEN-03 para staff | Usar solo referencias ajenas previamente preparadas y conocidas; sin enumeración ni exploración de recursos. Mantener 403 comercial frente a 404 de archivos no visibles, según contrato |
| Inventario y mapa | LOT-01/02/03 → SPA-02 → LOT-04/05 | Primero observación; edición de TECNICO solo subestado/superficie. Validar selección después de filtros, recarga y regreso. No incorporar ABM de ubicaciones |
| Reserva y prioridad | RES-01/03 → PRI-01/03 → PRO-01; RES-04/PRI-02 separados | Un fixture por transición; no intentar varias transiciones incompatibles sobre el mismo estado. Reservas concurrentes: una 201 y otra 409; prioridad del Club consumida atómicamente. Precio promocional igual/mayor o más de 2 decimales: 400; concurrencia de promociones o precio editado entre validación/update: 409. Solo ventana/actores aprobados, sin carga |
| Vencimientos | EXP-01 | Solo observar ejecución existente coordinada por operador; conservar horas/estados antes y después. Sin evidencia de ejecución no atribuir un cambio ausente a bug ni dar PASS por esperar |
| Personas y agencias | PER-01/02 → INM-01/02 | Separar clientes A/B, familia y agencia auxiliar. ABM de usuario no tiene pantalla propia en la base; no simularla ni aprobarla como probada |
| Cadena comercial | VEN-01 → PAG-01/02 → DOC-02/04 → E2E-01; VEN-03/PAG-03 en fixtures separados | Cliente de reserva vigente entre compradores (también co-comprador); omisión 400. Ventas concurrentes: una alta y resto 409; No Disponible con venta en curso 409. Cancelación con fecha/motivo e historial; pagos/recargos serializados y exceso o venta cancelada 409. No presumir serialización reemplazo-plan/pago. Vencimientos financieros con fecha y zona explícitas. VEN-02 comprueba denegaciones |
| Documentos | DOC-01/02/03 → DOC-04/05 → DOC-06/08 → DOC-07 | Acceso a binario requiere storage aprobado. No considerar PASS desde metadata local. URL firmada es temporal; no guardarla completa. Sustituir IMAGEN está excluido por OpenAPI/servicio; fila RBAC corregida sin cambio de runtime |
| Reportes y exportaciones | REP-01/02/03 | Mismos filtros para tabla y XLSX; contar filas y comparar totales. Vacío cargado permite exportar: 200 XLSX con encabezados/parámetros y totales/tramos en cero según reporte; sin consulta/en carga no permite. API real, filtros aplicados y monedas separadas; catálogo truncado avisa |
| Hosting y transporte | SPA-01/02 → NET-01/02/03 → EMPTY-01 | Confirmar HTTPS, base /api, respuestas JSON y rewrites solo SPA; separar CORS, 401, 403, 5xx y offline. Simular fallo localmente, sin cambios de infraestructura |

## Ficha de resultado futura

Copiar una ficha por ID + rol + tenant + variante. **Todavía no hay fichas de ejecución en T4.**

| Campo | Valor a completar por el ejecutor autorizado |
|---|---|
| ID completo | Ej.: G4-AUTH-01-INMO-A-variante-1, vinculado a AUTH-01 |
| Estado | PREPARADO/NO EJECUTADO inicialmente; BLOQUEADO si falta requisito; EJECUTADO/PASS solo si todo el expected se verificó; EJECUTADO/FAIL si difiere; interrumpido no es PASS |
| Fecha y entorno | Hora con zona; entorno confirmado por responsable; SHA frontend/backend |
| Autorización | Responsable, alcance, ventana y referencia privada sin secretos |
| Rol y fixture | Alias de identidad, agencia, recursos y estado inicial |
| Pasos reales | Lo realizado y diferencias respecto de la matriz, sin solicitudes sensibles completas |
| Resultado | Separar UI (control/mensaje), API (status/body), transporte (CORS/MIME/boundary/plazos) y persistencia (relectura autorizada de estado/saldo/relaciones); mocks y toast no acreditan staging |
| Evidencia | Referencia sanitizada EV-ID-rol-tenant-variante; sin JWT, credenciales, PII ni URL firmada completa |
| Hallazgo | Severidad propuesta P0/P1/P2, impacto sanitizado, referencia; detalles sensibles solo en evidencia privada temporal comunicada al coordinador |
| Recuperación | Acción aprobada, verificación del operador y residuos; si no se hizo, indicarlo |
| Revisión | Persona revisora, decisión y fecha; no autovalidación |

Una ejecución con evidencia incompleta o parcial no satisface el caso. Los P2 diferidos requieren aceptación humana explícita; esta preparación no acepta ninguno. #302 exige E2E críticos en staging, sin P0/P1 abiertos del alcance y matriz/hallazgos vinculados: nada de eso se acredita por tener estos documentos.

## Verificación documental de T4

Los resultados del worktree anterior son antecedentes históricos, conservados allí. Esta consolidación sobre f6fea94 compara las cuatro rutas del diff anterior con main y porta únicamente matriz, escenarios y la corrección RBAC aún aplicable. No copia la referencia cloud/ai/T4 obsoleta: utiliza AI-045 central, conservando su historia y añadiendo seguimiento. Las validaciones actuales y la clasificación de los 52 casos están en [auditoría](auditoria-preparacion.md); ningún resultado anterior se convierte en ejecución nueva.

GitHub READ-ONLY del 28/11: #302 y #290 OPEN; #302 tiene cinco dependencias abiertas (#290, #294, #299, #300, #301); #288, #289 y #296–#298 cerradas. #290 depende de #280 y #286 cerradas. #302 sin comentarios; #290 conserva comentario histórico importado que permite preparación en paralelo, sin aprobar despliegue. #373 y #378 OPEN. No se consultó Jira ni se alteró seguimiento.

## Restauración por recorrido y evidencia

Antes de toda mutación futura, el operador debe aprobar una ficha por ID/rol/tenant/variante con estado inicial, relaciones y saldo, fixture exclusivo, acción inversa admitida y responsable. Registrar clave natural QA y correspondencia privada; nunca resolver IDs por exploración. Si no existe inversa segura, usar fixture descartable con retención aprobada o bloquear el subcaso. No usar rollback SQL, seeds ni limpieza masiva.

| Recorrido | Restauración futura a acordar antes de ejecutar |
|---|---|
| Sesión/roles/agencias | Cerrar perfiles, dejar expirar sesión; cambios de rol/baja solo en auxiliares; operador restaura rol/agencia y verifica acceso. No prometer revocación server-side del JWT ni eliminar usuarios reales |
| Lotes/personas/familias | Registrar valores y vínculos anteriores; restaurar campos técnicos y quitar únicamente vínculo QA creado; bajas/reactivaciones solo si estado/relaciones lo permiten; no eliminar personas con asociaciones |
| Reservas/prioridades/promociones | Fixture distinto por transición/concurrencia; conservar contexto de lote/precio; operador cancela/quita mediante operación contractual y relee lote, oferta y prioridad. Estados terminales sin reversa quedan como residuo QA aprobado |
| Venta/plan/pago | No borrar historial ni inventar reversa de cobros; fixture descartable por variante, cancelación solo contractual y aprobada, conservar importes/relaciones y evidencia. Reemplazar plan no equivale a restaurar un historial; residuo financiero debe quedar aceptado o variante bloqueada |
| Archivos | Original inocuo y metadata antes de sustituir; volver a subir solo si la operación lo permite; baja/restauración verificadas por separado. Purga irreversible requiere A5, objeto auxiliar único y aceptación de no recuperación; sin A5 queda bloqueada |
| Expiraciones | Observación de mecanismo existente; no revertir reloj ni disparar jobs. Guardar estado final como residuo QA y usar nuevos fixtures para repetir |
| Lecturas/exportaciones/SPA/red | No borrar para vaciar; filtros sin coincidencia. Restablecer simulación DevTools local, cerrar perfiles y eliminar descargas locales conforme a retención acordada; sin alterar infraestructura |

Cerrar cada ficha con relectura de persistencia autorizada, comparación contra estado inicial y lista de residuos aceptada por el propietario. Si recuperación falla, detener variantes dependientes y registrar BLOQUEADO; no afirmar entorno restaurado. Evidencia privada con acceso limitado al equipo autorizado, retención y fecha de eliminación acordadas antes de ejecutar; revisor verifica sanitización antes de versionar solo resúmenes. Tokens, formularios de login, cookies, localStorage, HAR crudo, IPs, IDs operativos, URLs firmadas y documentos reales quedan excluidos. Cualquier captura accidental se retira del circuito de publicación y se trata por canal privado del responsable.

## Condiciones exactas para C4

1. C1 resuelto y aprobado con evidencia runtime de identidad/topología, cuota y almacenamiento, privacidad y acceso API; T4 no acredita H1 ni campaña O.
2. C3 desplegado con aprobación separada, SHAs frontend/backend y artefacto exacto, URL API HTTPS con /api aprobada, origen/CORS y storage comprobados por operador. C2 completo no prueba publicación.
3. Dependencias #290/#294/#299/#300/#301 revisadas por responsables; contratos y diferencias documentados. Reconsultar main y estado de #373/#378 inmediatamente antes de ejecutar; un cambio incompatible obliga a revisar expected, no a sobrescribirlo.
4. A1–A6 pertinentes aprobadas por variante, cinco identidades sintéticas distintas disponibles, fixtures aislados y recuperación/retención ensayables revisadas; negar variante con precondición ausente.
5. Revisión humana de esta matriz y reglas financieras; ejecutor y revisor identificados, ventana y stop conditions acordados. Ejecutar lecturas primero, luego mutaciones aprobadas y relecturas, luego restauración específica.
6. Registrar evidencia propia por variante y resultado real; #302 solo puede evaluarse tras E2E críticos PASS en staging, cero P0/P1 abiertos del alcance y aceptación humana explícita de P2 diferidos. Esta preparación no cierra C1/C3/C4, #302 ni #290; T5 sigue fuera del alcance.

Revisora propuesta: Justina, distinta de Santiago (autor local); sin asignación ni solicitud de review. Se entregan commits y borrador privado de PR; sin push, creación de PR, merge ni cambios Projects.
