import { describe, expect, it } from 'vitest';

import { healthResponseSchema } from './index';

describe('healthResponseSchema', () => {
  it('acepta la respuesta de salud correcta', () => {
    expect(healthResponseSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
  });

  it('rechaza un estado desconocido', () => {
    expect(healthResponseSchema.safeParse({ status: 'ko' }).success).toBe(false);
  });
});
