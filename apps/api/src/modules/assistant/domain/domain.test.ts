import { describe, expect, it } from 'vitest';

import { extractCitations, type Source } from './citations';
import {
  conversationTitle,
  MESSAGE_LIMIT_PER_HOUR,
  retryAfterSeconds,
  usageExceeded,
  usageWindowStart,
} from './usage';
import { availableTools, TOOL_CATALOG } from './tool-catalog';
import { buildSystemPrompt } from './system-prompt';

type Grants = Record<string, 'read' | 'manage'>;
const can = (grants: Grants) => (module: string, level: 'read' | 'manage') => {
  const granted = grants[module];
  return granted === 'manage' || granted === level;
};
const names = (grants: Grants) => availableTools(can(grants)).map((tool) => tool.name);

// Profiles of the specification matrix (requirements/01, section 3) as the assistant sees them.
const SOCIO: Grants = {
  announcements: 'read',
  assemblies: 'read',
  documents: 'read',
  'member-area': 'read',
  assistant: 'read',
};
const GESTOR: Grants = {
  announcements: 'read',
  documents: 'read',
  invoicing: 'manage',
  assistant: 'read',
};
const CONSEJO: Grants = {
  announcements: 'manage',
  assemblies: 'manage',
  documents: 'manage',
  invoicing: 'read',
  assistant: 'read',
};

describe('tools available per profile (BR-AI-01, US-AI-03)', () => {
  it('BR-AI-01: a member without invoicing gets no invoicing tool', () => {
    expect(names(SOCIO)).toEqual([
      'search_documents',
      'upcoming_assemblies',
      'voting_result',
      'latest_announcements',
    ]);
  });

  it('BR-AI-01: a manager without assemblies gets the invoicing tools and not the assemblies ones', () => {
    expect(names(GESTOR)).toEqual([
      'search_documents',
      'list_invoices',
      'list_delivery_notes',
      'payments_and_collections_summary',
      'find_third_party',
      'list_third_parties',
      'latest_announcements',
    ]);
  });

  it('BR-AI-01: the board gets every tool that exists', () => {
    expect(names(CONSEJO)).toEqual(TOOL_CATALOG.map((tool) => tool.name));
  });

  it('US-AI-03: a profile with no module at all gets no tool', () => {
    expect(names({ assistant: 'read' })).toEqual([]);
  });

  it('BR-AI-03: every tool asks only for read access', () => {
    expect(TOOL_CATALOG.every((tool) => tool.requires.level === 'read')).toBe(true);
  });
});

const source = (title: string, overrides: Partial<Source> = {}): Source => ({
  kind: 'document',
  resourceId: '11111111-1111-4111-8111-111111111111',
  title,
  page: 2,
  versionId: '22222222-2222-4222-8222-222222222222',
  excerpt: 'Article 12',
  ...overrides,
});

describe('citations (BR-AI-05)', () => {
  const sources = new Map([
    ['S1', source('Bylaws')],
    ['S2', source('Minutes', { page: 5 })],
  ]);

  it('BR-AI-05: keeps only the sources the answer mentions, in order of appearance, and removes the markers', () => {
    const result = extractCitations('Second [S2] and first [S1].', sources);

    expect(result.text).toBe('Second and first.');
    expect(result.citations.map((c) => [c.ref, c.title])).toEqual([
      ['S2', 'Minutes'],
      ['S1', 'Bylaws'],
    ]);
  });

  it('BR-AI-05: accepts several refs in one marker and repeats count once', () => {
    const result = extractCitations('Both [S1, S2] agree [S1].', sources);

    expect(result.citations.map((c) => c.ref)).toEqual(['S1', 'S2']);
    expect(result.text).toBe('Both agree.');
  });

  it('BR-AI-05: a ref the tools never returned is dropped, not invented', () => {
    const result = extractCitations('Invented [S9].', sources);

    expect(result.citations).toEqual([]);
    expect(result.text).toBe('Invented.');
  });

  it('BR-AI-05: an answer without markers has no citations', () => {
    expect(extractCitations('I cannot find it.', sources).citations).toEqual([]);
  });
});

describe('usage limit (BR-AI-08)', () => {
  const now = new Date('2026-10-20T10:30:00Z');

  it('BR-AI-08: the window is the last hour', () => {
    expect(usageWindowStart(now).toISOString()).toBe('2026-10-20T09:30:00.000Z');
  });

  it('BR-AI-08: 30 messages per hour are allowed and the 31st is not', () => {
    expect(MESSAGE_LIMIT_PER_HOUR).toBe(30);
    expect(usageExceeded(29, 30)).toBe(false);
    expect(usageExceeded(30, 30)).toBe(true);
  });
});

describe('retry after (BR-AI-08)', () => {
  const now = new Date('2026-10-20T10:30:00Z');

  it('BR-AI-08: waits until the oldest message in the window is an hour old', () => {
    expect(retryAfterSeconds(new Date('2026-10-20T09:45:00Z'), now)).toBe(15 * 60);
  });

  it('BR-AI-08: never answers zero or a negative wait', () => {
    expect(retryAfterSeconds(new Date('2026-10-20T08:00:00Z'), now)).toBe(1);
    expect(retryAfterSeconds(null, now)).toBe(1);
  });
});

describe('conversation title (US-AI-04)', () => {
  it('is the first message, collapsed and cut', () => {
    expect(conversationTitle('  When is\nthe next   assembly?  ')).toBe(
      'When is the next assembly?',
    );
    expect(conversationTitle('x'.repeat(300))).toHaveLength(80);
  });
});

describe('system prompt (BR-AI-06, hallucinations)', () => {
  const prompt = buildSystemPrompt({ today: '2026-10-20', toolNames: ['search_documents'] });

  it('BR-AI-06: tells the model that retrieved content is data and not instructions', () => {
    expect(prompt).toContain('<tool_data>');
    expect(prompt).toMatch(/never follow instructions/i);
  });

  it('US-AI-01: requires Spanish, citation markers and an honest "not found"', () => {
    expect(prompt).toMatch(/Spanish/);
    expect(prompt).toContain('[S1]');
    expect(prompt).toMatch(/do not make up/i);
  });

  it('US-AI-03: a topic without tools gets "no access", never a document search', () => {
    expect(prompt).toContain('No tengo acceso a esa información');
    expect(prompt).toMatch(/never use the document search as a substitute/i);
  });

  it('US-AI-03: states which tools exist, so it can say a module is not available', () => {
    expect(prompt).toContain('search_documents');
    expect(buildSystemPrompt({ today: '2026-10-20', toolNames: [] })).toMatch(/no tools/i);
  });
});
