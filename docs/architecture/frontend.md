# Arquitectura frontend

El frontend utiliza React, Vite, React Router, Bootstrap y CSS propio. `src/main.jsx` monta `BrowserRouter`, `AuthProvider` y `ToastProvider`; `src/App.jsx` declara rutas públicas, protegidas y por permiso.

## Organización

- `src/assets`: recursos estáticos.
- `src/app`: providers y guards de rutas.
- `src/components`: UI reutilizable (tablas, filtros, tarjetas, mapa y layout).
- `src/pages`: pantallas asociadas a rutas.
- `src/lib`: API clients, HTTP, autenticación, validaciones y constantes.
- `src/hooks` y `src/utils`: lógica transversal sin responsabilidad visual.
- `src/App.jsx`: composición de rutas; `src/main.jsx`: bootstrap global.

## Layout y navegación

`components/Layout.jsx` es el shell de rutas privadas. React Router aplica `ProtectedRoute` y `RequireRole`. Los adaptadores de `lib/api/` normalizan respuestas para que los componentes no dependan directamente del contrato HTTP.

## Criterio

Una página orquesta; un componente resuelve UI reutilizable; un hook o utilidad encapsula lógica no visual. Evitar archivos que mezclen layout, navegación, lógica de negocio, estado y páginas completas.
