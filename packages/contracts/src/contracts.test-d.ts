import { describe, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';

import { announcementSchema } from './announcements';
import { loginRequestSchema } from './auth';
import { brandingSchema, updateBrandColorBodySchema } from './branding';
import { invoiceSchema } from './invoicing';

// Type-level tests: `vitest typecheck` fails if a contract changes shape.
describe('contract types', () => {
  it('branding exposes a nullable colour and update date (US-ACC-14)', () => {
    expectTypeOf<z.infer<typeof brandingSchema>>().toEqualTypeOf<{
      primaryColor: string | null;
      updatedAt: string | null;
    }>();
    expectTypeOf<z.infer<typeof updateBrandColorBodySchema>>().toEqualTypeOf<{
      primaryColor: string | null;
    }>();
  });

  it('invoice amounts are strings, never numbers', () => {
    type Invoice = z.infer<typeof invoiceSchema>;
    expectTypeOf<Invoice['base']>().toBeString();
    expectTypeOf<Invoice['total']>().toBeString();
    expectTypeOf<Invoice['id']>().toBeString();
    expectTypeOf<Invoice['discrepancyCount']>().toBeNumber();
    expectTypeOf<Invoice['settledAt']>().toEqualTypeOf<string | null>();
    expectTypeOf<Invoice['paymentStatus']>().toEqualTypeOf<
      'pending' | 'overdue' | 'settled' | 'voided'
    >();
  });

  it('announcement has the fields the app renders (US-ANN-02, US-ANN-05)', () => {
    type Announcement = z.infer<typeof announcementSchema>;
    expectTypeOf<Announcement['status']>().toEqualTypeOf<'draft' | 'published' | 'withdrawn'>();
    expectTypeOf<Announcement['pinned']>().toBeBoolean();
    expectTypeOf<Announcement['publishedAt']>().toEqualTypeOf<string | null>();
    expectTypeOf<Announcement['editedAt']>().toEqualTypeOf<string | null>();
    expectTypeOf<Announcement>().toHaveProperty('body');
  });

  it('login request carries credentials as strings', () => {
    type Login = z.infer<typeof loginRequestSchema>;
    expectTypeOf<Login['email']>().toBeString();
    expectTypeOf<Login['password']>().toBeString();
  });
});
