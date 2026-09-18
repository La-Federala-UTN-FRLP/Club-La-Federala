// interfacesCCLF.d.ts

import { EstadoVenta, OwnerPrioridad } from "../generated/prisma";

// --- TIPOS BÁSICOS ---
// Estos tipos definen los valores permitidos para ciertas propiedades,
// lo que ayuda a prevenir errores de tipeo.

export type Identificador = "DNI" | "CUIT" | "CUIL" | "Pasaporte";
export type Calle = "Reinamora" | "Maca" | "Zorzal" | "Cauquén" | "Alondra" | "Jacana" | "Tacuarito" | "Jilguero" | "Golondrina" | "Calandria" | "Aguilamora" | "Lorca" | "Milano";
export type EstadoLoteOpc = "Disponible" | "Reservado" | "Vendido" | "No Disponible" | "Alquilado" | "En Promoción" | "Con Prioridad";
export type SubestadoLote = "En Construccion" | "No Construido" | "Construido";
export type UbicacionOpc = "Norte" | "Sur" | "Este" | "Oeste";
export type Rol = "ADMINISTRADOR" | "INMOBILIARIA" | "GESTOR" | "TECNICO";
export type TipoLote = "Lote Venta" | "Espacio Comun";
export type EstadoReserva = "ACTIVA" | "CANCELADA" | "ACEPTADA" | "RECHAZADA" | "CONTRAOFERTA" | 'EXPIRADA';
export type EstadoInmbobiliaria = "OPERATIVO" | "ELIMINADO"; // Typo preserved as in original if wanted, or fixed? user mentioned update files. Keeping typo name but changing values.
export type EstadoPersona = "OPERATIVO" | "ELIMINADO";
export type DateTime = string; // Formato ISO 8601: "YYYY-MM-DDTHH:MM:SSZ"

// --- INTERFACES DE DATOS (ESTRUCTURAS) ---
// Estas interfaces son los "planos" que definen cómo deben ser los objetos en la aplicación.

export interface Usuario {
    idUsuario: number;
    username: string;
    password: string;
    rol: Rol;
    email: string;
}

export interface Persona {
    idPersona: number;
    nombre: string;
    apellido: string;
    identificador: Identificador;
    telefono?: number;
    email?: string;
    razonSocial?: string;
    identificadorTipo?: string;
    identificadorValor?: string;
    contacto?: string;
    estado?: string;
    inmobiliariaId?: number | null;
    inmobiliaria?: { id: number; nombre: string } | null;
    _count?: { lotesPropios?: number; lotesAlquilados?: number; Reserva?: number; Venta?: number };

    // Extensiones para módulo Propietarios/Inquilinos y Grupo Familiar
    esPropietario?: boolean;
    esInquilino?: boolean;
    esJefeDeFamilia?: boolean;
    jefeDeFamilia?: { idPersona: number; nombre: string; apellido: string; cuil?: string } | null;
    miembrosFamilia?: Array<{ idPersona: number; nombre: string; apellido: string; cuil?: string }>;
    
    // Arrays mínimos para mini detalles
    lotesPropios?: Array<{ id: number; numero: number | null; mapId: string | null; fraccionNumero: number }>;
    lotesAlquilados?: Array<{ id: number; numero: number | null; mapId: string | null; fraccionNumero: number; estado: string }>;
    reservas?: Array<{ id: number; numero: string; createdAt: Date; loteId: number }>;
    ventas?: Array<{ id: number; numero: string }>;
}


export interface Lote {
    idLote: number;
    fraccion: number;
    readonly numPartido: 62;
    frente?: number;
    fondo?: number;
    superficie?: number; 
    estado: EstadoLote;
    subestado: SubestadoLote;
    descripcion?: string;
}



export interface LoteVenta extends Lote {
    deuda?: boolean;
    precio: number;
    propietario: Persona;
    ubicacion: Ubicacion;
}

export interface Ubicacion {
    id: number;
    calle: Calle;
    numero: number;
}

export interface Fraccion {
    idFraccion: number;
    numero: number;
    lotes: Lote[];
}


export interface Venta {
    id: number;
    loteId: number;
    fechaVenta: string;
    monto: number;
    estado: EstadoVenta;
    estadoCobro?: 'PENDIENTE' | 'EN_CURSO' | 'PAGO_COMPLETO';
    plazoEscritura?: DateTime;
    fechaEscrituraReal?: DateTime;
    fechaCancelacion?: DateTime;
    motivoCancelacion?: string;
    tipoPago: string;
    compradorId: number;
    inmobiliariaId?: number;
    createdAt?: DateTime;
    updateAt?: DateTime;
}

export interface EspacioComun extends Lote {
    capacidad: number;
    nombre: string;
}

export interface CambioEstado {
    idCambio: number;
    lote: Lote;
    estadoAnterior: EstadoLote;
    estadoNuevo: EstadoLote;
    fechaCambio: string;
}

export interface Inmobiliaria {
    idInmobiliaria: number;
    nombre: string;
    razonSocial?: string;
    comxventa?: number;
    contacto?: string;
    maxPrioridadesActivas?: number | null;
    reservas?: Reserva[];
    venta?: Venta;
    user?: Usuario;
    estado: EstadoInmbobiliaria;
    fechaBaja?: string;
}

export interface OfertaReserva {
    id: number;
    reservaId: number;
    monto: number;
    motivo?: string;
    nombreEfector: string;
    efectorId?: number | null;
    ownerType: OwnerPrioridad;
    createdAt: string;
}

export interface Reserva {
    idReserva: number;
    lote: LoteVenta;
    estado: EstadoReserva;
    cliente: Persona;
    fechaReserva: string; 
    numero: string;
    seña?: number;
    ofertaActual?: number;
    ofertas?: OfertaReserva[];
    inmobiliaria?: Inmobiliaria;
    fechaFinReserva: string;
}


// --- INTERFACES PARA PETICIONES Y RESPUESTAS DE LA API ---
// Definen la forma de los datos que se envían y reciben en cada endpoint.

// Lotes
//----------------------------------------//
export interface GetLotesResponse {
    lotes: LoteVenta[];
    total: number;
}

export interface GetLoteResponse {
    lote: LoteVenta | null;
    message?: string;
}

export interface PostLoteRequest {
    id: number;
    fraccion: Fraccion;
    frente: number;
    fondo: number;
    tipo: TipoLote;
    estado: EstadoLoteOpc;
    subestado: SubestadoLote;
    propietario: Persona;
    precio: number;
    ubicacion?: Ubicacion;
    superficie?: number;
    descripcion?: string;
    capacidad?: number;
    nombre?: string;
    alquiler?: boolean;
    deuda?: boolean
    nombreEspacioComun?: string;
}

export interface PostLoteResponse {
    lote: LoteVenta | null;
    message: string;
}

export interface PutLoteRequest {
    id: number;
    fraccion?: Fraccion;
    frente?: number;
    fondo?: number;
    tipo?: TipoLote;
    estado?: EstadoLote;
    subestado?: SubestadoLote;
    propietario?: Persona;
    precio?: number;
    ubicacion?: Ubicacion;
    superficie?: number;
    descripcion?: string;
    capacidad?: number;
    nombre?: string;
}

export interface PutLoteResponse {
    message: string;
}

export interface DeleteLoteRequest {
    idLote: number;
}

export interface DeleteLoteResponse {
    message: string;
}
//----------------------------------------//

// Ventas
//----------------------------------------//
export interface GetVentasResponse {
    ventas: Venta[];
    total: number;
}

export interface VentaCompradorInput {
    personaId: number;
}

export interface PostVentaRequest {
    id: number;
    loteId: number;
    lote: Lote;
    fechaVenta: DateTime;
    monto: number;
    estado?: EstadoVenta;
    estadoCobro?: 'PENDIENTE' | 'EN_CURSO' | 'PAGO_COMPLETO';
    plazoEscritura?: DateTime;
    fechaEscrituraReal?: DateTime;
    fechaCancelacion?: DateTime;
    motivoCancelacion?: string;
    tipoPago: string;
    /** @deprecated Usar compradores[]. Se mantiene por compatibilidad legacy. */
    compradorId?: number;
    /** Etapa 4: lista de compradores. Al menos uno requerido (junto con compradorId legacy). */
    compradores?: VentaCompradorInput[];
    inmobiliariaId?: number;
    reservaId?: number;
    createdAt?: DateTime;
    updateAt?: DateTime;
    numero: string;
} 

export interface PostVentaResponse {
    venta: Venta | null;
    message: string;
}

export interface GetVentaRequest {
    idVenta: number;
}

export interface GetVentaResponse {
    venta: Venta | null;
    message?: string;
}

export interface PutVentaRequest {
    id: number;
    loteId?: number;
    monto?: number;
    /** @deprecated Usar compradores[]. Se mantiene por compatibilidad legacy. */
    compradorId?: number;
    /** Etapa 4: si viene, reemplaza la lista completa de compradores. */
    compradores?: VentaCompradorInput[];
    fechaVenta?: DateTime
    estado?: EstadoVenta;
    estadoCobro?: 'PENDIENTE' | 'EN_CURSO' | 'PAGO_COMPLETO';
    plazoEscritura?: DateTime;
    fechaEscrituraReal?: DateTime;
    fechaCancelacion?: DateTime;
    motivoCancelacion?: string;
    tipoPago?: string;
    inmobiliariaId?: number;
    updateAt: DateTime;
}

export interface PutVentaResponse {
    message: string;
}

export interface DeleteVentaRequest {
    idVenta: number;
}

export interface DeleteVentaResponse {
    message: string;
}
//----------------------------------------//


// Reservas
//------------------------------------------------//
export interface GetReservasResponse {
    reservas: Reserva[];
    total: number;
}

// Request para crear una nueva reserva
export interface PostReservaRequest {
  idLote: number;           // ID del lote a reservar
  idCliente: number;        // ID del cliente que hace la reserva
  fechaReserva: string;     // Fecha de la reserva (ISO string)
  seña?: number;            // Monto de la seña (opcional)
  numero: string;        // Número de reserva
  idInmobiliaria?: number;  // ID de la inmobiliaria (opcional)
  fechaFinReserva: string; // Fecha de fin de la reserva (ISO string)
}

// Response para crear una nueva reserva
export interface PostReservaResponse {
  reserva: Reserva | null;  // La reserva creada o null si falla
  message: string;          // Mensaje de confirmacion o error
}

// Request para obtener una reserva por ID
export interface GetReservaRequest {
    idReserva: number;
}

// Response para obtener una reserva por ID
export interface GetReservaResponse {
  reserva: Reserva | null;  // La reserva encontrada o null
  message?: string;         // Mensaje opcional
}

// Request para actualizar una reserva
export interface PutReservaRequest {
  idReserva: number;        // ID de la reserva a actualizar
  estado?: EstadoReserva;   // Nuevo estado de la reserva (opcional)
  idLote?: number;          // ID de lote (opcional)
  idCliente?: number;       // ID de cliente (opcional)
  fechaReserva?: string;    // Fecha de reserva (opcional)
  seña?: number;            // Seña (opcional)
  idInmobiliaria?: number;  // ID inmobiliaria (opcional)
  fechaFinReserva?: string; // Fecha de fin de la reserva (ISO string) (opcional)
  numero?: string;        // Número de reserva (opcional)
}

// Response para actualizar una reserva
export interface PutReservaResponse {
    message: string;          // Mensaje de confirmacion o error
}

// Request para eliminar una reserva
export interface DeleteReservaRequest {
    idReserva: number;
}

// Response para eliminar una reserva
export interface DeleteReservaResponse {
    message: string;
}
//------------------------------------------------//

//Inmobiliarias
//-----------------------------------------//
export interface GetInmobiliariasResponse {
    inmobiliarias: Inmobiliaria[];
    total: number;
}

//Request para crear una inmobiliaria
export interface PostInmobiliariaRequest{ 
  nombre: string; //Nombre de la inmobiliaria
  razonSocial: string; //Razon social (opcional)
  comxventa?: number; //Comision por venta (opcional)
  contacto?: string; //Telefono de contacto (opcional)
  maxPrioridadesActivas?: number | null; //Limite de prioridades activas (opcional)
  reservas?: Reserva[]; //Reservas asociadas (opcional)
  ventaId?: number; //Ventas asociadas (opcional)
  userId?: number; //Usuario asociado (opcional)
  estado?: EstadoInmbobiliaria; //Estado de la inmobiliaria (opcional; default OPERATIVO en creación)
}

// Response para crear una nueva inmobiliaria
export interface PostInmobiliariaResponse {
  inmobiliaria: Inmobiliaria | null;  // La inmobiliaria creada o null si falla
  message: string;          // Mensaje de confirmacion o error
}

// Request para obtener una inmobiliaria por ID
export interface GetInmobiliariaRequest {
    idInmobiliaria: number;
}

// Response para obtener una inmobiliaria por ID
export interface GetInmobiliariaResponse {
  inmobiliaria: Inmobiliaria | null;  // La reserva encontrada o null
  message?: string;         // Mensaje opcional
}

export interface GetInmobiliariasResponse {
    inmobiliarias: Inmobiliaria[];
    total: number;
}

// Request para actualizar una inmobiliaria
export interface PutInmobiliariaRequest {
  nombre?: string; //Nombre de la inmobiliaria
  contacto?: string; //Telefono de contacto (opcional)
  razonSocial?: string; //Razon social (opcional)
  comxventa?: number; //Comision por venta (opcional) 
  maxPrioridadesActivas?: number | null; //Limite de prioridades activas (opcional)
  userId?: number; //Usuario asociado (opcional)
  reservas?: Reserva[]; //Reservas asociadas (opcional)
  ventaId?: number; //Ventas asociadas (opcional)
  estado?: EstadoInmbobiliaria; //Estado de la inmobiliaria (opcional)
  fechaBaja?: string; //Fecha de baja (opcional)
}

// Response para actualizar una inmobiliaria
export interface PutInmobiliariaResponse {
  inmobiliaria: Inmobiliaria;  // La inmobiliaria actualizada
  message: string;          // Mensaje de confirmacion o error
}

// Request para eliminar una inmobiliaria
export interface DeleteInmobiliariaRequest {
    idInmobiliaria: number;
}

// Response para eliminar una inmobiliaria
export interface DeleteInmobiliariaResponse {
    message: string;
}
//-----------------------------------------------------//


//Usuarios
//----------------------------------------//

export interface UserData {
    username: string;
    email: string;
    role: Rol;
}

export interface GetUsuariosResponse {
    usuarios: Usuario[];
    total: number;
}

export interface PostUsuarioRequest {
    username: string;
    password: string;
    rol: Rol;
    email: string;
}

export interface PostUsuarioResponse {
    usuario: UserData | null;
    message: string;
}

export interface GetUsuarioRequest {
    idUsuario: number;
}

export interface GetUsuarioResponse {
    usuario: Usuario | null;
    message?: string;
}

export interface PutUsuarioRequest {
    username?: string;
    password?: string;
    rol?: Rol;
    email?: string;
}

export interface PutUsuarioResponse {
    user: UserData;
    message: string;
}

export interface DeleteUsuarioRequest {
    idUsuario: number;
}

export interface DeleteUsuarioResponse {
    message: string;
}
//----------------------------------------//

//Personas
//----------------------------------------//
export interface GetPersonasResponse {
    personas: Persona[];
    total: number;
}   
export interface PostPersonaRequest {
    nombre: string;
    apellido: string;
    identificador: Identificador;
    telefono?: number;
    email?: string;
}
export interface PostPersonaResponse {
    persona: Persona | null;
    message: string;
}
export interface GetPersonaRequest {
    idPersona: number;
}
export interface GetPersonaResponse {
    persona: Persona | null;
    message?: string;
}   
export interface PutPersonaRequest {
    nombre?: string;
    apellido?: string;
    identificador?: Identificador;
    telefono?: number;
    email?: string;
}
export interface PutPersonaResponse {
    persona: Persona;
    message: string;
}
export interface DeletePersonaRequest {
    idPersona: number;
}   
export interface DeletePersonaResponse {
    message: string;
}   
//----------------------------------------//
// FRACCIONES

export interface GetFraccionesResponse {
    fracciones: Fraccion[];
    total: number;
}
export interface PostFraccionRequest {
    numero: number;
}
export interface PostFraccionResponse {
    fraccion: Fraccion | null;
    message: string;
}   
export interface GetFraccionRequest {
    idFraccion: number;
}
export interface GetFraccionResponse {
    fraccion: Fraccion | null;
    message?: string;
}
export interface PutFraccionRequest {
    numero?: number;
}
export interface PutFraccionResponse {
    message: string;
}
export interface DeleteFraccionRequest {
    idFraccion: number;
}
export interface DeleteFraccionResponse {   
    message: string;
}
//----------------------------------------//
// UBICACIONES

export interface GetUbicacionesResponse {
    ubicaciones: Ubicacion[];
    total: number;
}
export interface PostUbicacionRequest {
    calle: Calle;
    numero: number;
}
export interface PostUbicacionResponse {
    ubicacion: Ubicacion | null;
    message: string;
}

export interface GetUbicacionRequest {
    idUbicacion: number;
}
export interface GetUbicacionResponse {
    ubicacion: Ubicacion | null;
    message?: string;
}
export interface PutUbicacionRequest {
    calle?: Calle;
    numero?: number;
}
export interface PutUbicacionResponse {
    message: string;
}
export interface DeleteUbicacionRequest {
    idUbicacion: number;
}
export interface DeleteUbicacionResponse {
    message: string;
}
//----------------------------------------//
