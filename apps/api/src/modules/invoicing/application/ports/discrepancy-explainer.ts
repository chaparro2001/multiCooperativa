/** One numeric difference between an invoice and its delivery notes, as decimal strings. */
export interface DiscrepancyFact {
  concept: string;
  unit: string;
  deliveredQuantity: string;
  invoicedQuantity: string;
}

/**
 * Drafts a plain-language explanation of each difference (US-INV-04). The numeric
 * detail governs (BR-INV-12): the explainer never decides the reconciliation, and it only
 * ever sees concepts, units and quantities, never who the third party is.
 */
export interface DiscrepancyExplainer {
  /** One text per fact, in the same order; null when it cannot be drafted right now. */
  explain(facts: DiscrepancyFact[]): Promise<string[] | null>;
}
