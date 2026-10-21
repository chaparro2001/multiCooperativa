import type { Branding } from '@multicooperativa/contracts';

import { type CooperativeContext, requireAccess } from '../../access';
import { contrastWithWhite, MIN_CONTRAST, normalizeBrandColor } from '../domain/brand-color';
import { InsufficientContrastError, InvalidBrandColorError } from './errors';
import type { AuditRecorder, BrandingRecord, BrandingStore } from './ports/branding-store';

export interface BrandingDeps {
  store: BrandingStore;
  audit: AuditRecorder;
  now: () => Date;
}

export const BRANDING_CHANGED_ACTION = 'cooperative.branding_changed';

/** US-ACC-14: whoever administers the cooperative (users module, manage level) decides. */
function requireAdministration(context: CooperativeContext): void {
  requireAccess(context.permissions, 'users', 'manage');
}

const EMPTY: BrandingRecord = {
  primaryColor: null,
  updatedAt: new Date(0),
};

function view(record: BrandingRecord | null): Branding {
  if (!record) return { primaryColor: null, updatedAt: null };
  return { primaryColor: record.primaryColor, updatedAt: record.updatedAt.toISOString() };
}

/** Every member of the cooperative sees its branding: the context already proves the membership. */
export async function getBranding(
  deps: BrandingDeps,
  context: CooperativeContext,
): Promise<Branding> {
  return view(await deps.store.find(context.cooperativeId));
}

/** `null` goes back to the app's default colour. BR-ACC-16; audited (US-ACC-12). */
export async function setPrimaryColor(
  deps: BrandingDeps,
  context: CooperativeContext,
  color: string | null,
): Promise<Branding> {
  requireAdministration(context);
  let normalized: string | null = null;
  if (color !== null) {
    normalized = normalizeBrandColor(color);
    if (!normalized) throw new InvalidBrandColorError();
    const ratio = contrastWithWhite(normalized);
    if (ratio < MIN_CONTRAST) {
      throw new InsufficientContrastError(Math.round(ratio * 100) / 100, MIN_CONTRAST);
    }
  }

  const existing = await deps.store.find(context.cooperativeId);
  const current = existing ?? EMPTY;
  // Nothing changes, so nothing is saved or audited.
  if (current.primaryColor === normalized) return view(existing);
  const saved = { ...current, primaryColor: normalized, updatedAt: deps.now() };
  await deps.store.save(context.cooperativeId, saved);
  await deps.audit(context.cooperativeId, {
    actorUserId: context.userId,
    action: BRANDING_CHANGED_ACTION,
    detail: { primaryColor: { from: current.primaryColor, to: normalized } },
  });
  return view(saved);
}
