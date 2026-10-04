import type { Line } from './documents';

/** RN-FAC-08: 1 % by default, configurable per cooperative. */
export const DEFAULT_TOLERANCE_BASIS_POINTS = 100;

export type ReconciliationStatus = 'sin_albaranes' | 'conciliada' | 'con_discrepancia';

export interface Discrepancy {
  concept: string;
  unit: string;
  /** Thousandths. */
  deliveredQuantity: bigint;
  invoicedQuantity: bigint;
}

export interface Reconciliation {
  status: ReconciliationStatus;
  discrepancies: Discrepancy[];
}

/** «Aceite de oliva» and «aceite  de OLIVA» are the same concept. */
const keyOf = (line: Line) =>
  [line.concept, line.unit]
    .map((part) =>
      part.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(),
    )
    .join('|');

function totals(lines: readonly Line[]) {
  const byKey = new Map<string, { concept: string; unit: string; quantity: bigint }>();
  for (const line of lines) {
    const key = keyOf(line);
    const current = byKey.get(key);
    if (current) current.quantity += line.quantity;
    else byKey.set(key, { concept: line.concept, unit: line.unit, quantity: line.quantity });
  }
  return byKey;
}

/**
 * HU-FAC-04: compares invoiced quantities with delivered ones per concept and
 * unit. The numeric rule decides; an AI only writes the explanation (RN-FAC-12).
 */
export function reconcile(input: {
  invoiceLines: readonly Line[];
  /** Null when the invoice groups no delivery notes. */
  noteLines: readonly Line[] | null;
  toleranceBasisPoints: number;
}): Reconciliation {
  if (input.noteLines === null) return { status: 'sin_albaranes', discrepancies: [] };

  const invoiced = totals(input.invoiceLines);
  const delivered = totals(input.noteLines);
  const tolerance = BigInt(input.toleranceBasisPoints);
  const discrepancies: Discrepancy[] = [];

  for (const key of new Set([...invoiced.keys(), ...delivered.keys()])) {
    const inv = invoiced.get(key);
    const del = delivered.get(key);
    const invoicedQuantity = inv?.quantity ?? 0n;
    const deliveredQuantity = del?.quantity ?? 0n;
    const difference =
      invoicedQuantity > deliveredQuantity
        ? invoicedQuantity - deliveredQuantity
        : deliveredQuantity - invoicedQuantity;
    // Only on one side, or |invoiced − delivered| / delivered > tolerance (exact: × 10 000).
    const outOfTolerance = !inv || !del || difference * 10000n > tolerance * deliveredQuantity;
    if (outOfTolerance) {
      const { concept, unit } = (inv ?? del)!;
      discrepancies.push({ concept, unit, deliveredQuantity, invoicedQuantity });
    }
  }

  return { status: discrepancies.length > 0 ? 'con_discrepancia' : 'conciliada', discrepancies };
}
