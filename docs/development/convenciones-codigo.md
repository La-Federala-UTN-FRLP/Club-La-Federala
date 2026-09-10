# Convenciones de código

- `PascalCase` para componentes/páginas React; `camelCase` para funciones, variables y utilidades.
- Mantener `.jsx` en frontend y `.ts` en backend; tests con sufijo `.test.*` siguiendo el patrón actual.
- Agrupar dependencias externas antes de imports internos y eliminar imports no usados.
- Crear componente ante UI reutilizable o estado visual propio; extraer función ante lógica reutilizable/no visual.
- Páginas orquestan, `lib/api` consume HTTP y servicios backend contienen reglas de negocio.
- Rutas encadenan middleware, controladores adaptan HTTP y servicios ejecutan la lógica.
- Documentar solo decisiones, reglas o contratos no obvios; actualizar comentarios junto al comportamiento.
