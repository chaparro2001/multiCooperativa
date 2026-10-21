import type { ZodError } from 'zod';

import { i18n } from '../i18n';

/**
 * Form validation results. A field error is an i18n key (+ params), never text: the same result
 * can come from the client (Zod contract run on the draft) or from the API (error codes and
 * `details`), and it is localized only when shown.
 */
export interface FieldMessage {
  key: string;
  params?: Record<string, string | number>;
}

/** Field name (a key of the form's values, or `lines.0.concept` for repeated rows) → message. */
export type FieldErrors = Record<string, FieldMessage>;

export const required: FieldMessage = { key: 'forms.errors.required' };
export const invalid: FieldMessage = { key: 'forms.errors.invalid' };

/** Builds field errors from per-field results, dropping the fields that have none. */
export function collect(results: Record<string, FieldMessage | undefined>): FieldErrors {
  const errors: FieldErrors = {};
  for (const [field, message] of Object.entries(results)) {
    if (message) errors[field] = message;
  }
  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** Field names are `root` or `root.index.child`: the root is the key of the form's values. */
export function fieldRoot(name: string): string {
  return name.split('.')[0]!;
}

/** The subset of a Zod v4 issue this mapper reads (kept structural so it is easy to test). */
export interface IssueLike {
  code: string;
  path: readonly PropertyKey[];
  origin?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  format?: string;
  input?: unknown;
}

/** Zod issue code → message: the generic texts a person can act on. */
export function issueMessage(issue: IssueLike): FieldMessage {
  switch (issue.code) {
    case 'invalid_type':
      return issue.input === undefined || issue.input === null ? required : invalid;
    case 'too_small': {
      const minimum = Number(issue.minimum);
      if (issue.origin === 'string' || issue.origin === 'array') {
        return minimum <= 1 ? required : { key: 'forms.errors.tooShort', params: { min: minimum } };
      }
      return minimum >= 0
        ? { key: 'forms.errors.mustBePositive' }
        : { key: 'forms.errors.tooSmall', params: { min: minimum } };
    }
    case 'too_big':
      return issue.origin === 'string' || issue.origin === 'array'
        ? { key: 'forms.errors.tooLong', params: { max: Number(issue.maximum) } }
        : { key: 'forms.errors.tooBig', params: { max: Number(issue.maximum) } };
    case 'invalid_format':
      return issue.format === 'email' ? { key: 'forms.errors.email' } : invalid;
    default:
      return invalid;
  }
}

/**
 * Runs through the issues of a failed Zod parse and keeps the first one of every field.
 * `fieldFor` renames the contract path to the form's field name (null skips the issue):
 * `issueDate` → `date` when the form calls it so, `lines.2.quantity` stays as it is.
 */
export function zodFieldErrors(
  error: ZodError,
  fieldFor: (path: readonly PropertyKey[]) => string | null = (path) => path.map(String).join('.'),
): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const field = fieldFor(issue.path);
    if (field && !(field in errors)) errors[field] = issueMessage(issue as IssueLike);
  }
  return errors;
}

/** Zod issue code of the API's `details.issues` (it has no origin or limits): coarser texts. */
const SERVER_CODES: Record<string, FieldMessage> = {
  invalid_type: required,
  too_small: { key: 'forms.errors.tooShortOrSmall' },
  too_big: { key: 'forms.errors.tooBigOrLong' },
  invalid_format: invalid,
};

/** `details.issues` of a 400 `invalid_request` → field errors (backward compatible: none if absent). */
export function serverIssueErrors(
  details: Record<string, unknown>,
  fieldFor: (path: string) => string | null = (path) => path || null,
): FieldErrors {
  const errors: FieldErrors = {};
  const issues = Array.isArray(details.issues) ? details.issues : [];
  for (const issue of issues) {
    if (typeof issue !== 'object' || issue === null) continue;
    const { path, code } = issue as { path?: unknown; code?: unknown };
    if (typeof path !== 'string' || typeof code !== 'string') continue;
    const field = fieldFor(path);
    if (field && !(field in errors)) errors[field] = SERVER_CODES[code] ?? invalid;
  }
  return errors;
}

/** Merges results; the first one wins for a field (client rules before the contract's). */
export function mergeErrors(...results: FieldErrors[]): FieldErrors {
  const merged: FieldErrors = {};
  for (const result of results) {
    for (const [field, message] of Object.entries(result)) {
      if (!(field in merged)) merged[field] = message;
    }
  }
  return merged;
}

const lookup = i18n.t as unknown as (key: string, options?: Record<string, unknown>) => string;

/** The localized text of a message. */
export function messageText(message: FieldMessage): string {
  return lookup(message.key, message.params);
}
