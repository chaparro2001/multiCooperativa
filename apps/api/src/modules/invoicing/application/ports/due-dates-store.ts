import type { Operation } from '../../domain/documents';

export interface DueInvoice {
  cooperativeId: string;
  thirdPartyId: string;
  operation: Operation;
  invoiceId: string;
  dueDate: string;
}

/**
 * Platform-wide on purpose: the daily process covers every cooperative.
 * Both methods are idempotent and return only what changed this time (NFR-INV-04).
 */
export interface DueDatesStore {
  /** BR-INV-09: pending with a due date before today → overdue; records the notice. */
  markOverdue(today: string): Promise<DueInvoice[]>;
  /** Pending and due between `from` and `until`: claims the “due soon” notice once. */
  claimDueSoon(from: string, until: string): Promise<DueInvoice[]>;
}
