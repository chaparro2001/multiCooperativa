import type { Majority, PointInput } from '@multicooperativa/contracts';

/** A point being edited; `key` identifies it on screen, `id` only once saved. */
export interface EditablePoint {
  key: string;
  id?: string;
  title: string;
  description: string;
  votable: boolean;
  majority: Majority | null;
}

let counter = 0;
export const newPoint = (): EditablePoint => ({
  key: `nuevo-${++counter}`,
  title: '',
  description: '',
  votable: false,
  majority: null,
});

/** HU-ASA-01: reorder the agenda. Out-of-range moves leave it unchanged. */
export function movePoint<T>(points: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= points.length || target < 0 || target >= points.length) {
    return [...points];
  }
  const next = [...points];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/** What the API receives: a votable point carries its majority (simple by default), others none. */
export function toPointInputs(points: readonly EditablePoint[]): PointInput[] {
  return points.map((point) => ({
    ...(point.id && { id: point.id }),
    title: point.title.trim(),
    description: point.description.trim(),
    votable: point.votable,
    majority: point.votable ? (point.majority ?? 'simple') : null,
  }));
}

export const OUTCOME_LABEL = {
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  sin_quorum: 'Sin quórum',
} as const;

export const CHOICE_LABEL = {
  a_favor: 'A favor',
  en_contra: 'En contra',
  abstencion: 'Abstención',
} as const;

/** «2 de 4 (50 %)». */
export function participation(votesCast: number, censusSize: number | null): string {
  if (!censusSize) return `${votesCast} votos`;
  const percent = Math.round((votesCast / censusSize) * 100);
  return `${votesCast} de ${censusSize} (${percent} %)`;
}

export const ASSEMBLY_STATUS = {
  borrador: { label: 'Borrador', tone: 'warning' },
  convocada: { label: 'Convocada', tone: 'info' },
  celebrada: { label: 'Celebrada', tone: 'neutral' },
  cancelada: { label: 'Cancelada', tone: 'danger' },
} as const;

export const ASSEMBLY_TYPE_LABEL = {
  ordinaria: 'Asamblea ordinaria',
  extraordinaria: 'Asamblea extraordinaria',
} as const;
