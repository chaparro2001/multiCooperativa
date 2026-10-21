import { describe, expect, it } from 'vitest';

import { parentRoute } from './parent-route';

describe('parentRoute (US-INV-06)', () => {
  it.each([
    ['/', null],
    ['/invoices', '/'],
    ['/invoices/invoice/abc', '/invoices'],
    ['/invoices/delivery-note/abc', '/invoices'],
    ['/invoices/third-parties', '/invoices'],
    ['/invoices/third-parties/abc', '/invoices/third-parties'],
    ['/invoices/third-parties/editor', '/invoices/third-parties'],
    ['/invoices/register', '/invoices'],
    ['/announcements/abc', '/announcements'],
    ['/assemblies/vote', '/assemblies'],
    ['/settings', '/'],
  ])('%s -> %s', (path, parent) => {
    expect(parentRoute(path)).toBe(parent);
  });
});
