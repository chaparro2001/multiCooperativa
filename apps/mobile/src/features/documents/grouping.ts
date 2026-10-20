import type { DocumentCategory, DocumentSummary } from '@multicooperativa/contracts';

import { i18n } from '@/i18n';

/** Fixed display order of the categories. */
export const DOCUMENT_CATEGORIES: readonly DocumentCategory[] = [
  'bylaws',
  'regulations',
  'minutes',
  'accounts',
  'other',
];

export const categoryTitle = (category: DocumentCategory): string =>
  i18n.t(`enums.documentCategory.${category}`);

/** US-DOC-02: grouped by category (in a fixed order), each group keeps the server's date order. */
export function groupByCategory(
  documents: DocumentSummary[],
): { category: DocumentCategory; title: string; data: DocumentSummary[] }[] {
  return DOCUMENT_CATEGORIES.flatMap((category) => {
    const data = documents.filter((document) => document.category === category);
    return data.length > 0 ? [{ category, title: categoryTitle(category), data }] : [];
  });
}
