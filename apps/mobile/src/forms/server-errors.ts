import { ApiError, messageFor } from '@/api/api-error';

import { i18n } from '../i18n';
import { type FieldErrors, type FieldMessage, serverIssueErrors } from './errors';

/** How a form places the API's errors on its fields. */
export interface ServerMapping {
  /** API input path → the form's field name, when they differ (`issueDate` → `date`). */
  fields?: Record<string, string>;
  /**
   * Error codes that belong to a field although the API does not say which (a duplicate number,
   * a NIF that already exists). A function can pick the field from the error's details.
   */
  codes?: Record<string, string | ((error: ApiError) => FieldErrors)>;
}

const hasKey = (key: string) => i18n.exists(key);

const formatNumber = (value: unknown): string => {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString(i18n.language, { maximumFractionDigits: 2 })
    : String(value ?? '');
};

/** `lines.2.concept` → `lines_concept`: the key of a message made for a field of repeated rows. */
const fieldKey = (field: string) => field.replace(/\.\d+(?=\.|$)/g, '').replace(/\./g, '_');

/**
 * The text of an API error code on its field: `forms.serverField.<code>.<field>` when there is
 * one made for that field, `forms.server.<code>` for the code on any field (it can use the
 * details: expected total, contrast ratio), the generic `errors.codes.<code>` otherwise.
 */
export function serverMessage(error: ApiError, field?: string): FieldMessage {
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(error.details)) {
    if (typeof value === 'string' || typeof value === 'number') params[key] = value;
  }
  if ('ratio' in error.details) params.ratio = formatNumber(error.details.ratio);
  if ('minimum' in error.details) params.minimum = formatNumber(error.details.minimum);
  const candidates = [
    ...(field ? [`forms.serverField.${error.code}.${fieldKey(field)}`] : []),
    `forms.server.${error.code}`,
    `errors.codes.${error.code}`,
  ];
  return { key: candidates.find(hasKey) ?? candidates.at(-1)!, params };
}

/**
 * Field errors for an API failure; empty when the error does not belong to any field (the form
 * then shows its general banner). Sources, in order: Zod issues of a 400 `invalid_request`,
 * the `details.field` of a rule violation, and the form's own code → field table.
 */
export function serverFieldErrors(failure: unknown, mapping: ServerMapping = {}): FieldErrors {
  if (!(failure instanceof ApiError)) return {};
  const rename = (path: string) =>
    path ? (mapping.fields?.[path] ?? lineAlias(path, mapping)) : null;

  if (failure.code === 'invalid_request') return serverIssueErrors(failure.details, rename);

  const byCode = mapping.codes?.[failure.code];
  if (typeof byCode === 'function') return byCode(failure);
  if (typeof byCode === 'string') return { [byCode]: serverMessage(failure, byCode) };

  const field = failure.details.field;
  if (typeof field === 'string') {
    const name = rename(field);
    if (name) return { [name]: serverMessage(failure, field) };
  }
  return {};
}

/** `lines.2.quantity` keeps its shape unless the form renames the root (`points` → `agenda`). */
function lineAlias(path: string, mapping: ServerMapping): string {
  const [root, ...rest] = path.split('.');
  const renamed = mapping.fields?.[root!];
  return renamed ? [renamed, ...rest].join('.') : path;
}

export interface RoutedServerError {
  /** Errors to place on the form's fields. */
  fields: FieldErrors;
  /** Localized text for the general banner: what is left when nothing (or not all) fits a field. */
  banner: string | null;
}

/**
 * Splits an API failure between the form's fields and its general banner. `isKnown` tells which
 * field names the form actually renders: an error about anything else must not vanish, so it
 * goes to the banner.
 */
export function routeServerError(
  failure: unknown,
  mapping: ServerMapping = {},
  isKnown: (field: string) => boolean = () => true,
): RoutedServerError {
  const found = serverFieldErrors(failure, mapping);
  const fields: FieldErrors = {};
  let dropped = false;
  for (const [name, message] of Object.entries(found)) {
    if (isKnown(name)) fields[name] = message;
    else dropped = true;
  }
  const banner = dropped || Object.keys(fields).length === 0 ? messageFor(failure) : null;
  return { fields, banner };
}
