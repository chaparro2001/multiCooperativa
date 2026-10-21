import { beforeEach, describe, expect, it } from 'vitest';

import { type CooperativeContext, ModuleAccessDeniedError } from '../../access';
import {
  BRANDING_CHANGED_ACTION,
  getBranding,
  setPrimaryColor,
  type BrandingDeps,
} from './branding';
import { InsufficientContrastError, InvalidBrandColorError } from './errors';
import { InMemoryBrandingStore } from './testing/in-memory-branding-store';

const COOP = '11111111-1111-4111-8111-111111111111';
const OTHER_COOP = '22222222-2222-4222-8222-222222222222';

const grant = (module: string, level: 'read' | 'manage') =>
  ({ module, level, scope: 'all' }) as const;
const contextOf = (
  permissions: ReturnType<typeof grant>[],
  cooperativeId = COOP,
): CooperativeContext =>
  ({
    userId: 'u1',
    sessionId: 's1',
    cooperativeId,
    membershipId: 'm1',
    profileName: 'x',
    isPartner: false,
    permissions,
  }) as unknown as CooperativeContext;
const admin = contextOf([grant('users', 'manage')]);
const member = contextOf([grant('documents', 'read')]);
const otherAdmin = contextOf([grant('users', 'manage')], OTHER_COOP);

let deps: BrandingDeps;
let store: InMemoryBrandingStore;
let audit: { cooperativeId: string; action: string; detail: Record<string, unknown> }[];

beforeEach(() => {
  store = new InMemoryBrandingStore();
  audit = [];
  deps = {
    store,
    now: () => new Date('2026-10-21T10:00:00Z'),
    audit: async (cooperativeId, event) => {
      audit.push({ cooperativeId, action: event.action, detail: event.detail });
    },
  };
});

describe('getBranding (US-ACC-14)', () => {
  it('gives the defaults to a cooperative that never configured anything', async () => {
    expect(await getBranding(deps, member)).toEqual({
      primaryColor: null,
      updatedAt: null,
    });
  });

  it('lets any member read it', async () => {
    await setPrimaryColor(deps, admin, '#1e5aa8');
    const branding = await getBranding(deps, member);
    expect(branding.primaryColor).toBe('#1E5AA8');
    expect(branding.updatedAt).toBe('2026-10-21T10:00:00.000Z');
  });

  it('does not show the branding of another cooperative', async () => {
    await setPrimaryColor(deps, admin, '#1E5AA8');
    expect(await getBranding(deps, otherAdmin)).toEqual({
      primaryColor: null,
      updatedAt: null,
    });
  });
});

describe('setPrimaryColor (US-ACC-14, BR-ACC-16)', () => {
  it('saves the colour in upper case and audits the change', async () => {
    const branding = await setPrimaryColor(deps, admin, '#1e5aa8');
    expect(branding.primaryColor).toBe('#1E5AA8');
    expect(audit).toEqual([
      {
        cooperativeId: COOP,
        action: BRANDING_CHANGED_ACTION,
        detail: { primaryColor: { from: null, to: '#1E5AA8' } },
      },
    ]);
  });

  it('refuses a colour whose white text is under 4.5:1, with the ratio', async () => {
    const error = await setPrimaryColor(deps, admin, '#FFE066').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InsufficientContrastError);
    expect((error as InsufficientContrastError).ratio).toBeCloseTo(1.3, 2);
    expect((error as InsufficientContrastError).minimum).toBe(4.5);
    expect(store.rows.size).toBe(0);
    expect(audit).toEqual([]);
  });

  it('refuses what is not #RRGGBB', async () => {
    await expect(setPrimaryColor(deps, admin, 'blue')).rejects.toBeInstanceOf(
      InvalidBrandColorError,
    );
  });

  it('goes back to the default with null, and does not audit a non-change', async () => {
    await setPrimaryColor(deps, admin, '#1E5AA8');
    audit.length = 0;
    await setPrimaryColor(deps, admin, '#1E5AA8');
    expect(audit).toEqual([]);
    const reset = await setPrimaryColor(deps, admin, null);
    expect(reset.primaryColor).toBeNull();
    expect(audit[0]?.detail).toEqual({ primaryColor: { from: '#1E5AA8', to: null } });
  });

  it('denies a member without the users module and saves nothing', async () => {
    await expect(setPrimaryColor(deps, member, '#1E5AA8')).rejects.toBeInstanceOf(
      ModuleAccessDeniedError,
    );
    expect(store.rows.size).toBe(0);
  });

  it('only touches the cooperative of the context', async () => {
    await setPrimaryColor(deps, admin, '#1E5AA8');
    expect(store.rows.has(OTHER_COOP)).toBe(false);
  });
});
