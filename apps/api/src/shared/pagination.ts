/**
 * Keyset pagination shared by every list (same style as the assistant history, US-AI-04): the
 * store sorts by a stable unique key, the page asks for `limit + 1` rows to know whether there
 * is a next one, and `nextCursor` is the sort key of the last row of the page. The cursor is
 * opaque to the app: base64url of a JSON array of strings, one per sort column.
 */

/** A cursor that is not one this server issued (or that was tampered with): answered 400. */
export class InvalidCursorError extends Error {
  constructor() {
    super('The pagination cursor is not valid.');
    this.name = 'InvalidCursorError';
  }
}

/** A page as the stores take it: `cursor` is the decoded sort key of the last row already seen. */
export interface PageRequest {
  limit: number;
  cursor?: readonly string[];
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export const DAY_CURSOR = /^\d{4}-\d{2}-\d{2}$/;
export const UUID_CURSOR = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TEXT_CURSOR = /^[\s\S]{0,300}$/;

export function encodeCursor(parts: readonly string[]): string {
  return Buffer.from(JSON.stringify(parts), 'utf8').toString('base64url');
}

/** One pattern per sort column: anything else throws, so a store never builds a query from junk. */
export function decodeCursor(raw: string, shape: readonly RegExp[]): string[] {
  let parts: unknown;
  try {
    parts = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidCursorError();
  }
  if (
    !Array.isArray(parts) ||
    parts.length !== shape.length ||
    !parts.every((part, i) => typeof part === 'string' && shape[i]!.test(part))
  ) {
    throw new InvalidCursorError();
  }
  return parts as string[];
}

/** The page request a use case hands to a store: the opaque cursor decoded against its shape. */
export function pageRequest(
  page: { limit: number; before?: string },
  shape: readonly RegExp[],
): PageRequest {
  return {
    limit: page.limit,
    ...(page.before !== undefined && { cursor: decodeCursor(page.before, shape) }),
  };
}

/** `rows` were read with `limit + 1`: the extra one only says that there are more. */
export function toPage<T>(
  rows: T[],
  limit: number,
  cursorOf: (row: T) => readonly string[],
): Page<T> {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: rows.length > limit && last !== undefined ? encodeCursor(cursorOf(last)) : null,
  };
}
