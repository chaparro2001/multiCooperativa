import type { Citation } from '@multicooperativa/contracts';
import { describe, expect, it } from 'vitest';

import { citationTarget, suggestedQuestions, withPage } from './chat';

const citation = (overrides: Partial<Citation>): Citation => ({
  ref: 'S1',
  kind: 'document',
  resourceId: '11111111-1111-4111-8111-111111111111',
  title: 'Bylaws',
  page: 4,
  versionId: null,
  excerpt: null,
  ...overrides,
});

describe('citation links (US-AI-01, US-AI-02)', () => {
  it('US-AI-01: a document citation opens the document at the cited page', () => {
    expect(citationTarget(citation({}))).toEqual({
      pathname: '/documents/[id]',
      params: { id: '11111111-1111-4111-8111-111111111111', page: '4' },
    });
  });

  it('US-AI-02: assemblies and announcements open their detail', () => {
    expect(citationTarget(citation({ kind: 'assembly', page: null })).pathname).toBe(
      '/assemblies/[id]',
    );
    expect(citationTarget(citation({ kind: 'announcement', page: null })).pathname).toBe(
      '/announcements/[id]',
    );
  });

  it('US-AI-02: invoices, delivery notes and third parties open their detail screen', () => {
    const cases = [
      ['invoice', '/invoices/invoice/[id]'],
      ['delivery_note', '/invoices/delivery-note/[id]'],
      ['third_party', '/invoices/third-parties/[id]'],
    ] as const;
    for (const [kind, pathname] of cases) {
      const target = citationTarget(citation({ kind, page: null }));
      expect(target.pathname).toBe(pathname);
      expect(target.params).toEqual({ id: '11111111-1111-4111-8111-111111111111' });
    }
  });

  it('the viewer link jumps to the page only when it is a valid one', () => {
    expect(withPage('https://files/doc.pdf', '4')).toBe('https://files/doc.pdf#page=4');
    expect(withPage('https://files/doc.pdf', undefined)).toBe('https://files/doc.pdf');
    expect(withPage('https://files/doc.pdf', 'abc')).toBe('https://files/doc.pdf');
    expect(withPage('https://files/doc.pdf', '0')).toBe('https://files/doc.pdf');
  });
});

describe('suggested questions (US-AI-06)', () => {
  it('US-AI-06: a member sees questions about documents, assemblies and announcements only', () => {
    const member = [
      { module: 'documents' },
      { module: 'assemblies' },
      { module: 'announcements' },
      { module: 'assistant' },
    ] as const;

    expect(suggestedQuestions(member)).toEqual(['documentsQuorum', 'nextAssembly', 'latestNews']);
  });

  it('US-AI-06: a manager with invoicing also gets the invoicing questions', () => {
    expect(suggestedQuestions([{ module: 'documents' }, { module: 'invoicing' }])).toEqual([
      'documentsQuorum',
      'invoicesDue',
      'owedToSuppliers',
    ]);
  });

  it('US-AI-06: no permissions yet, no suggestions', () => {
    expect(suggestedQuestions(undefined)).toEqual([]);
  });
});
