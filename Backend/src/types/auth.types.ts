import { Role } from "../generated/prisma";

export interface LoginRequest {
    email: string;
    password: string;
}   

export interface AuthUser {
    id: number;
    email: string;
    username: string;
    role: Role;
    createdAt: Date;
    inmobiliariaId: number | null;
    inmobiliariaNombre: string | null;
}

export interface LoginResponse {
    user: AuthUser;
    token: string;
}