# Sistema de gestión de información de lotes del Club de Campo La Federala.

Sistema para que centralice y gestione la información  relacionada con los lotes y propietarios del Club de Campo La Federala, con los  fines  de  ser  la  herramienta principal  del  club  y  como  servicio  de  venta  para  las  inmobiliarias asociadas.

## Documentación actual

La documentación operativa y técnica se consolida en [`docs/`](docs/00-introduccion.md). La carpeta histórica [`Documentacion/`](Documentacion/README.md) se conserva sin modificaciones durante la transición.

- [Dominio y negocio](docs/domain/glosario.md)
- [Requisitos](docs/requirements/requisitos-funcionales.md)
- [Casos de uso](docs/use-cases/casos-uso-principales.md)
- [Arquitectura técnica](docs/architecture/overview.md)
- [Contrato de API (OpenAPI)](Backend/documents/documentacionApi.yaml)
- [Guía de desarrollo](docs/development/setup-local.md)
- [Guía de contribución](CONTRIBUTING.md)

## Miembros del Equipo

**Nombre Completo:** Nicolás Pérez  
**Legajo:** 33177 
**Alias de Slack:** Nicolas Agustin Perez
**Perfil GitHub:** [Nicoperez04](https://github.com/Nicoperez04)

**Nombre Completo:** Agostina Pascucci
**Legajo:** 33347 
**Alias de slack:** Agostina Pascucci
**Perfil GitHub:** [agostinapascucci](https://github.com/agostinapascucci)

**Nombre Completo:** Santiago Talavera
**Legajo:** 33167
**Alias de slack:** SantiTalavera
**Perfil GitHub:** [SantiTalavera](https://github.com/SantiTalavera)

**Nombre Completo:** Agustina Egüen 
**Legajo:** 33191
**Alias de Slack:** Agustina Egüen
**Perfil GitHub:** [aguseguen](https://github.com/aguseguen)

**Nombre Completo:** Justina Smith 
**Legajo:** 33346
**Alias de Slack:** Justina Smith
**Perfil GitHub:** [justinasmith1](https://github.com/justinasmith1)

## Oportunidad de Negocio 
Problema que resuelve: Actualmente, no existe un sistema de gestión de lotes que utilice el Club de Campo ni una base de datos. Cada miembro de la 
organización que tiene acceso a la información de los lotes la almacena y maneja por separado (utilizando Excel o Documentos propios). La información está 
totalmente descentralizada. Además, las inmobiliarias no cuentan con un portal de consulta para saber el estado de los lotes, lo que obliga a depender de una 
comunicación directa con la administración, la cual envía un listado de lotes disponibles y su precio a un grupo de Whatsapp semanalmente. 

## Visión del Producto 
- Descripción general: Sistema de gestión de información de lotes del Club de Campo La Federala.  
- Propuesta de valor: Ofrecemos una solución digital moderna, visual e intuitiva que centraliza la gestión de lotes del Club de Campo La Federala. A través de un 
  mapa interactivo y un sistema de información completo, simplificamos el seguimiento del estado de cada lote, optimizamos la comunicación con inmobiliarias y mejoramos la toma de decisiones comerciales como estructurales. 
- Usuarios principales: Director, administradores, inmobiliarias asociadas, compradores, asesores, técnicos y mantenimiento. 

## Objetivos del Proyecto  
- Objetivo principal: Gestionar la información de los lotes del Club de Campo La Federala.  
- Objetivos específicos: 
    a. Centralizar en un sistema el 100% de la información de los 311 lotes y espacios comunes del club. 

    b. Permitir el seguimiento en tiempo real de los estados y subestados de los lotes (disponible a la venta, no disponible a la venta, vendido, etc.). 

    c. Implementación de un mapa interactivo de todo el club con la ubicación de cada lote, que al seleccionar muestre la información específica de cada uno. 

    d. Desarrollar una interfaz para las inmobiliarias que les permita reservar un lote disponible a la venta. 

    e. Incorporar filtros de búsqueda y visualización que permitan consultar lotes por estado, ubicación o características. 


