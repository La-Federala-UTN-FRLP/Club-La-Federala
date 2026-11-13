# Frontend

Aplicación React para la gestión de **Lotes**, **Ventas**, **Inmobiliarias** y **Reservas** de los mismos.  
El foco del front es: **tablero reutilizable**, **barra de filtros reutilizable**, **autenticación/ autorización por rol (RBAC)** y **validaciones de formularios**.

---

## Testing

- **Cómo ejecutar los tests**
  1. Instalá las dependencias (`npm install`).
  2. Corré la suite con `npm test`.
  3. Para un archivo específico podés usar `npm test -- nombre-del-archivo`.

- **Qué se está testeando**
  - Componentes reutilizables (Tabla, FilterBar, layouts) y su comportamiento condicionado por rol.
  - Hooks y utilidades (`useDebouncedEffect`, `useModalSheet`, formateadores) que encapsulan lógica.
  - Adaptadores de API en `lib/api/*`, validando la normalización de respuestas y el manejo de errores.

---

## Stack

- **React** + **React Router**
- **CSS** (estilos propios del proyecto)
- **lucide-react** (iconos)
- **dnd-kit** (drag & drop en selector de columnas)
- **ES Modules / Vite** (dev server y build)
- **Fetch API** con capa HTTP propia (header `Authorization: Bearer`, manejo de 401)

---

## Configuración (variables de entorno)

Copiar `.env.example` a `.env.local` (no versionado). No hay secretos en el frontend.

| Variable | Uso |
|---|---|
| `VITE_API_BASE_URL` | **Canónica.** Base de la API incluyendo `/api` (por ejemplo `https://<backend>/api`). En development, si apunta a localhost, se usa el proxy de Vite (`/api`). |
| `VITE_API_FORCE_ABSOLUTE` | `true`: usar `VITE_API_BASE_URL` tal cual también en development. Opcional. |
| `VITE_AUTH_TOKEN_KEY` | Clave de localStorage del token. Opcional (default `lf_token`). |
| `VITE_RBAC_DISABLE_UI` | `true` desactiva el gating visual por rol, solo para maquetar. No usar fuera de desarrollo. |
| `VITE_API_BASE` | Compatibilidad temporal: se lee solo si falta `VITE_API_BASE_URL`. No usar en configuraciones nuevas. |

`VITE_API_URL` no existe: no usarla. Si tu `.env` local todavía tiene `VITE_AUTH_REFRESH_*`, `VITE_AUTH_ME_PATH`, `VITE_AUTH_LOGIN_PATH` o `VITE_API_URL`, borralas: el código ya no las lee.

Sin `VITE_API_BASE_URL`, el build usa `/api` relativo al propio dominio del frontend; en producción hay que definirla en el hosting.

---

## Estructura principal

```
src/
  app/
    providers/
      AuthProvider.jsx        # contexto de usuario/rol y sesión
  components/
    Table/
      TablaBase.jsx           # tabla genérica (paginación, selección, column picker)
    TablaLotes/              
      cells/                  # manejo de estados (ui)
        StatusBadge.jsx
        SubstatusBadge.jsx
      parts/                  # comportamiento de botones del header de una tabla
        ColumnPicker.jsx
        PageSizeDropdown.jsx
      presets/
        lotes.table.jsx       # preset de columnas de Lotes
      utils/
        formatters.jsx
        getters.js
      TablaLotes.jsx          # wrapper de Lotes sobre TablaBase
      TablaLotes.css
    FilterBar/
      controls/
        RangeControl.jsx      # manejo de filtro para definir rangos (precios, montos, etc.)
      hooks/
        useDebouncedEffect.js
        useModalSheet.js
      presets/
        lotes.preset.js       # preset de filtros de Lotes
      utils/
        chips.js              # chip para facil eliminacion de un fitro
        param.js
        role.js
      FilterBar.jsx           # FilterBar generico 
      FilterBar.css
    ...
  lib/
    api/
      lotes.js                # adapter de API de Lotes (normaliza respuestas)
      ventas.js               # idem
      inmobiliarias.js        # idem
      reservas.js             # idem
      ...
    http/
      http.js                 # capa HTTP (Bearer, headers, 401 → logout)
    filters/
      applyLoteFilters.js     # filtros en front 
  pages/
    Dashboard.jsx             # tablero de lotes, pestaña principal
    ...                       # (Ventas, Inmobiliarias, Reservas, Personas, Reportes)
  components/
    Layout.jsx                # shell + rutas anidadas
    ModulePills.jsx           # accesos a módulos
    User.jsx / Header.jsx / SidePanel.jsx ...
```

---

## Conceptos clave de la implementación

### 1) Adaptadores de API (capa de datos)
- Cada módulo expone un archivo `lib/api/<modulo>.js` que **normaliza** la forma del backend.
- Contrato estable del front: **todas** las funciones “getAll” devuelven **`{ data: [] }`**.
- Ejemplo (Lotes): el back responde `{ success:true, data:{ lotes:[], total } }` → el adapter de `lotes.js` lo transforma a `{ data: LoteUI[] }`.
- Esto evita `ifs` en componentes y facilita reusar UI entre módulos.

### 2) Tabla reutilizable
- `components/Table/TablaBase.jsx`:
  - Paginación, selección, **selección controlada** (`selected` + `onSelectedChange`), orden visual por columnas seleccionadas.
  - **ColumnPicker** con drag & drop (dnd-kit) y límite de columnas visibles por rol.
  - No sabe de “lotes/ventas”: solo recibe `rows`, `columns` y un `renderRowActions`.
- **Wrappers por módulo**: `TablaLotes.jsx` usa la tabla base y:
  - Carga su **preset de columnas** (`presets/lotes.table.jsx`).
  - Define **acciones por fila** (ver/editar/venta/eliminar/promoción), que se habilitan según permisos.
  - Muestra la **toolbar del módulo** (Ver en mapa, Limpiar selección, Agregar Lote).

### 3) Filter Bar reutilizable
- `components/FilterBar/FilterBar.jsx` es única.
- Cada módulo define su **preset** (chips/controles → claves de filtro). Ej.: `lotes.preset.js`.
- La página (Dashboard) recibe `onParamsChange` y aplica filtros **en front** con `lib/filters/applyLoteFilters.js`.  
  > Más adelante, los mismos params se enviarán al backend sin cambiar la UI.

### 4) Autenticación y Autorización (RBAC)
- **Bearer JWT, sin cookies:** `POST /auth/login` devuelve el token y el usuario; el token se guarda en `localStorage` (`lf_token`) y viaja en `Authorization: Bearer` en cada request (`lib/http/http.js` y los fetch de archivos en `lib/api/archivos.js`). Sin `credentials: "include"`.
- **No hay refresh de sesión ni `/auth/me`.** Un `401` (token ausente, vencido o inválido) limpia la sesión y redirige a `/login`; solo decide el status, no el texto del body. Al vencer el token hay que volver a loguearse.
- **AuthProvider** guarda el usuario (con su rol) y expone la sesión a la UI.
- La autorización real la hace el backend: la UI solo oculta lo que el rol no puede usar.
- **RBAC en UI**: helpers en `lib/auth/rbac.ui` gobiernan:
  - qué **acciones** por fila se muestran,
  - qué **columnas** aparecen por rol (plantillas en el preset),
  - qué **estados** se listan (ocultamos “NO_DISPONIBLE” a ciertos perfiles, etc).
- Lógica visible hoy:  
  - Solo **admin** ve “+ Agregar Lote”.  
  - Acciones (👁️ ver, ✏️ editar, 💲 venta, 🗑️ eliminar, % promos) aparecen/ se ocultan por rol.
- **Rutas protegidas**: la UI ya restringe acciones.

### 5) Validaciones de formularios
- Los formularios de gestión (crear/editar lote, etc.) muestran **errores por campo** y bloquean envío inválido.
- Las validaciones son **controladas en React** (reglas por campo y feedback en tiempo real) + verificación del lado del backend.

---

## Flujo actual (Lotes)

1. **Carga**: `getAllLotes()` (adapter) → `{ data: LoteUI[] }`.  
2. **Dashboard**: mantiene `params` de filtros y el array de lotes.  
3. **FilterBar (preset de lotes)** emite cambios de filtros → se **filtra en front**.  
4. **TablaLotes** recibe `rows` filtradas y maneja **selección controlada**:
   - “Ver en mapa (futuro) (N)” muestra el contador real de seleccionados para poder verlos en el mapa.
   - “Limpiar selección” desmarca los checkboxes de la grilla.
5. **Acciones** por fila se rigen por **permisos** del rol.

La misma estructura se replica para **Ventas / Inmobiliarias / Reservas / Personas** cambiando **solo** el adapter de API, el **preset de columnas** y el **preset de filtros**.

---