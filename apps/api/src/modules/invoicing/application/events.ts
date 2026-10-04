import type { DomainEvent } from '../../../shared/events';
import type { Operation } from '../domain/documents';

type Ref = { cooperativeId: string; thirdPartyId: string; operation: Operation };

/** Requisitos/05, section 7. */
export type DeliveryNoteRegistered = DomainEvent<
  'AlbaranRegistrado',
  Ref & { deliveryNoteId: string }
>;
export type InvoiceRegistered = DomainEvent<'FacturaRegistrada', Ref & { invoiceId: string }>;
/** Consumed by notifications and by the AI explanation of the differences. */
export type DiscrepancyDetected = DomainEvent<'DiscrepanciaDetectada', Ref & { invoiceId: string }>;
export type InvoiceDueSoon = DomainEvent<
  'FacturaProximaAVencer',
  Ref & { invoiceId: string; dueDate: string }
>;
export type InvoiceOverdue = DomainEvent<
  'FacturaVencida',
  Ref & { invoiceId: string; dueDate: string }
>;

export type InvoicingEvent =
  | DeliveryNoteRegistered
  | InvoiceRegistered
  | DiscrepancyDetected
  | InvoiceDueSoon
  | InvoiceOverdue;
