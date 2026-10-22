import { describe, expect, it } from 'vitest';

import {
  DAY_CURSOR,
  decodeCursor,
  encodeCursor,
  InvalidCursorError,
  pageRequest,
  toPage,
  UUID_CURSOR,
} from './pagination';

const SHAPE = [DAY_CURSOR, UUID_CURSOR];
const ID = '6f1c1c6e-6b0a-4a0e-9f0e-0a5f4b1d2c3d';

describe('keyset cursor', () => {
  it('round-trips the sort key', () => {
    const cursor = encodeCursor(['2026-03-01', ID]);
    expect(decodeCursor(cursor, SHAPE)).toEqual(['2026-03-01', ID]);
  });

  it.each([
    ['not base64 json', '%%%'],
    ['not an array', Buffer.from('{"a":1}').toString('base64url')],
    ['wrong arity', encodeCursor(['2026-03-01'])],
    ['wrong shape', encodeCursor(['yesterday', ID])],
    ['not strings', Buffer.from('[1,2]').toString('base64url')],
  ])('rejects a cursor that is %s', (_name, raw) => {
    expect(() => decodeCursor(raw, SHAPE)).toThrow(InvalidCursorError);
  });

  it('builds the store page request: no cursor on the first page', () => {
    expect(pageRequest({ limit: 5 }, SHAPE)).toEqual({ limit: 5 });
    expect(pageRequest({ limit: 5, before: encodeCursor(['2026-03-01', ID]) }, SHAPE)).toEqual({
      limit: 5,
      cursor: ['2026-03-01', ID],
    });
  });
});

describe('toPage', () => {
  const rows = [1, 2, 3];
  it('trims the extra row and points to the last one kept', () => {
    const page = toPage(rows, 2, (n) => [String(n)]);
    expect(page.items).toEqual([1, 2]);
    expect(page.nextCursor).toBe(encodeCursor(['2']));
  });

  it('has no next cursor on the last page', () => {
    expect(toPage(rows, 3, (n) => [String(n)])).toEqual({ items: rows, nextCursor: null });
    expect(toPage([], 3, (n) => [String(n)])).toEqual({ items: [], nextCursor: null });
  });
});
