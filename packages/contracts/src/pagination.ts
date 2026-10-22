import { z } from 'zod';

/** Rows per page when the app does not ask for another size (the lists are keyset-paginated). */
export const DEFAULT_PAGE_SIZE = 30;
export const MAX_PAGE_SIZE = 100;

/**
 * Query of every paginated list: `limit` rows after the position `before` points to. Same style
 * as the assistant history (US-AI-04): the server returns `nextCursor`, the app sends it back.
 */
export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  /** `nextCursor` of the previous page. Opaque: the app never builds or reads it. */
  before: z.string().min(1).max(500).optional(),
});

/** Response of a paginated list. */
export function pageResponseSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    /** Pass it as `before` for the next page; null on the last one. */
    nextCursor: z.string().nullable(),
  });
}
