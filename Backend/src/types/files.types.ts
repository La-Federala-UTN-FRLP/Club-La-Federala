export type TipoFile =  'BOLETO' | 'ESCRITURA' | 'PLANO' | 'IMAGEN' | 'OTRO';
export type EstadoOperativoFile = 'OPERATIVO' | 'ELIMINADO';
export type EstadoAprobacion = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
export type TargetAprobacion = 'COMISION' | 'MUNICIPIO';

export interface FileMetadata {
    id: number;
    filename: string;
    url: string;
    tipo: TipoFile;
    uploadedAt: Date;
    updatedAt: Date;
    uploadedBy?: string | null;
    idLoteAsociado: number;
    ventaId?: number | null;
    ventaNumero?: string | null;
    estadoOperativo: EstadoOperativoFile;
    fechaBaja?: Date | null;
    deletedBy?: string | null;
    // Aprobaciones PLANO (Etapa 5.5)
    estadoAprobacionComision?: EstadoAprobacion | null;
    fechaAprobacionComision?: Date | null;
    aprobadoComisionBy?: string | null;
    observacionAprobacionComision?: string | null;
    estadoAprobacionMunicipio?: EstadoAprobacion | null;
    fechaAprobacionMunicipio?: Date | null;
    aprobadoMunicipioBy?: string | null;
    observacionAprobacionMunicipio?: string | null;
}

export interface NewFileMetadata {
    filename: string;
    url: string;
    tipo: TipoFile;
    uploadedBy?: string | null;
    idLoteAsociado: number;
    ventaId?: number | null;
}

export interface DeleteFileMetadata {
    id: number;
}

