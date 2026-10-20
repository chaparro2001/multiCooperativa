import type { DomainEvent } from '../../../shared/events';
import type { Operation } from '../domain/documents';

type Ref = { cooperativeId: string; thirdPartyId: string; operation: Operation };

/** Requisitos/05, section 7. */
export type DeliveryNoteRegistered = DomainEvent<
  'DeliveryNoteRegistered',
  Ref & { deliveryNoteId: string }
>;
export type InvoiceRegistered = DomainEvent<'InvoiceRegistered', Ref & { invoiceId: string }>;
/** Consumed by notifications and by the AI explanation of the differences. */
export type DiscrepancyDetected = DomainEvent<'DiscrepancyDetected', Ref & { invoiceId: string }>;
export type InvoiceDueSoon = DomainEvent<
  'InvoiceDueSoon',
  Ref & { invoiceId: string; dueDate: string }
>;
export type InvoiceOverdue = DomainEvent<
  'InvoiceOverdue',
  Ref & { invoiceId: string; dueDate: string }
>;

export type InvoicingEvent =
  | DeliveryNoteRegistered
  | InvoiceRegistered
  | DiscrepancyDetected
  | InvoiceDueSoon
  | InvoiceOverdue;
