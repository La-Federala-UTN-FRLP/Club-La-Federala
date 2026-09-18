// Reemplazo de plan vigente con pagos (I6): lógica aislada de pago.service.ts
import type { Prisma } from '@prisma/client';
import type { Decimal } from '../generated/prisma/runtime/library';
import { z } from 'zod';
import prisma from '../config/prisma';
import { calcularMontoFinanciado, determinarEstadoCobro, estaCuotaVencida } from '../domain/pagoState/pagoState.rules';
import { createPlanPagoSchema, reemplazarPlanPagoSchema } from '../validations/pago.validation';
import { PLAN_INCLUDE, toNum, roundMoney2, type PagoUserContext } from './pago.shared';

export type ReemplazarPlanPayload = z.infer<typeof reemplazarPlanPagoSchema>;

async function calcularSaldoPendienteRealPlan(
  planPagoId: number,
  tx: Prisma.TransactionClient
): Promise<number> {
  const [aggCuotas, aggPagos] = await Promise.all([
    tx.cuotaPlanPago.aggregate({
      where: { planPagoId },
      _sum: { montoTotalExigible: true },
    }),
    tx.pagoRegistrado.aggregate({
      where: { planPagoId },
      _sum: { monto: true },
    }),
  ]);
  const sumExigible = toNum(aggCuotas._sum.montoTotalExigible ?? 0);
  const sumPagos = toNum(aggPagos._sum.monto ?? 0);
  return roundMoney2(sumExigible - sumPagos);
}

function normalizarCuotasPlanResponse(cuotas: any[], ahora: Date) {
  return cuotas.map((c) => {
    const saldo = toNum(c.saldoPendiente);
    return {
      ...c,
      montoOriginal: toNum(c.montoOriginal),
      montoRecargoManual: toNum(c.montoRecargoManual),
      montoTotalExigible: toNum(c.montoTotalExigible),
      montoPagado: toNum(c.montoPagado),
      saldoPendiente: saldo,
      estaVencida: estaCuotaVencida(c.fechaVencimiento, saldo, ahora),
    };
  });
}

/**
 * Reemplaza el plan vigente cuando ya hay pagos: cierra el plan actual (REEMPLAZADO), crea versión+1 con el mismo cronograma
 * validado contra el saldo pendiente real (Σ exigible − Σ pagos del plan).
 */
export async function reemplazarPlanPagoVigente(
  ventaId: number,
  payload: ReemplazarPlanPayload,
  user?: PagoUserContext
) {
  const venta = await prisma.venta.findUnique({
    where: { id: ventaId },
    select: { id: true, estadoOperativo: true },
  });

  if (!venta) {
    const error = new Error('Venta no encontrada') as Error & { statusCode?: number };
    error.statusCode = 404;
    throw error;
  }

  if (venta.estadoOperativo === 'ELIMINADO') {
    const error = new Error('La venta está eliminada') as Error & { statusCode?: number };
    error.statusCode = 409;
    throw error;
  }

  const planVigente = await prisma.planPago.findFirst({
    where: { ventaId, esVigente: true },
    select: {
      id: true,
      version: true,
      moneda: true,
      nombre: true,
      estadoPlan: true,
    },
  });

  if (!planVigente) {
    const error = new Error('La venta no tiene un plan vigente para reemplazar') as Error & {
      statusCode?: number;
    };
    error.statusCode = 409;
    throw error;
  }

  const countPagos = await prisma.pagoRegistrado.count({
    where: { planPagoId: planVigente.id },
  });

  if (countPagos === 0) {
    const error = new Error(
      'El reemplazo de plan solo aplica cuando ya existen pagos registrados sobre el plan vigente; hasta entonces puede editarse el plan directamente'
    ) as Error & { statusCode?: number };
    error.statusCode = 409;
    throw error;
  }

  if (payload.moneda != null && String(payload.moneda) !== planVigente.moneda) {
    const error = new Error('No se permite cambiar la moneda al reemplazar el plan') as Error & {
      statusCode?: number;
    };
    error.statusCode = 409;
    throw error;
  }

  const saldoPendienteReal = await calcularSaldoPendienteRealPlan(planVigente.id, prisma);
  if (saldoPendienteReal <= 0) {
    const error = new Error('El plan no puede reemplazarse porque no existe saldo pendiente') as Error & {
      statusCode?: number;
    };
    error.statusCode = 409;
    throw error;
  }

  const mergedForZod = {
    ...payload,
    moneda: planVigente.moneda,
    montoTotalPlanificado: saldoPendienteReal,
  };

  const zodResult = createPlanPagoSchema.safeParse(mergedForZod);
  if (!zodResult.success) {
    const first = zodResult.error.issues[0];
    const error = new Error(
      first?.message ?? 'El nuevo cronograma debe coincidir con el saldo pendiente real'
    ) as Error & { statusCode?: number };
    error.statusCode = 409;
    throw error;
  }

  const createdBy = user?.email ?? null;
  const planAnteriorId = planVigente.id;
  const versionAnterior = planVigente.version;
  const versionNueva = planVigente.version + 1;
  const ahora = new Date();

  const planAnteriorResumen = {
    id: planVigente.id,
    version: versionAnterior,
    nombre: planVigente.nombre,
    moneda: planVigente.moneda,
    estadoPlan: 'REEMPLAZADO' as const,
  };

  const txResult = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const saldoTxn = await calcularSaldoPendienteRealPlan(planAnteriorId, tx);
    if (saldoTxn <= 0) {
      const err = new Error('El plan no puede reemplazarse porque no existe saldo pendiente') as Error & {
        statusCode?: number;
      };
      err.statusCode = 409;
      throw err;
    }

    const zodTxn = createPlanPagoSchema.safeParse({
      ...payload,
      moneda: planVigente.moneda,
      montoTotalPlanificado: saldoTxn,
    });
    if (!zodTxn.success) {
      const first = zodTxn.error.issues[0];
      const err = new Error(
        first?.message ?? 'El nuevo cronograma debe coincidir con el saldo pendiente real'
      ) as Error & { statusCode?: number };
      err.statusCode = 409;
      throw err;
    }
    const v = zodTxn.data;

    await tx.planPago.update({
      where: { id: planAnteriorId },
      data: {
        estadoPlan: 'REEMPLAZADO',
        esVigente: false,
        updateAt: ahora,
      },
    });

    const nuevo = await tx.planPago.create({
      data: {
        ventaId,
        nombre: v.nombre,
        estadoPlan: 'VIGENTE',
        tipoFinanciacion: v.tipoFinanciacion as any,
        moneda: v.moneda as any,
        cantidadCuotas: v.cantidadCuotas,
        montoTotalPlanificado: v.montoTotalPlanificado,
        montoFinanciado: calcularMontoFinanciado(v.montoTotalPlanificado, v.montoAnticipo ?? 0),
        montoAnticipo: v.montoAnticipo ?? 0,
        fechaInicio: new Date(v.fechaInicio),
        version: versionNueva,
        esVigente: true,
        descripcion: v.descripcion ?? null,
        observaciones: v.observaciones ?? null,
        createdBy,
      },
    });

    const cuotasData = v.cuotas.map((c) => ({
      planPagoId: nuevo.id,
      numeroCuota: c.numeroCuota,
      tipoCuota: c.tipoCuota as any,
      fechaVencimiento: new Date(c.fechaVencimiento),
      montoOriginal: c.montoOriginal,
      montoRecargoManual: 0,
      montoTotalExigible: c.montoOriginal,
      montoPagado: 0,
      saldoPendiente: c.montoOriginal,
      estadoCuota: 'PENDIENTE' as const,
      descripcion: c.descripcion ?? null,
    }));

    await tx.cuotaPlanPago.createMany({ data: cuotasData });

    const cuotasNuevas = await tx.cuotaPlanPago.findMany({
      where: { planPagoId: nuevo.id },
      orderBy: { numeroCuota: 'asc' },
    });

    const aggPagosVenta = await tx.pagoRegistrado.aggregate({
      where: { ventaId },
      _sum: { monto: true },
    });
    const montoTotalPagadoVenta = toNum(aggPagosVenta._sum.monto ?? 0);
    const saldoPendienteNuevoPlan = cuotasNuevas.reduce(
      (acc: number, c: { saldoPendiente: Decimal | number }) => acc + toNum(c.saldoPendiente),
      0
    );
    const estadoCobro = determinarEstadoCobro(montoTotalPagadoVenta, saldoPendienteNuevoPlan);

    await tx.venta.update({
      where: { id: ventaId },
      data: { estadoCobro, updateAt: ahora },
    });

    const planNuevo = await tx.planPago.findUnique({
      where: { id: nuevo.id },
      include: PLAN_INCLUDE,
    });

    return { planNuevo, cuotasNuevas, saldoUsado: saldoTxn };
  });

  const { planNuevo, cuotasNuevas, saldoUsado } = txResult;
  if (!planNuevo) {
    const error = new Error('No se pudo recuperar el plan creado') as Error & { statusCode?: number };
    error.statusCode = 500;
    throw error;
  }

  const cuotasNorm = normalizarCuotasPlanResponse(cuotasNuevas, ahora);

  return {
    planAnterior: planAnteriorResumen,
    planNuevo: {
      id: planNuevo.id,
      nombre: planNuevo.nombre,
      estadoPlan: planNuevo.estadoPlan,
      tipoFinanciacion: planNuevo.tipoFinanciacion,
      moneda: planNuevo.moneda,
      cantidadCuotas: planNuevo.cantidadCuotas,
      montoTotalPlanificado: toNum(planNuevo.montoTotalPlanificado),
      montoFinanciado: toNum(planNuevo.montoFinanciado),
      montoAnticipo: toNum(planNuevo.montoAnticipo),
      fechaInicio: planNuevo.fechaInicio,
      version: planNuevo.version,
      descripcion: planNuevo.descripcion,
      observaciones: planNuevo.observaciones,
      createdAt: planNuevo.createdAt,
      createdBy: planNuevo.createdBy,
    },
    cuotas: cuotasNorm,
    saldoPendienteRealUsado: saldoUsado,
    versionAnterior,
    versionNueva,
    monedaAplicada: planVigente.moneda,
  };
}
