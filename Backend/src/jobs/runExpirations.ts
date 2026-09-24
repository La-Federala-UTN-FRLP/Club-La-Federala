// src/jobs/runExpirations.ts
// Agregador de jobs de expiración (reutilizable para futuras expiraciones)
import prisma from '../config/prisma';
import { expirePromotions } from './expirePromotions';
import { expireReservas } from './expireReservas';

export type ExpirationsCliPrisma = {
  $disconnect: () => Promise<void>;
};

export type ExpirationsCliOptions = {
  run?: () => Promise<void>;
  prisma?: ExpirationsCliPrisma;
};

/**
 * Ejecuta todos los jobs de expiración.
 *
 * @returns {Promise<void>}
 */
export async function runExpirations(): Promise<void> {
  console.log('[runExpirations] Iniciando ejecución de jobs de expiración');

  try {
    const promocionesExpiradas = await expirePromotions();
    console.log(`[runExpirations] Promociones expiradas: ${promocionesExpiradas}`);

    const reservasExpiradas = await expireReservas();
    console.log(`[runExpirations] Reservas expiradas: ${reservasExpiradas}`);

    console.log('[runExpirations] Ejecución de jobs de expiración finalizada');
  } catch (error) {
    console.error('[runExpirations] Error al ejecutar jobs de expiración:', error);
    throw error;
  }
}

/**
 * Runner one-shot para CLI (`node dist/jobs/runExpirations.js`).
 * Ejecuta una vez, cierra Prisma y deja el exit code para que el proceso termine solo.
 */
export async function runExpirationsCli(options?: ExpirationsCliOptions): Promise<void> {
  const run = options?.run ?? runExpirations;
  const client = options?.prisma ?? prisma;

  try {
    await run();
    process.exitCode = 0;
    console.log('[runExpirations] Script ejecutado exitosamente');
  } catch (error) {
    console.error('[runExpirations] Error fatal:', error);
    process.exitCode = 1;
  } finally {
    try {
      await client.$disconnect();
    } catch (err) {
      console.error('[runExpirations] Error al desconectar Prisma.', err);
      process.exitCode = 1;
    }
  }
}

if (require.main === module) {
  void runExpirationsCli();
}
