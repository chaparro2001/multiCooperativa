import type { DocumentCategory, DocumentSummary } from '@multicooperativa/contracts';

export const CATEGORY_TITLES: Record<DocumentCategory, string> = {
  estatutos: 'Estatutos',
  reglamento: 'Reglamento interno',
  actas: 'Actas',
  cuentas: 'Cuentas anuales',
  otros: 'Otros',
};

const ORDER = Object.keys(CATEGORY_TITLES) as DocumentCategory[];

/** HU-DOC-02: grouped by category (in a fixed order), each group keeps the server's date order. */
export function groupByCategory(
  documents: DocumentSummary[],
): { category: DocumentCategory; title: string; data: DocumentSummary[] }[] {
  return ORDER.flatMap((category) => {
    const data = documents.filter((document) => document.category === category);
    return data.length > 0 ? [{ category, title: CATEGORY_TITLES[category], data }] : [];
  });
}
