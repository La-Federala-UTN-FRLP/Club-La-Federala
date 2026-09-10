# Documentación JavaScript con JSDoc

Usar JSDoc en funciones de negocio, contratos reutilizables o lógica no obvia. No documentar funciones triviales cuyo nombre sea suficiente.

```js
/**
 * Reserva una entidad disponible para un usuario o cliente.
 *
 * @param {string} entityId - ID de la entidad a reservar.
 * @param {string} userId - ID del usuario que realiza la operación.
 * @param {Date} expiresAt - Fecha de vencimiento de la reserva.
 * @returns {Promise<object>} Registro creado.
 *
 * @throws {Error} Si la entidad no existe.
 * @throws {Error} Si la entidad no está disponible.
 */
export async function reserveEntity(entityId, userId, expiresAt) {
  // implementación
}
```

- Documentar precondiciones, efectos, errores, tipos, unidades o formatos relevantes.
- Mantener el comentario actualizado con firma y comportamiento.
- Preferir nombres claros antes que comentarios extensos en operaciones simples.
