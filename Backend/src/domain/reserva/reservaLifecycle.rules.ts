import { EstadoReserva } from '../../generated/prisma';

const ALLOWED_TRANSITIONS: Record<EstadoReserva, readonly EstadoReserva[]> = {
  [EstadoReserva.CANCELADA]: [EstadoReserva.ACTIVA],
  [EstadoReserva.RECHAZADA]: [EstadoReserva.ACTIVA],
  [EstadoReserva.EXPIRADA]: [EstadoReserva.ACTIVA],
  [EstadoReserva.ACTIVA]: [EstadoReserva.CANCELADA, EstadoReserva.EXPIRADA],
  [EstadoReserva.ACEPTADA]: [
    EstadoReserva.RECHAZADA,
    EstadoReserva.CANCELADA,
    EstadoReserva.EXPIRADA,
  ],
  [EstadoReserva.CONTRAOFERTA]: [EstadoReserva.EXPIRADA],
};

export function getAllowedReservaTransitions(from: EstadoReserva): EstadoReserva[] {
  return [...(ALLOWED_TRANSITIONS[from] ?? [])];
}

export function canTransitionReserva(from: EstadoReserva, to: EstadoReserva): boolean {
  return getAllowedReservaTransitions(from).includes(to);
}

export type ReservaOfertaAction = 'ACEPTAR' | 'RECHAZAR' | 'CONTRAOFERTAR';

const OFERTA_ACTION_TARGETS: Record<
  EstadoReserva,
  Partial<Record<ReservaOfertaAction, EstadoReserva>>
> = {
  [EstadoReserva.ACTIVA]: {
    ACEPTAR: EstadoReserva.ACEPTADA,
    RECHAZAR: EstadoReserva.RECHAZADA,
    CONTRAOFERTAR: EstadoReserva.CONTRAOFERTA,
  },
  [EstadoReserva.CONTRAOFERTA]: {
    ACEPTAR: EstadoReserva.ACEPTADA,
    RECHAZAR: EstadoReserva.RECHAZADA,
    CONTRAOFERTAR: EstadoReserva.CONTRAOFERTA,
  },
  [EstadoReserva.ACEPTADA]: {
    RECHAZAR: EstadoReserva.RECHAZADA,
  },
  [EstadoReserva.CANCELADA]: {},
  [EstadoReserva.RECHAZADA]: {},
  [EstadoReserva.EXPIRADA]: {},
};

export function isValidReservaOfertaAction(value: string): value is ReservaOfertaAction {
  return value === 'ACEPTAR' || value === 'RECHAZAR' || value === 'CONTRAOFERTAR';
}

export function getReservaStateForOfertaAction(
  estadoActual: EstadoReserva,
  action: ReservaOfertaAction,
): EstadoReserva | null {
  const targets = OFERTA_ACTION_TARGETS[estadoActual];
  return targets?.[action] ?? null;
}
