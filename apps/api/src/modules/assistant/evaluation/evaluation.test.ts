import { describe, expect, it } from 'vitest';

import { TOOL_CATALOG, TOOL_NAMES } from '../domain/tool-catalog';
import { say, ScriptedLanguageModel } from '../application/testing/scripted-language-model';
import { EVALUATION_CASES } from './cases';
import { RuleBasedLanguageModel } from './rule-based-model';
import { check, runEvaluation } from './run-evaluation';

describe('evaluation set (NFR-AI-05)', () => {
  it('NFR-AI-05: has at least 20 questions covering documents, data and permissions', () => {
    expect(EVALUATION_CASES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(EVALUATION_CASES.map((c) => c.id)).size).toBe(EVALUATION_CASES.length);
    const specs = EVALUATION_CASES.map((c) => c.spec).join(' ');
    for (const spec of ['US-AI-01', 'US-AI-02', 'US-AI-03', 'BR-AI-05', 'BR-AI-06']) {
      expect(specs).toContain(spec);
    }
  });

  it('NFR-AI-05: every tool has a positive case, and every tool a profile may lack has a denial case', () => {
    // Tools every predefined profile gets (documents, announcements, own capital) need no denial.
    const forEveryone = new Set(['search_documents', 'latest_announcements', 'my_contributions']);
    for (const name of TOOL_NAMES) {
      expect(
        EVALUATION_CASES.some((c) => c.tools.includes(name)),
        `no positive case for ${name}`,
      ).toBe(true);
      if (forEveryone.has(name)) continue;
      expect(
        EVALUATION_CASES.some((c) => c.forbiddenTools?.includes(name)),
        `no denial case for ${name}`,
      ).toBe(true);
    }
    expect(TOOL_CATALOG.map((tool) => tool.name)).toEqual([...TOOL_NAMES]);
  });

  it('US-AI-08: relative periods and cited figures are part of the set', () => {
    const periods = EVALUATION_CASES.filter((c) => c.spec.includes('period'));
    expect(periods.length).toBeGreaterThanOrEqual(5);
    expect(
      EVALUATION_CASES.filter((c) => c.spec.includes('BR-AI-05') && c.cites.length > 0).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('NFR-AI-05: every question passes through the real pipeline with the rule-based model', async () => {
    const results = await runEvaluation({ model: new RuleBasedLanguageModel() });

    const failed = results.filter((result) => !result.passed);
    expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
    expect(results).toHaveLength(EVALUATION_CASES.length);
  });

  it('the checks do fail: a model that answers from memory without tools scores badly', async () => {
    const results = await runEvaluation({
      model: new ScriptedLanguageModel(() => say('El quórum es de dos tercios, SEA-SECRET.')),
    });

    expect(results.filter((result) => result.passed).length).toBeLessThan(5);
  });

  it('BR-AI-05: a document answer without a citation fails the check', () => {
    const quorum = EVALUATION_CASES.find((c) => c.id === 'doc-quorum')!;

    const failures = check(quorum, {
      text: 'La mitad más uno',
      tools: ['search_documents'],
      citationKinds: [],
    });

    expect(failures).toEqual(['missing a document citation']);
  });

  it('US-AI-02: a fact may be written in its Spanish form (121,00 instead of 121.00)', () => {
    const due = EVALUATION_CASES.find((c) => c.id === 'inv-due-week')!;
    const outcome = { tools: ['list_invoices'], citationKinds: ['invoice'] };

    expect(check(due, { ...outcome, text: 'La F-77 vence: 121,00 € [S1]' })).toEqual([]);
    expect(check(due, { ...outcome, text: 'La F-77 vence: 121.00 € [S1]' })).toEqual([]);
    expect(check(due, { ...outcome, text: 'La F-77 vence [S1]' })).toEqual([
      'answer lacks "121.00|121,00"',
    ]);
  });
});
