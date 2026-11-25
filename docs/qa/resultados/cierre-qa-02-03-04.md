# Cierre QA · Auth y permisos, lotes y mapa, personas y grupos familiares

- **Fecha:** 2026-11-25 · **Ambiente:** Local (base QA en Docker `federala-qa-db`, datos de `npm run seed:qa`; ver [preparación del entorno](../preparacion-entorno-qa.md)).
- **Issues:** #296 (QA-02), #297 (QA-03) y #298 (QA-04).
- **Estado general:** sin P0 ni P1 abiertos. Todos los hallazgos corregidos están en `main`.
- **Staging:** la validación en staging se hace en el issue de recorridos E2E (#302).

## Resumen

| Issue | Alcance | Resultado | Hallazgos corregidos | Diferido |
|---|---|---|---|---|
| #296 · QA-02 | Auth, usuarios y permisos | Cerrado | 3 (PR #357) | 2 |
| #297 · QA-03 | Lotes, ubicaciones y mapa | Cerrado | 9 (en PR #340, #343, #344, #354) | 3 |
| #298 · QA-04 | Personas y grupos familiares | Cerrado | — | 1 (P3) |

## QA-02 (#296) · Auth, usuarios y permisos

**Alcance probado**

- API: `npm run qa:api`, 38/38 PASS en `main`. Cubre sesión, tokens, rate limit, permisos por rol, aislamiento entre inmobiliarias e invalidación de tokens. Detalle en [api-permisos-2026-11-22.md](api-permisos-2026-11-22.md).
- Pantalla: menú lateral por rol, acceso por URL a módulos no permitidos (pantalla 403), ABM de inmobiliarias (alta, comisión fuera de rango rechazada, edición, baja y reactivación, filtro de eliminadas), logout y Mi Cuenta.

**Hallazgos**

| Hallazgo | PR |
|---|---|
| El menú del técnico mostraba "Prioridades" y la ruta respondía 403. | #357 |
| La lista de inmobiliarias no se actualizaba al crear una nueva. | #357 |
| Mi Cuenta mostraba datos ficticios para cualquier usuario. | #357 |

**Diferido**

- Tras cerrar sesión, el botón Atrás del navegador muestra la vista cacheada, sin exponer datos nuevos.
- No hay pantalla de ABM de usuarios. Ese ABM se valida por API (`qa:api`).

## QA-03 (#297) · Lotes, ubicaciones y mapa

**Alcance probado**

- Pantalla: tablero, búsqueda, filtro por estado y limpiar filtros; mapa con colores y leyenda.
- Panel lateral por rol: administrador ve Editar y Reservar; inmobiliaria solo Reservar y sin lotes NO_DISPONIBLE; técnico solo Editar.

**Hallazgos**

| Prioridad | Hallazgo | PR |
|---|---|---|
| P0 | La API exponía lotes NO_DISPONIBLE y datos sensibles a INMOBILIARIA. | #340 |
| P1 | Oráculos de existencia de lotes NO_DISPONIBLE (reservas, prioridades y archivos). | #343 |
| P2 | El editor del técnico permitía campos no técnicos. Queda limitado a subestado y superficie, sin borrado de imágenes guardadas. | #354 |
| P3 | Deuda y Actualizado visibles sin distinguir rol (detalle, tabla, selector de columnas y editor). | #344 |

**Diferido**

- Promociones (aplicar y quitar), filtros y zoom del mapa.
- LOT-42: botones de documentos del editor de lote (decisión abierta).
- Subida y borrado de imágenes con storage real: en el entorno QA local el storage está desactivado. Se valida en staging.

## QA-04 (#298) · Personas y grupos familiares

**Alcance probado (API y pantalla)**

- Persona: alta de persona física, DNI duplicado (409) e inválido (400), edición, desactivar y reactivar, borrado definitivo sin relaciones y borrado con relaciones rechazado (409).
- Grupo familiar: alta y baja de miembro en un propietario; un miembro no puede ser titular de otro grupo.
- Por rol: INMOBILIARIA ve solo sus clientes, crea clientes y ve su detalle; TECNICO tiene solo lectura (alta 403 y, en pantalla, solo "Ver").

**Hallazgos:** ninguno que bloquee el cierre.

**Diferido (P3)**

- `PUT /personas/:id` acepta `jefeDeFamiliaId` y responde 200, pero lo ignora. No permite llegar a estados inválidos.
