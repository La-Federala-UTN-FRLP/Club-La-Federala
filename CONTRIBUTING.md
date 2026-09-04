# Guía de contribución

Esta guía describe cómo preparar cambios para el Sistema de Gestión de Información de Lotes del Club de Campo La Federala. Las decisiones y convenciones detalladas permanecen en la documentación mantenida bajo [`docs/`](docs/00-introduccion.md).

## Estrategia de ramas

No se realizan cambios directamente sobre `main`. Cada aporte se desarrolla en una rama corta, con un único objetivo, creada desde una base actualizada.

Usar nombres descriptivos según el tipo de cambio:

- `feature/nombre-de-la-funcionalidad` para una funcionalidad.
- `fix/descripcion-del-error` para una corrección.
- `docs/mejora-de-documentacion` para documentación.
- `refactor/nombre-del-cambio` para una mejora interna sin cambio funcional.

## Flujo de trabajo

1. Sincronizar la rama principal antes de comenzar:

   ```bash
   git checkout main
   git pull origin main
   ```

2. Crear una rama para la tarea:

   ```bash
   git checkout -b feature/nueva-funcionalidad
   ```

3. Implementar el cambio siguiendo las [convenciones de código](docs/development/convenciones-codigo.md) y el [flujo de trabajo con Git](docs/development/git-flow.md).
4. Ejecutar las validaciones aplicables antes de abrir un Pull Request.
5. Crear commits descriptivos con la convención definida abajo.
6. Abrir un Pull Request hacia `main`; otra persona del equipo debe revisarlo antes de integrarlo.

## Validaciones

Ejecutar solo las validaciones que correspondan a los componentes modificados.

Backend:

```bash
cd Backend
npm run build
npm test
```

Frontend:

```bash
cd frontend
npm run lint
npm run build
```

Para cambios exclusivamente documentales, revisar enlaces Markdown, coherencia con el comportamiento vigente y la estructura de los documentos afectados.

## Convención de commits

Los commits deben respetar el formato:

```text
tipo(scope): descripción
```

Ejemplos: `feat(reservas): agrega cancelación` y `docs(api): actualiza contrato de reservas`.

El repositorio incluye un hook `commit-msg` que valida este formato. Para activarlo localmente, ejecutar una vez desde la raíz:

```bash
git config core.hooksPath .githooks
```

Los tipos aceptados son `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `build`, `ci`, `perf` y `revert`.

## Estándares de código y documentación

- Aplicar las [convenciones de código](docs/development/convenciones-codigo.md), que incluyen nomenclatura, imports, separación de responsabilidades y documentación de decisiones no obvias.
- Mantener la documentación de [`docs/`](docs/00-introduccion.md) alineada con cambios en reglas, endpoints, casos de uso o decisiones de arquitectura.
- Conservar [`Documentacion/`](Documentacion/README.md) como material histórico mientras dure la consolidación; no modificarla sin una decisión explícita.
- Registrar decisiones de arquitectura nuevas mediante ADR, según el [flujo de trabajo con Git](docs/development/git-flow.md).

## Checklist para Pull Requests

- [ ] La rama tiene un propósito y nombre descriptivos.
- [ ] Los commits cumplen `tipo(scope): descripción`.
- [ ] Ejecuté las validaciones aplicables o aclaré por qué no correspondían.
- [ ] No incluí secretos, archivos generados ni cambios ajenos a la tarea.
- [ ] Actualicé documentación, contrato de API o ADR cuando el cambio lo requiere.
- [ ] El PR explica el alcance, la validación realizada y cualquier limitación conocida.
