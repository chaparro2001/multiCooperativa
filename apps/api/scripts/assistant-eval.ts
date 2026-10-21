import { loadEnv } from '../src/config/env';
import {
  createGeminiLanguageModel,
  createOllamaLanguageModel,
  EVALUATION_CASES,
  RuleBasedLanguageModel,
  runEvaluation,
} from '../src/modules/assistant';

/**
 * NFR-AI-05: runs the evaluation set against the real model: Gemini (needs GEMINI_API_KEY) or, with ASSISTANT_LLM_PROVIDER=ollama,
 * the local Ollama model ASSISTANT_OLLAMA_MODEL (latency per question is printed).
 * With `--offline` it uses the rule-based stand-in, which is what the unit tests run in CI.
 *
 *   pnpm --filter @multicooperativa/api ai:eval [--offline] [--pause=4000] [--only=id1,id2]
 *
 * The free tier has low rate limits: `--pause` spaces the questions out (milliseconds)
 * and `--only` runs just the cases with those ids.
 */
const offline = process.argv.includes('--offline');
const pause = Number(process.argv.find((arg) => arg.startsWith('--pause='))?.split('=')[1] ?? 0);

const only = process.argv
  .find((arg) => arg.startsWith('--only='))
  ?.split('=')[1]
  ?.split(',');
const cases = only ? EVALUATION_CASES.filter((c) => only.includes(c.id)) : EVALUATION_CASES;
if (cases.length === 0) {
  console.error(`No evaluation case matches --only=${only?.join(',')}`);
  process.exit(2);
}

const env = loadEnv({
  DATABASE_URL: 'postgresql://unused/unused',
  JWT_SECRET: 'x'.repeat(32),
  ...process.env,
});
const useOllama = env.ASSISTANT_LLM_PROVIDER === 'ollama';
if (!offline && !useOllama && !env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY is not set. Use --offline to run with the rule-based model.');
  process.exit(2);
}

const label = offline
  ? 'offline'
  : useOllama
    ? `ollama ${env.ASSISTANT_OLLAMA_MODEL}`
    : env.GEMINI_MODEL;
const model = offline
  ? new RuleBasedLanguageModel()
  : useOllama
    ? createOllamaLanguageModel({
        url: env.OLLAMA_URL,
        model: env.ASSISTANT_OLLAMA_MODEL,
        timeoutMs: env.ASSISTANT_OLLAMA_TIMEOUT_MS,
      })
    : createGeminiLanguageModel({
        apiKey: env.GEMINI_API_KEY!,
        model: env.GEMINI_MODEL,
        fallbackModels: env.GEMINI_FALLBACK_MODELS,
      });

const results = await runEvaluation({ model, cases, pauseMs: pause });
for (const result of results) {
  console.log(
    `${result.passed ? 'PASS' : 'FAIL'}  ${result.id} (${result.spec}) ${(result.durationMs / 1000).toFixed(1)}s calls=${result.modelCalls} in=${result.inputTokens} out=${result.outputTokens}`,
  );
  for (const failure of result.failures) console.log(`      - ${failure}`);
  if (only) console.log(`      answer: ${result.answer}`);
}
const passed = results.filter((result) => result.passed).length;
console.log(`\n${passed}/${cases.length} questions passed (${label})`);
const times = results.map((result) => result.durationMs).sort((a, b) => a - b);
const at = (q: number) =>
  ((times[Math.min(times.length - 1, Math.ceil(q * times.length) - 1)] ?? 0) / 1000).toFixed(1);
console.log(`latency per question: median ${at(0.5)} s, p90 ${at(0.9)} s, max ${at(1)} s`);
process.exit(passed === cases.length ? 0 : 1);
