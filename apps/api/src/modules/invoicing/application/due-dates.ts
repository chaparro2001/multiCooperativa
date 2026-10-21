import type { EventPublisher } from '../../../shared/events';
import { DEFAULT_DUE_SOON_DAYS } from '../domain/documents';
import type { InvoicingEvent } from './events';
import type { DueDatesStore, DueInvoice } from './ports/due-dates-store';

/**
 * US-INV-07, daily process. Idempotent (NFR-INV-04): running it twice the
 * same day changes nothing and emits nothing the second time. The “due soon”
 * window is each cooperative's own number of days (BR-INV-15).
 */
export async function runDueDates(
  deps: { dueDates: DueDatesStore; events: EventPublisher<InvoicingEvent>; now: () => Date },
  today: string,
): Promise<{ overdue: number; dueSoon: number }> {
  const overdue = await deps.dueDates.markOverdue(today);
  const dueSoon = await deps.dueDates.claimDueSoon(today, DEFAULT_DUE_SOON_DAYS);

  const payload = ({ invoiceId, cooperativeId, thirdPartyId, operation, dueDate }: DueInvoice) => ({
    invoiceId,
    cooperativeId,
    thirdPartyId,
    operation,
    dueDate,
  });
  for (const invoice of overdue) {
    await deps.events.publish({
      type: 'InvoiceOverdue',
      occurredAt: deps.now(),
      payload: payload(invoice),
    });
  }
  for (const invoice of dueSoon) {
    await deps.events.publish({
      type: 'InvoiceDueSoon',
      occurredAt: deps.now(),
      payload: payload(invoice),
    });
  }
  return { overdue: overdue.length, dueSoon: dueSoon.length };
}
