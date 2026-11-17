// src/jobs/expirePromotions.ts
// Job para expirar promociones automáticamente
import prisma from '../config/prisma';
import { EstadoLote } from '../generated/prisma';
import { safeErrorForLog } from '../utils/safeErrorLog';

/**
 * Expira promociones vencidas
 * Busca promociones activas cuya fecha de fin haya pasado y las desactiva,
 * revirtiendo el estado y precio del lote asociado.
 * 
 * @returns {Promise<number>} Cantidad de promociones expiradas
 */
export async function expirePromotions(): Promise<number> {
  const now = new Date();
  
  console.log(`[expirePromotions] Iniciando expiración de promociones - ${now.toISOString()}`);
  
  // Buscar promociones vencidas
  const promocionesVencidas = await prisma.promocion.findMany({
    where: {
      activa: true,
      fin: {
        not: null,
        lte: now,
      },
    },
    include: {
      lote: {
        select: {
          id: true,
          estado: true,
        },
      },
    },
  });

  console.log(`[expirePromotions] Encontradas ${promocionesVencidas.length} promociones vencidas`);

  if (promocionesVencidas.length === 0) {
    console.log(`[expirePromotions] No hay promociones vencidas. Finalizando.`);
    return 0;
  }

  let expiradas = 0;

  // Procesar cada promoción vencida en transacción
  for (const promocion of promocionesVencidas) {
    try {
      await prisma.$transaction(async (tx) => {
        // Revertir lote: estado y precio anteriores
        await tx.lote.update({
          where: { id: promocion.loteId },
          data: {
            estado: promocion.estadoAnterior,
            precio: promocion.precioAnterior,
          },
        });

        // Marcar promoción como inactiva
        await tx.promocion.update({
          where: { id: promocion.id },
          data: {
            activa: false,
          },
        });

        expiradas++;
        console.log(`[expirePromotions] Promoción ${promocion.id} expirada para lote ${promocion.loteId}`);
      });
    } catch (error) {
      console.error(`[expirePromotions] Error al expirar promoción ${promocion.id}:`, safeErrorForLog(error));
      // Continuar con las siguientes aunque una falle
    }
  }

  console.log(`[expirePromotions] Finalizando. ${expiradas} promociones expiradas exitosamente`);
  return expiradas;
}








