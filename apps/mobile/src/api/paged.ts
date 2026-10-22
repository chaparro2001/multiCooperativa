/**
 * Helpers of the keyset-paginated lists (same style as the assistant history): the server
 * answers `{ items, nextCursor }` and the app asks for the next page with `before=<nextCursor>`.
 * The cursor is opaque: it is only passed back.
 */

/** `path?a=1&before=<cursor>`; parameters without a value are left out. */
export function pagedPath(
  path: string,
  params: Record<string, string | undefined>,
  cursor?: string,
): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries({ ...params, before: cursor })) {
    if (value) query.set(name, value);
  }
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

/** `getNextPageParam` of every paginated list: undefined on the last page. */
export const nextCursorOf = (page: { nextCursor: string | null }): string | undefined =>
  page.nextCursor ?? undefined;

/** Every item loaded so far, in order. */
export function allItems<T>(data: { pages: { items: T[] }[] } | undefined): T[] {
  return data ? data.pages.flatMap((page) => page.items) : [];
}
