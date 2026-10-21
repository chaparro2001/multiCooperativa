import { type CooperativeContext, hasAccess, requireAccess } from '../../access';
import {
  assertInvoicingNoticeSettings,
  INVOICING_NOTICE_FIELDS,
  type InvoicingNoticeSettings,
  invoiceAttentionUntil,
  noteAttentionUpTo,
} from '../domain/invoicing-settings';
import type {
  AuditRecorder,
  InvoiceStore,
  InvoicingSettingsStore,
  StaleNotesQuery,
} from './ports/document-stores';
import { requireRead } from './shared';

export interface AttentionDeps {
  settings: InvoicingSettingsStore;
  invoices: Pick<InvoiceStore, 'countDueUntil'>;
  staleNotes: Pick<StaleNotesQuery, 'countPendingUpTo'>;
  audit: AuditRecorder;
  /** Today in the cooperative's calendar (YYYY-MM-DD). */
  today: () => string;
}

export const INVOICING_SETTINGS_CHANGED_ACTION = 'cooperative.invoicing_settings_changed';

/**
 * BR-INV-15: whoever administers the cooperative (users module, manage level)
 * decides, like the assistant model and the branding.
 */
function requireAdministration(context: CooperativeContext): void {
  requireAccess(context.permissions, 'users', 'manage');
}

/** Anyone with invoicing access reads it; the administrator also, to edit it in Settings. */
export async function getInvoicingSettings(
  deps: Pick<AttentionDeps, 'settings'>,
  context: CooperativeContext,
): Promise<InvoicingNoticeSettings> {
  if (!hasAccess(context.permissions, 'users', 'manage')) requireRead(context);
  return deps.settings.noticeSettings(context.cooperativeId);
}

/**
 * BR-INV-15; audited (US-ACC-12) with the previous and the new value of each field that changed.
 * A write that changes nothing leaves no event.
 */
export async function updateInvoicingSettings(
  deps: Pick<AttentionDeps, 'settings' | 'audit'>,
  context: CooperativeContext,
  input: InvoicingNoticeSettings,
): Promise<InvoicingNoticeSettings> {
  requireAdministration(context);
  const next = assertInvoicingNoticeSettings(input);
  const current = await deps.settings.noticeSettings(context.cooperativeId);
  const changed = INVOICING_NOTICE_FIELDS.filter((field) => current[field] !== next[field]);
  if (changed.length === 0) return next;
  await deps.settings.saveNoticeSettings(context.cooperativeId, next);
  await deps.audit(context.cooperativeId, {
    actorUserId: context.userId,
    action: INVOICING_SETTINGS_CHANGED_ACTION,
    detail: Object.fromEntries(
      changed.map((field) => [field, { from: current[field], to: next[field] }]),
    ),
  });
  return next;
}

/**
 * BR-INV-16: what needs attention, for the badges of the home, and the settings that decide it.
 * Invoices pending or overdue: only the overdue ones with the invoice notice off, those due
 * within its days otherwise. Delivery notes pending invoicing: none with the deadline off, those
 * past it with the notice off, those past it or reaching it within the notice days otherwise.
 */
export async function attentionCounts(deps: AttentionDeps, context: CooperativeContext) {
  requireRead(context);
  const today = deps.today();
  const settings = await deps.settings.noticeSettings(context.cooperativeId);
  const noteWindow = noteAttentionUpTo(today, settings);
  const [invoices, deliveryNotes] = await Promise.all([
    deps.invoices.countDueUntil(context.cooperativeId, invoiceAttentionUntil(today, settings)),
    noteWindow === null
      ? 0
      : deps.staleNotes.countPendingUpTo(context.cooperativeId, noteWindow.upTo),
  ]);
  return { invoices, deliveryNotes, settings };
}
