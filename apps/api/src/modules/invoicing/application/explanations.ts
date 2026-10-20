import type { CooperativeContext } from '../../access';
import { formatQuantity } from '../domain/money';
import { NotFoundError } from './errors';
import type { InvoiceRecord, InvoiceStore } from './ports/document-stores';
import type { DiscrepancyExplainer } from './ports/discrepancy-explainer';
import { requireRead, UUID } from './shared';

export interface ExplanationDeps {
  invoices: InvoiceStore;
  explainer: DiscrepancyExplainer;
}

const MAX_TEXT = 500;

/**
 * US-INV-04: fills in the AI-drafted explanation of the differences that do not have one yet.
 * It never changes the reconciliation (BR-INV-12) and, if the explainer is not available or
 * answers something unusable, leaves the explanations empty: the numeric detail still stands.
 */
export async function explainDiscrepancies(
  deps: ExplanationDeps,
  context: CooperativeContext,
  invoiceId: string,
): Promise<InvoiceRecord> {
  requireRead(context);
  const invoice = UUID.test(invoiceId)
    ? await deps.invoices.find(context.cooperativeId, invoiceId)
    : null;
  if (!invoice) throw new NotFoundError();

  const pending = invoice.discrepancies.filter((d) => !d.explanation);
  if (pending.length === 0) return invoice;

  let texts: string[] | null = null;
  try {
    texts = await deps.explainer.explain(
      pending.map((d) => ({
        concept: d.concept,
        unit: d.unit,
        deliveredQuantity: formatQuantity(d.deliveredQuantity),
        invoicedQuantity: formatQuantity(d.invoicedQuantity),
      })),
    );
  } catch {
    texts = null;
  }
  if (!texts || texts.length !== pending.length) return invoice;

  const drafts = pending.flatMap((d, i) => {
    const text = texts[i]?.trim().slice(0, MAX_TEXT);
    return text ? [{ id: d.id, text }] : [];
  });
  if (drafts.length === 0) return invoice;
  await deps.invoices.saveExplanations(context.cooperativeId, invoice.id, drafts);
  return (await deps.invoices.find(context.cooperativeId, invoice.id)) ?? invoice;
}
