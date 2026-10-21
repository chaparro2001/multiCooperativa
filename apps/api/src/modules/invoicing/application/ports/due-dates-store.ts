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
  /**
   * Pending and due between `today` and `today` plus the notice days of the
   * invoice's cooperative, only when its invoice notice is on (`defaults` when it
   * never chose, BR-INV-15): claims the “due soon” notice once.
   */
  claimDueSoon(today: string, defaults: { enabled: boolean; days: number }): Promise<DueInvoice[]>;
}
