import { describe, expect, it } from 'vitest';

import { assertKeepsAnAdmin, assertNotSelf } from './administration';
import { LastAdminError, SelfModificationError } from './errors';

describe('assertNotSelf (BR-ACC-08)', () => {
  it('rejects an administrator modifying their own membership', () => {
    expect(() => assertNotSelf('m-1', 'm-1')).toThrow(SelfModificationError);
  });

  it('allows modifying the membership of another member', () => {
    expect(() => assertNotSelf('m-1', 'm-2')).not.toThrow();
  });
});

describe('assertKeepsAnAdmin (BR-ACC-07)', () => {
  it('rejects removing the last active administrator', () => {
    expect(() => assertKeepsAnAdmin({ targetIsActiveAdmin: true, activeAdminCount: 1 })).toThrow(
      LastAdminError,
    );
  });

  it('allows removing an administrator if another one remains active', () => {
    expect(() =>
      assertKeepsAnAdmin({ targetIsActiveAdmin: true, activeAdminCount: 2 }),
    ).not.toThrow();
  });

  it('does not apply if the affected member is not an active administrator', () => {
    expect(() =>
      assertKeepsAnAdmin({ targetIsActiveAdmin: false, activeAdminCount: 1 }),
    ).not.toThrow();
  });
});
