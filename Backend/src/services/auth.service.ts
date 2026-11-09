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

// Hash bcrypt constante (cost 10, el mismo de usuario.service y los seeds) de un valor aleatorio
// descartado: no corresponde a ningún usuario ni password. Con email inexistente el login compara
// contra este hash, así ambos caminos de "credenciales inválidas" hacen el mismo trabajo bcrypt.
export const DUMMY_PASSWORD_HASH = '$2b$10$lMbtwk.xhSuMObcuJmsfSOnyZVff73YLQy2uN78UR09Crby/kqbBm';

export async function login(data: LoginRequest): Promise<LoginResponse> {
  // 1. Buscar usuario con su inmobiliaria incluida (los emails se guardan normalizados)
  const user = await prisma.user.findUnique({
    where: { email: data.email.trim().toLowerCase() },
    include: { inmobiliaria: true }
  });

  // 2. Verificar password (siempre una comparación bcrypt, exista o no el usuario)
  const validPassword = await bcrypt.compare(data.password, user?.password ?? DUMMY_PASSWORD_HASH);
  if (!user || !validPassword) {
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

  // Incluir inmobiliariaId en el JWT si el rol es INMOBILIARIA.
  // Los claims son informativos: authenticate relee rol y tenant vigentes desde la DB.
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
