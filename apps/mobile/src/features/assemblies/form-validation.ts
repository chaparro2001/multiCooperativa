import {
  assemblyInputSchema,
  type AssemblyType,
  rescheduleAssemblyRequestSchema,
} from '@multicooperativa/contracts';

import { collect, type FieldErrors, mergeErrors, required, zodFieldErrors } from '@/forms/errors';
import type { ServerMapping } from '@/forms/server-errors';

import { type EditablePoint, toPointInputs } from './agenda';

export interface AssemblyDraft {
  type: AssemblyType;
  firstCall: Date;
  secondCall: Date | null;
  place: string;
  points: EditablePoint[];
}

/** The API names the dates `firstCallAt` and `secondCallAt`. */
const FORM_FIELD: Record<string, string> = { firstCallAt: 'firstCall', secondCallAt: 'secondCall' };

export const ASSEMBLY_SERVER_MAPPING: ServerMapping = { fields: FORM_FIELD };

/** Fields the editor renders (agenda rows are `points.<n>.title|description|majority`). */
export const isAssemblyField = (name: string) =>
  /^(type|firstCall|secondCall|place|points(\.\d+\.(title|description|majority))?)$/.test(name);

/** US-ASM-01 and US-ASM-02: what the draft needs before it is saved. */
export function validateAssembly(draft: AssemblyDraft): FieldErrors {
  const own = collect({
    place: draft.place.trim() ? undefined : required,
    firstCall: Number.isNaN(draft.firstCall.getTime()) ? required : undefined,
    secondCall:
      draft.secondCall && draft.secondCall.getTime() <= draft.firstCall.getTime()
        ? { key: 'assemblies.editor.errors.secondBeforeFirst' }
        : undefined,
  });
  draft.points.forEach((point, index) => {
    if (!point.title.trim()) own[`points.${index}.title`] = required;
  });

  // The contract the API enforces, on the record the draft would send.
  const valid = !Number.isNaN(draft.firstCall.getTime());
  const parsed = assemblyInputSchema.safeParse({
    type: draft.type,
    firstCallAt: valid ? draft.firstCall.toISOString() : '',
    secondCallAt: draft.secondCall ? draft.secondCall.toISOString() : null,
    place: draft.place.trim(),
    points: toPointInputs(draft.points),
  });
  const contract = parsed.success
    ? {}
    : zodFieldErrors(parsed.error, (path) => {
        const joined = path.map(String).join('.');
        return FORM_FIELD[joined] ?? joined;
      });
  return mergeErrors(own, contract);
}

export interface RescheduleDraft {
  firstCall: Date;
  secondCall: Date | null;
  place: string;
  reason: string;
  notifyMembers: boolean;
}

/** Same API paths as the editor, plus the optional reason. */
export const RESCHEDULE_SERVER_MAPPING: ServerMapping = { fields: FORM_FIELD };

export const isRescheduleField = (name: string) =>
  /^(firstCall|secondCall|place|reason)$/.test(name);

/** US-ASM-09: what the change of date needs before it is sent (the notice is the server's rule). */
export function validateReschedule(draft: RescheduleDraft, now = new Date()): FieldErrors {
  const own = collect({
    place: draft.place.trim() ? undefined : required,
    firstCall: Number.isNaN(draft.firstCall.getTime())
      ? required
      : draft.firstCall.getTime() <= now.getTime()
        ? { key: 'assemblies.reschedule.errors.pastDate' }
        : undefined,
    secondCall:
      draft.secondCall && draft.secondCall.getTime() <= draft.firstCall.getTime()
        ? { key: 'assemblies.editor.errors.secondBeforeFirst' }
        : undefined,
  });
  const valid = !Number.isNaN(draft.firstCall.getTime());
  const parsed = rescheduleAssemblyRequestSchema.safeParse({
    firstCallAt: valid ? draft.firstCall.toISOString() : '',
    secondCallAt: draft.secondCall ? draft.secondCall.toISOString() : null,
    place: draft.place.trim(),
    reason: draft.reason.trim() || null,
    notifyMembers: draft.notifyMembers,
  });
  const contract = parsed.success
    ? {}
    : zodFieldErrors(parsed.error, (path) => {
        const joined = path.map(String).join('.');
        return FORM_FIELD[joined] ?? joined;
      });
  return mergeErrors(own, contract);
}
