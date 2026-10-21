import type { Branding } from '@multicooperativa/contracts';

import { newFileKey, type FileStorage } from '../../../shared/files/file-storage';
import { type CooperativeContext, requireAccess } from '../../access';
import { contrastWithWhite, MIN_CONTRAST, normalizeBrandColor } from '../domain/brand-color';
import { inspectLogo, MAX_LOGO_BYTES } from '../domain/logo';
import { InsufficientContrastError, InvalidBrandColorError, LogoRejectedError } from './errors';
import type { AuditRecorder, BrandingRecord, BrandingStore } from './ports/branding-store';

export interface BrandingDeps {
  store: BrandingStore;
  files: FileStorage;
  audit: AuditRecorder;
  now: () => Date;
}

export const BRANDING_CHANGED_ACTION = 'cooperative.branding_changed';

/** The logo link is read by the app on every session: an hour is long enough to avoid refetching. */
export const LOGO_URL_TTL_SECONDS = 60 * 60;

/** US-ACC-14: whoever administers the cooperative (users module, manage level) decides. */
function requireAdministration(context: CooperativeContext): void {
  requireAccess(context.permissions, 'users', 'manage');
}

const EMPTY: BrandingRecord = {
  primaryColor: null,
  logoKey: null,
  logoContentType: null,
  updatedAt: new Date(0),
};

async function view(deps: BrandingDeps, record: BrandingRecord | null): Promise<Branding> {
  if (!record) return { primaryColor: null, logoUrl: null, updatedAt: null };
  const logoUrl =
    record.logoKey && record.logoContentType
      ? await deps.files.signedDownloadUrl(record.logoKey, {
          fileName: record.logoContentType === 'image/png' ? 'logo.png' : 'logo.jpg',
          contentType: record.logoContentType,
          expiresInSeconds: LOGO_URL_TTL_SECONDS,
        })
      : null;
  return {
    primaryColor: record.primaryColor,
    logoUrl,
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** Every member of the cooperative sees its branding: the context already proves the membership. */
export async function getBranding(
  deps: BrandingDeps,
  context: CooperativeContext,
): Promise<Branding> {
  return view(deps, await deps.store.find(context.cooperativeId));
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
  if (current.primaryColor === normalized) return view(deps, existing);
  const saved = { ...current, primaryColor: normalized, updatedAt: deps.now() };
  await deps.store.save(context.cooperativeId, saved);
  await deps.audit(context.cooperativeId, {
    actorUserId: context.userId,
    action: BRANDING_CHANGED_ACTION,
    detail: { primaryColor: { from: current.primaryColor, to: normalized } },
  });
  return view(deps, saved);
}

/** BR-ACC-17: the type is read from the content; the previous logo's object is deleted. */
export async function setLogo(
  deps: BrandingDeps,
  context: CooperativeContext,
  content: Uint8Array,
): Promise<Branding> {
  requireAdministration(context);
  if (content.byteLength > MAX_LOGO_BYTES) throw new LogoRejectedError('too_large');
  const inspected = inspectLogo(content);
  if (!inspected.ok) throw new LogoRejectedError(inspected.reason);

  const current = (await deps.store.find(context.cooperativeId)) ?? EMPTY;
  const key = `${newFileKey(context.cooperativeId, 'branding')}.${inspected.extension}`;
  await deps.files.put(key, content, inspected.type);
  const saved = {
    ...current,
    logoKey: key,
    logoContentType: inspected.type,
    updatedAt: deps.now(),
  };
  try {
    await deps.store.save(context.cooperativeId, saved);
  } catch (error) {
    await deps.files.delete(key);
    throw error;
  }
  if (current.logoKey) await deps.files.delete(current.logoKey);
  await deps.audit(context.cooperativeId, {
    actorUserId: context.userId,
    action: BRANDING_CHANGED_ACTION,
    detail: { logo: current.logoKey ? 'replaced' : 'set' },
  });
  return view(deps, saved);
}

/** Idempotent: removing a logo that is not there changes nothing and leaves no audit event. */
export async function removeLogo(
  deps: BrandingDeps,
  context: CooperativeContext,
): Promise<Branding> {
  requireAdministration(context);
  const current = await deps.store.find(context.cooperativeId);
  if (!current?.logoKey) return view(deps, current);

  const saved = { ...current, logoKey: null, logoContentType: null, updatedAt: deps.now() };
  await deps.store.save(context.cooperativeId, saved);
  await deps.files.delete(current.logoKey);
  await deps.audit(context.cooperativeId, {
    actorUserId: context.userId,
    action: BRANDING_CHANGED_ACTION,
    detail: { logo: 'removed' },
  });
  return view(deps, saved);
}
