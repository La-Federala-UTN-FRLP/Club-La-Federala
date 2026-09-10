# ADR-002 - Organización del frontend React por responsabilidades

## Estado
Aceptada
## Contexto
La aplicación tiene múltiples módulos y no debe concentrar rutas, pantallas, componentes y lógica en `App.jsx`.
## Decisión
Mantener `App.jsx` para rutas, `main.jsx` para bootstrap, `pages` para pantallas, `components` para UI reutilizable, `assets` para recursos y `lib`/`hooks`/`utils` para lógica transversal. Usar React Router y guards de acceso.
## Consecuencias positivas
- Evita un `App.jsx` gigante y mejora reutilización/mantenibilidad.
- Hace explícita la navegación protegida y la capa API.
## Consecuencias negativas
- Requiere criterio para extraer componentes y utilidades.
## Alternativas consideradas
- Un archivo por módulo que mezcle UI y datos.
- HTTP directamente desde cada componente visual.
## Fecha
2026-09-02
