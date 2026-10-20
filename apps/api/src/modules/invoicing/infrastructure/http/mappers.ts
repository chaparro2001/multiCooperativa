import type { DeliveryNote, Invoice, Line } from '@multicooperativa/contracts';

import type { DeliveryNoteRecord, InvoiceRecord } from '../../application/ports/document-stores';
import type { Amounts } from '../../application/documents';
import type { Line as DomainLine } from '../../domain/documents';
import { formatMoney, formatQuantity, formatVatRate } from '../../domain/money';

/** Domain bigints become exact decimal strings for the API (BR-INV-13). */
export const toLine = (line: DomainLine): Line => ({
  concept: line.concept,
  quantity: formatQuantity(line.quantity),
  unit: line.unit,
});

export const toDeliveryNote = (note: DeliveryNoteRecord): DeliveryNote => ({
  id: note.id,
  thirdParty: note.thirdParty,
  operation: note.operation,
  number: note.number,
  date: note.date,
  status: note.status,
  invoiceId: note.invoiceId,
  lines: note.lines.map(toLine),
  fileName: note.file?.name ?? null,
});

export const toInvoice = (invoice: InvoiceRecord): Invoice => ({
  id: invoice.id,
  thirdParty: invoice.thirdParty,
  operation: invoice.operation,
  number: invoice.number,
  issueDate: invoice.issueDate,
  dueDate: invoice.dueDate,
  base: formatMoney(invoice.base),
  vatRate: formatVatRate(invoice.vatRate),
  total: formatMoney(invoice.total),
  paymentStatus: invoice.paymentStatus,
  reconciliationStatus: invoice.reconciliationStatus,
  settledAt: invoice.settledAt,
  discrepancyCount: invoice.discrepancies.length,
});

export const toAmounts = (amounts: Amounts) => ({
  pending: formatMoney(amounts.pending),
  overdue: formatMoney(amounts.overdue),
  pendingCount: amounts.pendingCount,
  overdueCount: amounts.overdueCount,
});
