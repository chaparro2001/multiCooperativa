import type { CooperativeContext } from '../application/data-sources';
import { createConversation, sendMessage, type RequestMetrics } from '../application/assistant';
import type { LanguageModel } from '../application/ports/language-model';
import { InMemoryConversationStore } from '../application/testing/in-memory-conversation-store';
import { createToolExecutors } from '../application/tool-executors';
import { createCannedSources, EVAL_COOPERATIVE } from './canned-sources';
import { EVALUATION_CASES, type EvalCase, type EvalProfile } from './cases';

type Grants = Record<string, 'read' | 'manage'>;

/** The predefined profiles' permissions in the assistant's modules (requirements/01, section 3). */
const PROFILES: Record<EvalProfile, Grants> = {
  member: {
    announcements: 'read',
    assemblies: 'read',
    documents: 'read',
    'member-area': 'read',
    assistant: 'read',
  },
  manager: {
    announcements: 'read',
    documents: 'read',
    invoicing: 'manage',
    'member-area': 'manage',
    assistant: 'read',
  },
  board: {
    announcements: 'manage',
    assemblies: 'manage',
    documents: 'manage',
    invoicing: 'read',
    'member-area': 'read',
    assistant: 'read',
  },
};

function contextFor(profile: EvalProfile): CooperativeContext {
  return {
    userId: `user-${profile}`,
    sessionId: 'session',
    cooperativeId: EVAL_COOPERATIVE,
    membershipId: `membership-${profile}`,
    profileName: profile,
    isPartner: profile === 'member',
    permissions: Object.entries(PROFILES[profile]).map(([module, level]) => ({
      module,
      level,
      // Only the member profile reads its own data in the member area (requirements/01, section 3).
      scope: profile === 'member' && module === 'member-area' ? 'own' : 'all',
    })),
  } as CooperativeContext;
}

const plain = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export interface EvalResult {
  id: string;
  spec: string;
  passed: boolean;
  failures: string[];
  answer: string;
  durationMs: number;
  modelCalls?: number;
  inputTokens?: number;
  outputTokens?: number;
}

/** What a case demands of an answer that was produced (or why none was). */
export function check(
  evalCase: EvalCase,
  outcome: { text: string; tools: string[]; citationKinds: string[] },
): string[] {
  const failures: string[] = [];
  const text = plain(outcome.text);
  for (const tool of evalCase.tools) {
    if (!outcome.tools.includes(tool)) failures.push(`did not use ${tool}`);
  }
  for (const tool of evalCase.forbiddenTools ?? []) {
    if (outcome.tools.includes(tool)) failures.push(`tried forbidden tool ${tool}`);
  }
  if (evalCase.cites.length === 0 && outcome.citationKinds.length > 0) {
    failures.push(`cited ${outcome.citationKinds.join(', ')} but nothing should be cited`);
  }
  for (const kind of evalCase.cites) {
    if (!outcome.citationKinds.includes(kind)) failures.push(`missing a ${kind} citation`);
  }
  for (const fact of evalCase.mustContain ?? []) {
    // "a|b": any of the alternatives (a model may write 121,00 or 1 de diciembre for 121.00 or 2026-12-01).
    const alternatives = fact.split('|').map(plain);
    if (!alternatives.some((alternative) => text.includes(alternative))) {
      failures.push(`answer lacks "${fact}"`);
    }
  }
  for (const leak of evalCase.mustNotContain ?? []) {
    if (text.includes(plain(leak))) failures.push(`answer contains "${leak}"`);
  }
  return failures;
}

/**
 * Runs the evaluation set (NFR-AI-05) through the real use case with fixed data:
 * permissions, tool loop, citations and isolation are the production code; only the model
 * and the data sources are the ones given. Cases run one after the other, optionally
 * spaced out for providers with low rate limits.
 */
export async function runEvaluation(options: {
  model: LanguageModel;
  cases?: readonly EvalCase[];
  pauseMs?: number;
}): Promise<EvalResult[]> {
  const conversations = new InMemoryConversationStore();
  const deps = {
    conversations,
    model: options.model,
    executors: createToolExecutors(createCannedSources()),
    now: () => new Date('2026-10-20T10:00:00Z'),
    today: () => '2026-10-20',
    // Each case has its own conversation; the limit must not get in the way of 20 questions.
    messageLimitPerHour: 1000,
    onMetrics: (metrics: RequestMetrics) => (captured.metrics = metrics),
  };
  const captured: { metrics?: RequestMetrics } = {};
  const lastMetrics = () => captured.metrics;
  const results: EvalResult[] = [];
  for (const evalCase of options.cases ?? EVALUATION_CASES) {
    const context = contextFor(evalCase.profile);
    const started = Date.now();
    captured.metrics = undefined;
    try {
      const conversation = await createConversation(deps, context);
      const { answer } = await sendMessage(deps, context, conversation.id, evalCase.question);
      const failures = check(evalCase, {
        text: answer.content,
        tools: answer.tools,
        citationKinds: answer.citations.map((citation) => citation.kind),
      });
      results.push({
        id: evalCase.id,
        spec: evalCase.spec,
        passed: failures.length === 0,
        failures,
        answer: answer.content,
        durationMs: Date.now() - started,
        modelCalls: lastMetrics()?.modelCalls,
        inputTokens: lastMetrics()?.inputTokens,
        outputTokens: lastMetrics()?.outputTokens,
      });
    } catch (error) {
      results.push({
        id: evalCase.id,
        spec: evalCase.spec,
        passed: false,
        failures: [`error: ${error instanceof Error ? error.message : String(error)}`],
        answer: '',
        durationMs: Date.now() - started,
      });
    }
    if (options.pauseMs) await new Promise((resolve) => setTimeout(resolve, options.pauseMs));
  }
  return results;
}
