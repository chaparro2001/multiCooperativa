import type { AssemblyType, Majority, PointInput } from '@multicooperativa/contracts';

import { i18n } from '@/i18n';

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
  key: `new-${++counter}`,
  title: '',
  description: '',
  votable: false,
  majority: null,
});

/** US-ASM-01: reorder the agenda. Out-of-range moves leave it unchanged. */
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

/** "2 of 4 (50 %)". */
export function participation(votesCast: number, censusSize: number | null): string {
  if (!censusSize) return i18n.t('assemblies.participation.votes', { count: votesCast });
  const percent = Math.round((votesCast / censusSize) * 100);
  return i18n.t('assemblies.participation.ofCensus', { votesCast, censusSize, percent });
}

export const ASSEMBLY_STATUS_TONE = {
  draft: 'warning',
  convened: 'info',
  held: 'neutral',
  cancelled: 'danger',
} as const;

export const ASSEMBLY_TYPES: readonly AssemblyType[] = ['ordinary', 'extraordinary'];
export const MAJORITIES: readonly Majority[] = ['simple', 'reinforced'];
