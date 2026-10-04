import {
  InsufficientNoticeError,
  InvalidAssemblyError,
  InvalidAssemblyTransitionError,
} from './errors';
import type { Majority } from './voting-result';

export const ASSEMBLY_TYPES = ['ordinaria', 'extraordinaria'] as const;
export type AssemblyType = (typeof ASSEMBLY_TYPES)[number];
export type AssemblyStatus = 'borrador' | 'convocada' | 'celebrada' | 'cancelada';

export const PLACE_MAX_LENGTH = 200;
export const POINT_TITLE_MAX_LENGTH = 200;
export const POINT_DESCRIPTION_MAX_LENGTH = 5000;
export const DEFAULT_MIN_NOTICE_DAYS = 15;

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export interface PointInput {
  /** Kept when editing, so its attachments and voting stay with it. */
  id?: string;
  title: string;
  description: string;
  votable: boolean;
  /** Required when votable, absent otherwise (HU-ASA-02). */
  majority: Majority | null;
}

export interface PointState extends PointInput {
  /** 1-based position in the agenda. */
  position: number;
}

export interface AssemblyState {
  readonly status: AssemblyStatus;
  readonly type: AssemblyType;
  readonly firstCallAt: Date;
  readonly secondCallAt: Date | null;
  readonly place: string;
  readonly points: readonly PointState[];
}

export interface AssemblyInput {
  type: AssemblyType;
  firstCallAt: Date;
  secondCallAt: Date | null;
  place: string;
  points: PointInput[];
}

function validPoints(points: PointInput[]): PointState[] {
  return points.map((point, i) => {
    const title = point.title.trim();
    const description = point.description.trim();
    const where = `Punto ${i + 1}`;
    if (!title) throw new InvalidAssemblyError(`${where}: falta el título.`);
    if (title.length > POINT_TITLE_MAX_LENGTH) {
      throw new InvalidAssemblyError(
        `${where}: el título supera los ${POINT_TITLE_MAX_LENGTH} caracteres.`,
      );
    }
    if (description.length > POINT_DESCRIPTION_MAX_LENGTH) {
      throw new InvalidAssemblyError(`${where}: la descripción es demasiado larga.`);
    }
    if (point.votable && !point.majority) {
      throw new InvalidAssemblyError(
        `${where}: un punto votable necesita mayoría simple o reforzada.`,
      );
    }
    return {
      ...(point.id && { id: point.id }),
      title,
      description,
      votable: point.votable,
      majority: point.votable ? point.majority : null,
      position: i + 1,
    };
  });
}

function validated(input: AssemblyInput): Omit<AssemblyState, 'status'> {
  const place = input.place.trim();
  if (!place) throw new InvalidAssemblyError('Falta el lugar de celebración.');
  if (place.length > PLACE_MAX_LENGTH)
    throw new InvalidAssemblyError('El lugar es demasiado largo.');
  if (!(input.firstCallAt instanceof Date) || Number.isNaN(input.firstCallAt.getTime())) {
    throw new InvalidAssemblyError('La fecha de la asamblea no es válida.');
  }
  if (input.secondCallAt && input.secondCallAt.getTime() <= input.firstCallAt.getTime()) {
    throw new InvalidAssemblyError('La segunda convocatoria debe ser posterior a la primera.');
  }
  return {
    type: input.type,
    firstCallAt: input.firstCallAt,
    secondCallAt: input.secondCallAt,
    place,
    points: validPoints(input.points),
  };
}

export function createDraft(input: AssemblyInput): AssemblyState {
  return { status: 'borrador', ...validated(input) };
}

/** HU-ASA-01: points are added, removed and reordered only in draft (RN-ASA-10). */
export function editDraft(assembly: AssemblyState, input: AssemblyInput): AssemblyState {
  if (assembly.status !== 'borrador') {
    throw new InvalidAssemblyTransitionError('Solo se puede editar una convocatoria en borrador.');
  }
  return { status: 'borrador', ...validated(input) };
}

/** HU-ASA-01: future date with the minimum notice and at least one item. */
export function convene<T extends AssemblyState>(assembly: T, now: Date, minNoticeDays: number): T {
  if (assembly.status !== 'borrador') {
    throw new InvalidAssemblyTransitionError('Solo se puede convocar una asamblea en borrador.');
  }
  if (assembly.points.length === 0) {
    throw new InvalidAssemblyError('El orden del día necesita al menos un punto.');
  }
  if (assembly.firstCallAt.getTime() - now.getTime() < minNoticeDays * DAY_IN_MS) {
    throw new InsufficientNoticeError(minNoticeDays);
  }
  return { ...assembly, status: 'convocada' };
}

export function cancel<T extends AssemblyState>(assembly: T): T {
  if (assembly.status !== 'convocada') {
    throw new InvalidAssemblyTransitionError('Solo se puede cancelar una asamblea convocada.');
  }
  return { ...assembly, status: 'cancelada' };
}

/** Convocada → Celebrada, once no voting is left open. */
export function close<T extends AssemblyState>(assembly: T, openVotings: number): T {
  if (assembly.status !== 'convocada') {
    throw new InvalidAssemblyTransitionError('Solo se puede cerrar una asamblea convocada.');
  }
  if (openVotings > 0) {
    throw new InvalidAssemblyTransitionError('Cierra antes las votaciones abiertas.');
  }
  return { ...assembly, status: 'celebrada' };
}

/** HU-ASA-02: documentation can still be added once convened. */
export function assertCanAttach(status: AssemblyStatus): void {
  if (status !== 'borrador' && status !== 'convocada') {
    throw new InvalidAssemblyTransitionError(
      'No se puede añadir documentación a una asamblea celebrada o cancelada.',
    );
  }
}

/** Drafts exist only for «gestión». */
export function isVisible(status: AssemblyStatus, canManage: boolean): boolean {
  return canManage || status !== 'borrador';
}

/**
 * HU-ASA-03: drafts first (only «gestión» sees them), then upcoming by date,
 * then the celebrated or cancelled ones, most recent first.
 */
export function orderForListing<T extends { status: AssemblyStatus; firstCallAt: Date }>(
  assemblies: readonly T[],
): T[] {
  const group = (a: T) => (a.status === 'borrador' ? 0 : a.status === 'convocada' ? 1 : 2);
  return [...assemblies].sort((a, b) => {
    const byGroup = group(a) - group(b);
    if (byGroup !== 0) return byGroup;
    const byDate = a.firstCallAt.getTime() - b.firstCallAt.getTime();
    return group(a) === 2 ? -byDate : byDate;
  });
}
