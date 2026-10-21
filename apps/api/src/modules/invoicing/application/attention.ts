import { type CooperativeContext, hasAccess, requireAccess } from '../../access';
import { addDays, assertDueSoonDays, staleNoteCutoff } from '../domain/documents';
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
): Promise<{ dueSoonDays: number }> {
  if (!hasAccess(context.permissions, 'users', 'manage')) requireRead(context);
  return { dueSoonDays: await deps.settings.dueSoonDays(context.cooperativeId) };
}

/** BR-INV-15; audited (US-ACC-12). A write that changes nothing leaves no event. */
export async function updateInvoicingSettings(
  deps: Pick<AttentionDeps, 'settings' | 'audit'>,
  context: CooperativeContext,
  input: { dueSoonDays: number },
): Promise<{ dueSoonDays: number }> {
  requireAdministration(context);
  const dueSoonDays = assertDueSoonDays(input.dueSoonDays);
  const current = await deps.settings.dueSoonDays(context.cooperativeId);
  if (current === dueSoonDays) return { dueSoonDays };
  await deps.settings.saveDueSoonDays(context.cooperativeId, dueSoonDays);
  await deps.audit(context.cooperativeId, {
    actorUserId: context.userId,
    action: INVOICING_SETTINGS_CHANGED_ACTION,
    detail: { dueSoonDays: { from: current, to: dueSoonDays } },
  });
  return { dueSoonDays };
}

/**
 * BR-INV-16: what needs attention, for the badges of the home. Invoices
 * pending or overdue, due on or before today plus N days; delivery notes
 * pending invoicing that are older than 30 days or reach it within N days.
 */
export async function attentionCounts(deps: AttentionDeps, context: CooperativeContext) {
  requireRead(context);
  const today = deps.today();
  const days = await deps.settings.dueSoonDays(context.cooperativeId);
  const [invoices, deliveryNotes] = await Promise.all([
    deps.invoices.countDueUntil(context.cooperativeId, addDays(today, days)),
    deps.staleNotes.countPendingUpTo(context.cooperativeId, staleNoteCutoff(today, days)),
  ]);
  return { invoices, deliveryNotes, days };
}
