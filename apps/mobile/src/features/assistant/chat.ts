import type { Citation, Module } from '@multicooperativa/contracts';

/** Where tapping a citation goes (US-AI-01, requirements/07 section 9). */
export type CitationTarget =
  | { pathname: '/documents/[id]'; params: { id: string; page?: string } }
  | {
      pathname:
        | '/assemblies/[id]'
        | '/announcements/[id]'
        | '/invoices/invoice/[id]'
        | '/invoices/delivery-note/[id]'
        | '/invoices/third-parties/[id]';
      params: { id: string };
    };

/**
 * Documents open at the cited page; assemblies and announcements at their detail; invoices,
 * delivery notes and third parties at their detail in the invoices module.
 */
export function citationTarget(citation: Citation): CitationTarget {
  switch (citation.kind) {
    case 'document':
      return {
        pathname: '/documents/[id]',
        params: {
          id: citation.resourceId,
          ...(citation.page ? { page: String(citation.page) } : {}),
        },
      };
    case 'assembly':
      return { pathname: '/assemblies/[id]', params: { id: citation.resourceId } };
    case 'announcement':
      return { pathname: '/announcements/[id]', params: { id: citation.resourceId } };
    case 'invoice':
      return { pathname: '/invoices/invoice/[id]', params: { id: citation.resourceId } };
    case 'delivery_note':
      return { pathname: '/invoices/delivery-note/[id]', params: { id: citation.resourceId } };
    case 'third_party':
      return { pathname: '/invoices/third-parties/[id]', params: { id: citation.resourceId } };
  }
}

/** The PDF viewer jumps to a page with this fragment. */
export function withPage(url: string, page: string | undefined): string {
  const number = Number(page);
  return Number.isInteger(number) && number > 0 ? `${url}#page=${number}` : url;
}

export type SuggestionKey =
  'documentsQuorum' | 'nextAssembly' | 'latestNews' | 'invoicesDue' | 'owedToSuppliers';

const SUGGESTIONS: { key: SuggestionKey; module: Module }[] = [
  { key: 'documentsQuorum', module: 'documents' },
  { key: 'nextAssembly', module: 'assemblies' },
  { key: 'latestNews', module: 'announcements' },
  { key: 'invoicesDue', module: 'invoicing' },
  { key: 'owedToSuppliers', module: 'invoicing' },
];

/** US-AI-06: only questions about modules the profile can read. */
export function suggestedQuestions(
  permissions: readonly { module: Module }[] | undefined,
): SuggestionKey[] {
  const readable = new Set(permissions?.map((permission) => permission.module));
  return SUGGESTIONS.filter((suggestion) => readable.has(suggestion.module)).map(
    (suggestion) => suggestion.key,
  );
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  rating: 'helpful' | 'not_helpful' | null;
  /** Not saved yet: shown while the answer is awaited. */
  pending?: boolean;
}
