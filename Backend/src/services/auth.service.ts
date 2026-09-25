import prisma from '../config/prisma';
import bcrypt from 'bcrypt';
import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import { LoginRequest, LoginResponse } from '../types/auth.types';
import { Role } from '../generated/prisma';
import { getWebEnv } from '../config/env';

type JWTPayload = { 
    sub: number;
    email: string; 
    role: Role;
    inmobiliariaId?: number;
};

export async function login(data: LoginRequest): Promise<LoginResponse> {
  // 1. Buscar usuario con su inmobiliaria incluida
  const user = await prisma.user.findUnique({
    where: { email: data.email },
    include: { inmobiliaria: true }
  });

  if (!user) {
    const error = new Error('Credenciales inválidas') as any;
    error.statusCode = 401;
    throw error;
  }

  // 2. Verificar password
  const validPassword = await bcrypt.compare(data.password, user.password);
  if (!validPassword) {
    const error = new Error('Credenciales inválidas') as any;
    error.statusCode = 401;
    throw error;
  }

  // 3. Generar JWT
  const { jwtSecret, jwtExpiresIn } = getWebEnv();
  const JWT_SECRET = jwtSecret as Secret;
  if (!JWT_SECRET) {
    throw new Error('Falta JWT_SECRET en .env');
  }
  const EXPIRES_IN = jwtExpiresIn;

  // Obtener inmobiliariaId desde la relación incluida
  const inmobiliariaId = user.inmobiliaria?.id ?? null;

  // Incluir inmobiliariaId en el JWT si el rol es INMOBILIARIA
  // Esto evita consultar la BD en cada request en el middleware
  const payload: JWTPayload = {
    sub: user.id,
    email: user.email,
    role: user.role as Role,
    ...(inmobiliariaId != null && { inmobiliariaId }),
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: EXPIRES_IN } as SignOptions);
  
  // 4. Retornar sin password, pero incluyendo inmobiliariaId e inmobiliariaNombre
  const { password: _, inmobiliaria, ...userWithoutPassword } = user;
  return {
    user: {
      ...userWithoutPassword,
      inmobiliariaId: inmobiliaria?.id ?? null,
      inmobiliariaNombre: inmobiliaria?.nombre ?? null,
    },
    token,
  };
}
