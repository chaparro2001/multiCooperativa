import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  DEFAULT_PAGE_SIZE,
  listInvoicesQuerySchema,
  listInvoicesResponseSchema,
  MAX_PAGE_SIZE,
  pageQuerySchema,
  pageResponseSchema,
} from './index';

describe('pagination contract', () => {
  it('uses the default page size and no cursor when the app sends nothing', () => {
    expect(pageQuerySchema.parse({})).toEqual({ limit: DEFAULT_PAGE_SIZE });
  });

  it('coerces the query-string limit and keeps the cursor opaque', () => {
    expect(pageQuerySchema.parse({ limit: '10', before: 'abc' })).toEqual({
      limit: 10,
      before: 'abc',
    });
  });

  it.each([{ limit: '0' }, { limit: String(MAX_PAGE_SIZE + 1) }, { limit: '1.5' }, { before: '' }])(
    'rejects %j',
    (query) => {
      expect(pageQuerySchema.safeParse(query).success).toBe(false);
    },
  );

  it('page responses carry items and nextCursor (null on the last page)', () => {
    const schema = pageResponseSchema(z.string());
    expect(schema.parse({ items: ['a'], nextCursor: null })).toEqual({
      items: ['a'],
      nextCursor: null,
    });
    expect(schema.safeParse({ items: ['a'] }).success).toBe(false);
  });

  it('list queries keep their filters next to the paging parameters', () => {
    expect(listInvoicesQuerySchema.parse({ operation: 'purchase', status: 'pending' })).toEqual({
      operation: 'purchase',
      status: 'pending',
      limit: DEFAULT_PAGE_SIZE,
    });
    expect(listInvoicesResponseSchema.safeParse({ items: [] }).success).toBe(false);
  });
});
