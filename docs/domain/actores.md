# Actores del sistema

## Actor: Administrador
### Descripción
Rol interno de administración integral.
### Responsabilidades
- Mantener lotes, personas, inmobiliarias, usuarios y estructura territorial.
### Acciones principales
- Administrar operaciones comerciales, archivos y bajas definitivas autorizadas.
### Permisos esperados
- Acceso amplio a los módulos.

## Actor: Gestor
### Descripción
Rol interno de operación comercial y de información.
### Responsabilidades
- Gestionar lotes, reservas, ventas, personas, inmobiliarias y prioridades.
### Acciones principales
- Registrar operaciones y seguir sus estados.
### Permisos esperados
- Sin ciertas eliminaciones definitivas del administrador.

## Actor: Inmobiliaria
### Descripción
Agencia asociada que opera sobre su cartera.
### Responsabilidades
- Crear clientes, reservas y prioridades propias.
### Acciones principales
- Consultar lotes y documentación disponible.
### Permisos esperados
- Alcance filtrado a datos propios.

## Actor: Técnico
### Descripción
Rol interno técnico y documental.
### Responsabilidades
- Mantener información y archivos autorizados de lotes.
### Acciones principales
- Gestionar documentación y aprobaciones de planos.
### Permisos esperados
- Sin operación comercial de ventas/reservas.

## Actor: Servicio de almacenamiento
### Descripción
Servicio externo de archivos configurado mediante Supabase.
### Responsabilidades
- Almacenar archivos y emitir URL firmadas desde el backend.
### Acciones principales
- No aplica.
### Permisos esperados
- Credenciales no expuestas al frontend.
