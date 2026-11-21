# Resultados QA · Permisos, aislamiento y sesión (API)

- **Fecha:** 2026-11-21 · **Ambiente:** Local (PostgreSQL 16 en Docker `federala-qa-db` + backend en http://localhost:3001)
- **Generado por:** `npm run qa:api` (`Backend/scripts/qa/api-permisos.qa.ts`); datos de `npm run seed:qa`.
- **Casos:** 38 IDs de la guía, 106 subcasos ejecutados por HTTP.

## Totales por estado

| Estado | Casos (ID) |
|---|---|
| PASS | 37 |
| FAIL | 1 |
| BLOCKED | 0 |
| PENDIENTE DE DECISIÓN | 0 |

Subcasos: PASS 104 · FAIL 2.

## Resultado por caso

| ID | Estado | Prioridad sugerida | Hallazgo |
|---|---|---|---|
| ACC-01 | PASS | — | — |
| ACC-02 | PASS | — | — |
| ACC-03 | PASS | — | — |
| ACC-09 | PASS | — | — |
| ACC-12 | PASS | — | — |
| GEN-10 | PASS | — | — |
| GEN-11 | PASS | — | — |
| GEN-14 | PASS | — | — |
| GEN-15 | PASS | — | — |
| LOT-41 | PASS | — | — |
| PER-12 | PASS | — | — |
| RES-14 | PASS | — | — |
| VEN-17 | PASS | — | — |
| INM-14 | PASS | — | — |
| ADM-04 | PASS | — | — |
| ADM-05 | PASS | — | — |
| ADM-07 | PASS | — | — |
| ADM-16 | PASS | — | — |
| DOC-18 | PASS | — | — |
| DOC-24 | PASS | — | — |
| LOT-04 | PASS | — | — |
| LOT-03 | FAIL | P0 | [INMO_A] incluye 2 lotes NO_DISPONIBLE, 47 lotes exponen deuda, 47 lotes exponen documento del propietario, 1 lotes exponen documento del inquilino, 2 lotes exponen la prioridad (y el nombre) de otra inmobiliaria \| [INMO_A] status 200 (esperado 403/404) |
| PER-02 | PASS | — | — |
| PER-10 | PASS | — | — |
| RES-01 | PASS | — | — |
| RES-11 | PASS | — | — |
| RES-27 | PASS | — | — |
| PRI-07 | PASS | — | — |
| PRI-11 | PASS | — | — |
| DOC-11 | PASS | — | — |
| GEN-12 | PASS | — | — |
| ACC-15 | PASS | — | — |
| ACC-14 | PASS | — | — |
| ADM-08 | PASS | — | — |
| ACC-13 | PASS | — | — |
| INM-09 | PASS | — | — |
| ACC-05 | PASS | — | — |
| ACC-06 | PASS | — | — |

## Fallas (FAIL)

### LOT-03 · P0 · INMO_A

- **Request:** `GET /api/lotes`
- **Esperado:** 200 sin lotes NO_DISPONIBLE ni campos sensibles (deuda, documento de propietario/inquilino)
- **Obtenido:** incluye 2 lotes NO_DISPONIBLE, 47 lotes exponen deuda, 47 lotes exponen documento del propietario, 1 lotes exponen documento del inquilino, 2 lotes exponen la prioridad (y el nombre) de otra inmobiliaria
- **Pasos para reproducir:** Como INMO_A: GET /api/lotes
- **Archivo/función sospechada (sin corregir):** Backend/src/services/lote.service.ts → getAllLotes (no filtra por rol INMOBILIARIA)

### LOT-03 · P0 · INMO_A

- **Request:** `GET /api/lotes/21`
- **Esperado:** 403/404 para el detalle de un lote NO_DISPONIBLE
- **Obtenido:** status 200 (esperado 403/404)
- **Pasos para reproducir:** Como INMO_A: GET /api/lotes/21
- **Archivo/función sospechada (sin corregir):** Backend/src/services/lote.service.ts → getLoteById

## Detalle de subcasos

| ID | Rol | Request | Esperado | Obtenido | Estado |
|---|---|---|---|---|---|
| ACC-01 | ADMINISTRADOR | `POST /api/auth/login (credenciales válidas)` | 200 con token y usuario, sin password | 200 con token y rol ADMINISTRADOR, sin password | PASS |
| ACC-02 | anónimo | `POST /api/auth/login (password incorrecta y email inexistente)` | 401 en ambos, mismo mensaje genérico, sin token | 401/401, mensaje "Credenciales inválidas" | PASS |
| ACC-03 | anónimo | `POST /api/auth/login con email y password vacíos` | 400 VALIDATION_ERROR, sin token | 400 VALIDATION_ERROR | PASS |
| ACC-09 | token inválido (firma alterada) | `GET /api/lotes` | 401 Token inválido, sin datos | 401 (según lo esperado) | PASS |
| ACC-09 | token inválido (token basura) | `GET /api/lotes` | 401 Token inválido, sin datos | 401 (según lo esperado) | PASS |
| ACC-12 | anónimo | `GET /api/lotes` | 401 Token no proporcionado | 401 (según lo esperado) | PASS |
| GEN-10 | token inválido | `GET /api/reservas` | 401 UNAUTHORIZED con token inválido | 401 (según lo esperado) | PASS |
| GEN-10 | INMO_A | `GET /api/usuarios (sin rol) y luego GET /api/reservas con el mismo token` | 403 FORBIDDEN (no 401) y el token sigue válido: 200 en la ruta permitida | 403 FORBIDDEN → 200 | PASS |
| GEN-10 | TECNICO | `GET /api/ventas (sin rol) y luego GET /api/lotes con el mismo token` | 403 FORBIDDEN (no 401) y el token sigue válido: 200 en la ruta permitida | 403 FORBIDDEN → 200 | PASS |
| GEN-11 | ADMINISTRADOR | `GET /api/lotes/2147480000` | 404 con contrato de error, sin stack ni SQL | 404 (según lo esperado) | PASS |
| GEN-11 | ADMINISTRADOR | `GET /api/ruta-inexistente-qa` | 404 JSON 'Ruta no encontrada' | 404 (según lo esperado) | PASS |
| GEN-11 | ADMINISTRADOR | `GET /api/reservas/2147480000` | 404 sin stack ni SQL | 404 (según lo esperado) | PASS |
| GEN-11 | ADMINISTRADOR | `POST /api/fracciones` | 409 (fracción duplicada) sin nombres internos | 409 (según lo esperado) | PASS |
| GEN-11 | ADMINISTRADOR | `DELETE /api/lotes/43` | 409 (lote con historia) sin borrar ni exponer constraints | 409 (según lo esperado) | PASS |
| GEN-11 | ADMINISTRADOR | `POST /api/personas` | 400 VALIDATION_ERROR con errors[], sin detalle interno (la API no usa 422) | 400 (según lo esperado) | PASS |
| GEN-11 | ADMINISTRADOR | `PUT /api/lotes/19` | 400 por JSON mal formado, sin detalle del parser | 400 (según lo esperado) | PASS |
| GEN-14 | navegador (Origin) | `OPTIONS /api/lotes y GET /health con Origin http://evil.qa.example; control con http://localhost:5173` | Origen no permitido sin Access-Control-Allow-Origin; ninguna respuesta con Allow-Credentials | sin ACAO para el origen ajeno, ACAO solo para localhost:5173, sin Allow-Credentials | PASS |
| GEN-15 | ADMINISTRADOR | `PUT /api/lotes/19` | 413 PAYLOAD_TOO_LARGE (JSON de ~1,1 MB) | 413 (según lo esperado) | PASS |
| LOT-41 | GESTOR | `DELETE /api/lotes/47` | 403, el lote no se borra | 403 (según lo esperado) | PASS |
| LOT-41 | INMO_A | `DELETE /api/lotes/47` | 403, el lote no se borra | 403 (según lo esperado) | PASS |
| LOT-41 | TECNICO | `DELETE /api/lotes/47` | 403, el lote no se borra | 403 (según lo esperado) | PASS |
| PER-12 | INMO_A | `PUT /api/personas/23` | 403, sin cambios | 403 (según lo esperado) | PASS |
| PER-12 | TECNICO | `PUT /api/personas/23` | 403, sin cambios | 403 (según lo esperado) | PASS |
| RES-14 | INMO_A | `PUT /api/reservas/10` | 403 (INMOBILIARIA no edita reservas por PUT), sin cambios | 403 (según lo esperado) | PASS |
| VEN-17 | INMO_A | `PATCH /api/ventas/7/eliminar` | 403, sin cambios | 403 (según lo esperado) | PASS |
| VEN-17 | INMO_A | `PATCH /api/ventas/7/reactivar` | 403, sin cambios | 403 (según lo esperado) | PASS |
| VEN-17 | TECNICO | `PATCH /api/ventas/7/eliminar` | 403, sin cambios | 403 (según lo esperado) | PASS |
| VEN-17 | TECNICO | `PATCH /api/ventas/7/reactivar` | 403, sin cambios | 403 (según lo esperado) | PASS |
| INM-14 | INMO_A | `GET /api/inmobiliarias` | 403 | 403 (según lo esperado) | PASS |
| INM-14 | INMO_A | `GET /api/inmobiliarias/5` | 403 | 403 (según lo esperado) | PASS |
| INM-14 | INMO_A | `POST /api/inmobiliarias` | 403 | 403 (según lo esperado) | PASS |
| INM-14 | INMO_A | `PUT /api/inmobiliarias/5` | 403 | 403 (según lo esperado) | PASS |
| INM-14 | INMO_A | `PATCH /api/inmobiliarias/6/eliminar` | 403 | 403 (según lo esperado) | PASS |
| INM-14 | INMO_A | `PATCH /api/inmobiliarias/6/reactivar` | 403 | 403 (según lo esperado) | PASS |
| INM-14 | TECNICO | `GET /api/inmobiliarias` | 403 | 403 (según lo esperado) | PASS |
| INM-14 | TECNICO | `GET /api/inmobiliarias/5` | 403 | 403 (según lo esperado) | PASS |
| INM-14 | TECNICO | `POST /api/inmobiliarias` | 403 | 403 (según lo esperado) | PASS |
| INM-14 | TECNICO | `PUT /api/inmobiliarias/5` | 403 | 403 (según lo esperado) | PASS |
| INM-14 | TECNICO | `PATCH /api/inmobiliarias/6/eliminar` | 403 | 403 (según lo esperado) | PASS |
| INM-14 | TECNICO | `PATCH /api/inmobiliarias/6/reactivar` | 403 | 403 (según lo esperado) | PASS |
| ADM-04 | GESTOR | `POST /api/usuarios` | 403: GESTOR no crea ADMINISTRADOR; no se crea el usuario | 403 (según lo esperado) | PASS |
| ADM-05 | GESTOR (promueve a otro usuario) | `PUT /api/usuarios/22` | 403: GESTOR no promueve a ADMINISTRADOR; rol sin cambios | 403 (según lo esperado) | PASS |
| ADM-05 | GESTOR (se auto-promueve) | `PUT /api/usuarios/17` | 403: GESTOR no promueve a ADMINISTRADOR; rol sin cambios | 403 (según lo esperado) | PASS |
| ADM-05 | GESTOR (modifica un ADMINISTRADOR) | `PUT /api/usuarios/16` | 403: GESTOR no modifica un ADMINISTRADOR; sin cambios | 403 (según lo esperado) | PASS |
| ADM-07 | GESTOR | `DELETE /api/usuarios/25` | 403: GESTOR no elimina usuarios; el usuario sigue existiendo | 403 (según lo esperado) | PASS |
| ADM-16 | INMO_A | `GET /api/usuarios` | 403 sin escrituras | 403 (según lo esperado) | PASS |
| ADM-16 | INMO_A | `GET /api/usuarios/22` | 403 sin escrituras | 403 (según lo esperado) | PASS |
| ADM-16 | INMO_A | `POST /api/usuarios` | 403 sin escrituras | 403 (según lo esperado) | PASS |
| ADM-16 | INMO_A | `PUT /api/usuarios/22` | 403 sin escrituras | 403 (según lo esperado) | PASS |
| ADM-16 | INMO_A | `DELETE /api/usuarios/25` | 403 sin escrituras | 403 (según lo esperado) | PASS |
| ADM-16 | INMO_A | `POST /api/fracciones` | 403 sin escrituras | 403 (según lo esperado) | PASS |
| ADM-16 | INMO_A | `PUT /api/fracciones/2` | 403 sin escrituras | 403 (según lo esperado) | PASS |
| ADM-16 | INMO_A | `DELETE /api/fracciones/3` | 403 sin escrituras | 403 (según lo esperado) | PASS |
| ADM-16 | TECNICO | `GET /api/usuarios` | 403 sin escrituras | 403 (según lo esperado) | PASS |
| ADM-16 | TECNICO | `GET /api/usuarios/22` | 403 sin escrituras | 403 (según lo esperado) | PASS |
| ADM-16 | TECNICO | `POST /api/usuarios` | 403 sin escrituras | 403 (según lo esperado) | PASS |
| ADM-16 | TECNICO | `PUT /api/usuarios/22` | 403 sin escrituras | 403 (según lo esperado) | PASS |
| ADM-16 | TECNICO | `DELETE /api/usuarios/25` | 403 sin escrituras | 403 (según lo esperado) | PASS |
| ADM-16 | TECNICO | `POST /api/fracciones` | 403 sin escrituras | 403 (según lo esperado) | PASS |
| ADM-16 | TECNICO | `PUT /api/fracciones/2` | 403 sin escrituras | 403 (según lo esperado) | PASS |
| ADM-16 | TECNICO | `DELETE /api/fracciones/3` | 403 sin escrituras | 403 (según lo esperado) | PASS |
| DOC-18 | GESTOR | `DELETE /api/files/2/purge` | 403: solo ADMINISTRADOR purga | 403 (según lo esperado) | PASS |
| DOC-18 | INMO_A | `DELETE /api/files/2/purge` | 403: solo ADMINISTRADOR purga | 403 (según lo esperado) | PASS |
| DOC-18 | TECNICO | `DELETE /api/files/2/purge` | 403: solo ADMINISTRADOR purga | 403 (según lo esperado) | PASS |
| DOC-24 | INMO_A | `PATCH /api/files/2/aprobaciones` | 403: INMOBILIARIA no aprueba planos; sin cambios | 403 (según lo esperado) | PASS |
| LOT-04 | TECNICO | `GET /api/lotes?deudor=true` | 400: TECNICO no puede filtrar por deudor | 400 (según lo esperado) | PASS |
| LOT-04 | TECNICO | `GET /api/lotes` | 200 sin el campo deuda en ningún lote | 200 (según lo esperado) | PASS |
| LOT-04 | TECNICO | `GET /api/lotes/20` | 200 sin el campo deuda (lote con deuda) | 200 (según lo esperado) | PASS |
| LOT-03 | INMO_A | `GET /api/lotes` | 200 sin lotes NO_DISPONIBLE ni campos sensibles (deuda, documento de propietario/inquilino) | incluye 2 lotes NO_DISPONIBLE, 47 lotes exponen deuda, 47 lotes exponen documento del propietario, 1 lotes exponen documento del inquilino, 2 lotes exponen la prioridad (y el nombre) de otra inmobiliaria | FAIL |
| LOT-03 | INMO_A | `GET /api/lotes/21` | 403/404 para el detalle de un lote NO_DISPONIBLE | status 200 (esperado 403/404) | FAIL |
| PER-02 | INMO_A | `GET /api/personas` | 200 solo con clientes de A | 200 (según lo esperado) | PASS |
| PER-02 | INMO_A | `GET /api/personas?view=ALL` | 200 solo con clientes de A | 200 (según lo esperado) | PASS |
| PER-02 | INMO_A | `GET /api/personas?view=CLIENTES` | 200 solo con clientes de A | 200 (según lo esperado) | PASS |
| PER-02 | INMO_A | `GET /api/personas?view=PROPIETARIOS` | 200 solo con clientes de A | 200 (según lo esperado) | PASS |
| PER-02 | INMO_A | `GET /api/personas?includeInactive=true` | 200 solo con clientes de A | 200 (según lo esperado) | PASS |
| PER-02 | INMO_A | `GET /api/personas?inmobiliariaId=6` | 200 solo con clientes de A | 200 (según lo esperado) | PASS |
| PER-02 | INMO_A | `GET /api/personas?q=ClienteB` | 200 solo con clientes de A | 200 (según lo esperado) | PASS |
| PER-10 | INMO_A | `POST /api/personas` | No queda asignada a B: se crea con la inmobiliaria de A o se rechaza | 201 (según lo esperado) | PASS |
| RES-01 | INMO_A | `GET /api/reservas` | 200 solo con reservas de A | 200 (según lo esperado) | PASS |
| RES-11 | INMO_A | `POST /api/reservas` | No queda a nombre de B: se crea con la inmobiliaria de A o se rechaza | 201 (según lo esperado) | PASS |
| RES-27 | INMO_A | `PATCH /api/reservas/17/eliminar` | 403 sin escrituras (reserva RECHAZADA de B) | 403 (según lo esperado) | PASS |
| RES-27 | INMO_A | `PATCH /api/reservas/19/reactivar` | 403 sin escrituras (reserva ELIMINADA de B) | 403 (según lo esperado) | PASS |
| PRI-07 | INMO_A | `POST /api/prioridades` | No queda como prioridad CCLF: se crea como INMOBILIARIA de A o se rechaza | 201 (según lo esperado) | PASS |
| PRI-11 | INMO_A | `PATCH /api/prioridades/7` | 403 sin escrituras | 403 (según lo esperado) | PASS |
| PRI-11 | INMO_A | `PATCH /api/prioridades/7/cancelar` | 403 sin escrituras | 403 (según lo esperado) | PASS |
| DOC-11 | INMO_A | `GET /api/files/lote/42` | 200 con PLANO/IMAGEN del lote, sin el BOLETO de B | 200 (según lo esperado) | PASS |
| DOC-11 | INMO_A | `GET /api/files/6` | 404 (no revela el BOLETO de B) | 404 (según lo esperado) | PASS |
| DOC-11 | INMO_A | `POST /api/files/6/url` | 404 (sin URL firmada del BOLETO de B) | 404 (según lo esperado) | PASS |
| DOC-11 | INMO_A | `GET /api/files/venta/10` | 404 (archivos de la venta de B) | 404 (según lo esperado) | PASS |
| DOC-11 | INMO_A | `GET /api/files/venta/9` | control: 200 con el BOLETO de su propia venta | 200 (según lo esperado) | PASS |
| GEN-12 | INMO_A | `GET /api/reservas/15` | 403/404 (reserva de B por ID) | 403 (según lo esperado) | PASS |
| GEN-12 | INMO_A | `GET /api/reservas/15/ofertas` | 403/404 (ofertas de una reserva de B) | 403 (según lo esperado) | PASS |
| GEN-12 | INMO_A | `GET /api/reservas/inmob/6` | 403 (reservas de la inmobiliaria B) | 403 (según lo esperado) | PASS |
| GEN-12 | INMO_A | `GET /api/prioridades/7` | 403/404 (prioridad de B por ID) | 403 (según lo esperado) | PASS |
| GEN-12 | INMO_A | `GET /api/ventas/inmobiliaria/6` | 403 (ventas de la inmobiliaria B) | 403 (según lo esperado) | PASS |
| GEN-12 | INMO_A | `GET /api/ventas/10` | 403 (detalle de venta: solo staff) | 403 (según lo esperado) | PASS |
| GEN-12 | INMO_A | `GET /api/personas/24` | 403 (detalle de persona: INMOBILIARIA no tiene acceso) | 403 (según lo esperado) | PASS |
| GEN-12 | INMO_A | `GET /api/prioridades` | 200 solo con prioridades de A (ignora ?inmobiliariaId) | 200 (según lo esperado) | PASS |
| GEN-12 | INMO_A | `GET /api/prioridades?inmobiliariaId=6` | 200 solo con prioridades de A (ignora ?inmobiliariaId) | 200 (según lo esperado) | PASS |
| ACC-15 | GESTOR → TECNICO → GESTOR | `GET /api/usuarios con el mismo token antes y después de PUT /api/usuarios/:id {rol}` | 200 → (cambio a TECNICO) 403 → (vuelta a GESTOR) 200, sin re-login | 200 → 200 → 403 → 200 → 200 | PASS |
| ACC-14 | ADMINISTRADOR elimina a GESTOR auxiliar | `DELETE /api/usuarios/25; luego GET /api/usuarios con su token previo y re-login` | 200 → token previo 401 → login 401 | GET 200 → DELETE 200 → GET 401 → login 401 | PASS |
| ADM-08 | ADMINISTRADOR elimina a GESTOR auxiliar | `DELETE /api/usuarios/25; luego GET /api/usuarios con su token previo y re-login` | 200 → token previo 401 → login 401 | GET 200 → DELETE 200 → GET 401 → login 401 | PASS |
| ACC-13 | INMO_B (dada de baja por ADMINISTRADOR) | `PATCH /api/inmobiliarias/6/eliminar; token previo, login y reactivación` | token previo 401; login 401 genérico; tras reactivar, login 200 | GET 200 → baja 200 → token 401 → login 401 (genérico) → reactivar 200 → login 200 | PASS |
| INM-09 | INMO_B (dada de baja por ADMINISTRADOR) | `PATCH /api/inmobiliarias/6/eliminar; token previo, login y reactivación` | token previo 401; login 401 genérico; tras reactivar, login 200 | GET 200 → baja 200 → token 401 → login 401 (genérico) → reactivar 200 → login 200 | PASS |
| ACC-05 | anónimo (cuenta auxiliar) | `POST /api/auth/login repetido con password incorrecta` | 429 TOO_MANY_REQUESTS al superar 10 fallidos en 15 min (policy q=10;w=900) | 429 tras 10 fallidos en la ventana; policy ""10-in-15min"; q=10; w=900; pk=:YmIwY2Q1MTM2YWU1:" | PASS |
| ACC-06 | anónimo (cuenta auxiliar) | `POST /api/auth/login con la password correcta durante el bloqueo` | 429 también con credenciales válidas mientras dura la ventana | 429 | PASS |

## Restauración de datos

- OK — reserva temporal RES-11 borrada y lote 19 restaurado a DISPONIBLE
- OK — prioridad temporal PRI-07 borrada y lote 19 restaurado a DISPONIBLE
- OK — inmobiliaria B → OPERATIVO
- OK — recrear qa.aux.eliminado (GESTOR)
- OK — rol de qa.aux.ratelimit → GESTOR
- OK — borrar persona temporal PER-10 (id 74)
- Verificación final: datos QA restaurados (inmobiliaria B OPERATIVO, cuentas auxiliares GESTOR, sin registros temporales).

## Notas

- Mapeo de IDs corregido por el responsable de QA según la guía (ADM-07, ADM-16, GEN-10, GEN-11). LOT-03 es Base E de la guía.
- ADM-05 (según la guía): GESTOR modifica una cuenta existente de ADMINISTRADOR → 403; incluye además los intentos de GESTOR de promover a ADMINISTRADOR.
- Interpretación propia (confirmar contra la guía): ACC-03 = login con campos vacíos → 400.
- Files: el entorno QA no tiene storage (SUPABASE_* dummy). Los casos de archivos se prueban sobre metadata; subir, firmar URL o purgar como ADMINISTRADOR responde 500 en este entorno.
- ACC-05/06: el desbloqueo al vencer la ventana (15 min) no se automatiza; verificar a mano si la guía lo pide.
- El rate limit de login quedó activo para localhost: reiniciar el backend QA antes de seguir con pruebas manuales.
