import { describe, expect, it } from 'vitest';

import { allItems, nextCursorOf, pagedPath } from './paged';

describe('pagedPath', () => {
  it('keeps the filters and adds the cursor as `before`', () => {
    expect(pagedPath('/c/1/invoices', { operation: 'purchase' }, 'abc')).toBe(
      '/c/1/invoices?operation=purchase&before=abc',
    );
  });

  it('leaves out empty parameters and the query string when nothing is left', () => {
    expect(pagedPath('/c/1/documents', { q: '', category: undefined })).toBe('/c/1/documents');
  });

  it('encodes the values, the cursor included', () => {
    expect(pagedPath('/m', { q: 'ana lópez' }, 'a+b/c=')).toBe(
      '/m?q=ana+l%C3%B3pez&before=a%2Bb%2Fc%3D',
    );
  });
});

describe('paged results', () => {
  it('the next page param is the cursor, or undefined on the last page', () => {
    expect(nextCursorOf({ nextCursor: 'x' })).toBe('x');
    expect(nextCursorOf({ nextCursor: null })).toBeUndefined();
  });

  it('flattens the loaded pages in order and tolerates no data yet', () => {
    expect(allItems({ pages: [{ items: [1, 2] }, { items: [3] }] })).toEqual([1, 2, 3]);
    expect(allItems(undefined)).toEqual([]);
  });
});
