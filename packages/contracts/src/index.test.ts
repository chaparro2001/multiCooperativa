import { describe, expect, it } from 'vitest';

import { healthResponseSchema } from './index';

describe('healthResponseSchema', () => {
  it('accepts the correct health response', () => {
    expect(healthResponseSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
  });

  it('rejects an unknown status', () => {
    expect(healthResponseSchema.safeParse({ status: 'ko' }).success).toBe(false);
  });
});
