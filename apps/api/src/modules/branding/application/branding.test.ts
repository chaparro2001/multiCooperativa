import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryFileStorage } from '../../../shared/files/in-memory-file-storage';
import { type CooperativeContext, ModuleAccessDeniedError } from '../../access';
import {
  BRANDING_CHANGED_ACTION,
  getBranding,
  LOGO_URL_TTL_SECONDS,
  removeLogo,
  setLogo,
  setPrimaryColor,
  type BrandingDeps,
} from './branding';
import { InsufficientContrastError, InvalidBrandColorError, LogoRejectedError } from './errors';
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

function png(width = 100, height = 50): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

let deps: BrandingDeps;
let store: InMemoryBrandingStore;
let files: InMemoryFileStorage;
let audit: { cooperativeId: string; action: string; detail: Record<string, unknown> }[];

beforeEach(() => {
  store = new InMemoryBrandingStore();
  files = new InMemoryFileStorage();
  audit = [];
  deps = {
    store,
    files,
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
      logoUrl: null,
      updatedAt: null,
    });
  });

  it('lets any member read it, with a link that expires in an hour', async () => {
    await setPrimaryColor(deps, admin, '#1e5aa8');
    await setLogo(deps, admin, png());
    const branding = await getBranding(deps, member);
    expect(branding.primaryColor).toBe('#1E5AA8');
    expect(branding.logoUrl).toContain(`expires=${LOGO_URL_TTL_SECONDS}`);
    expect(branding.updatedAt).toBe('2026-10-21T10:00:00.000Z');
  });

  it('does not show the branding of another cooperative', async () => {
    await setPrimaryColor(deps, admin, '#1E5AA8');
    expect(await getBranding(deps, otherAdmin)).toEqual({
      primaryColor: null,
      logoUrl: null,
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

describe('setLogo (US-ACC-14, BR-ACC-17)', () => {
  it('stores the image under the cooperative prefix and audits it', async () => {
    const branding = await setLogo(deps, admin, png());
    expect(branding.logoUrl).not.toBeNull();
    const [key] = [...files.files.keys()];
    expect(key).toMatch(new RegExp(`^cooperatives/${COOP}/branding/[0-9a-f-]+\\.png$`));
    expect(files.files.get(key!)?.contentType).toBe('image/png');
    expect(audit[0]?.detail).toEqual({ logo: 'set' });
  });

  it('replaces the previous object', async () => {
    await setLogo(deps, admin, png(10, 10));
    const [first] = [...files.files.keys()];
    await setLogo(deps, admin, png(20, 20));
    expect(files.files.size).toBe(1);
    expect(files.files.has(first!)).toBe(false);
    expect(audit[1]?.detail).toEqual({ logo: 'replaced' });
  });

  it.each([
    ['SVG', new TextEncoder().encode('<svg onload="alert(1)"></svg>'), 'svg_not_allowed'],
    ['PDF', new TextEncoder().encode('%PDF-1.4 x'), 'unsupported_type'],
    ['too big in dimensions', png(2000, 10), 'too_large_dimensions'],
    ['over 1 MB', Uint8Array.from({ length: 1024 * 1024 + 1 }, () => 0), 'too_large'],
  ])('refuses %s and stores nothing', async (_name, content, reason) => {
    const error = await setLogo(deps, admin, content).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LogoRejectedError);
    expect((error as LogoRejectedError).reason).toBe(reason);
    expect(files.files.size).toBe(0);
    expect(audit).toEqual([]);
  });

  it('denies a member without the users module', async () => {
    await expect(setLogo(deps, member, png())).rejects.toBeInstanceOf(ModuleAccessDeniedError);
    expect(files.files.size).toBe(0);
  });

  it('keeps the colour when the logo changes', async () => {
    await setPrimaryColor(deps, admin, '#1E5AA8');
    const branding = await setLogo(deps, admin, png());
    expect(branding.primaryColor).toBe('#1E5AA8');
  });
});

describe('removeLogo (US-ACC-14)', () => {
  it('deletes the object and the reference, keeping the colour', async () => {
    await setPrimaryColor(deps, admin, '#1E5AA8');
    await setLogo(deps, admin, png());
    const branding = await removeLogo(deps, admin);
    expect(branding.logoUrl).toBeNull();
    expect(branding.primaryColor).toBe('#1E5AA8');
    expect(files.files.size).toBe(0);
    expect(audit.at(-1)?.detail).toEqual({ logo: 'removed' });
  });

  it('is idempotent and leaves no audit event when there is no logo', async () => {
    await removeLogo(deps, admin);
    expect(audit).toEqual([]);
  });

  it('denies a member without the users module', async () => {
    await setLogo(deps, admin, png());
    await expect(removeLogo(deps, member)).rejects.toBeInstanceOf(ModuleAccessDeniedError);
    expect(files.files.size).toBe(1);
  });
});
