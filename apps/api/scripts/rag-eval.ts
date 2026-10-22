import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { createTestPrismaFor } from './rag-eval-database';
import { loadEnv } from '../src/config/env';
import { createAccessModule } from '../src/modules/access';
import { createGeminiClient } from '../src/modules/invoicing';
import {
  computeMetrics,
  firstHitRank,
  GeminiEmbedder,
  indexBenchmarkCorpus,
  OllamaEmbedder,
  RETRIEVAL_CASES,
  RETRIEVAL_CORPUS,
  searchBenchmarkCases,
  type BenchmarkArm,
  type CaseResult,
  type Embedder,
  type RetrievalMetrics,
} from '../src/modules/documents';
import { InMemoryFileStorage } from '../src/shared/files/in-memory-file-storage';

/**
 * NFR-DOC-05: retrieval benchmark. Runs the REAL pipeline (unpdf, chunking, embeddings, pgvector
 * hybrid search) over the benchmark corpus and the golden set, and prints hit@1, hit@5, MRR and
 * no-answer precision per arm (vector, text, hybrid). Needs `pnpm db:up`.
 *
 *   pnpm --filter @multicooperativa/api rag:eval [--label=step1] [--sweep] [--pause=2500] [--provider=gemini|ollama]
 *
 * Provider: Gemini by default (`--provider=ollama` for the local model). Gemini needs
 * GEMINI_API_KEY (never printed) and respects the free tier: embeddings are cached on disk by
 * model, kind and text, so a re-run only embeds what changed, and uncached texts go in small
 * groups separated by `--pause` milliseconds. It writes to the `multicooperativa_test` database
 * (emptied first, like the integration tests) and the JSON results to `rag-eval-results/` (gitignored).
 * `--sweep` also prints hybrid metrics for a grid of similarity thresholds.
 */
const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const label = arg('label') ?? 'run';
const pause = Number(arg('pause') ?? 2500);
const sweep = process.argv.includes('--sweep');

const env = loadEnv({
  DATABASE_URL: 'postgresql://unused/unused',
  JWT_SECRET: 'x'.repeat(32),
  ...process.env,
  // Gemini is the measured provider; `--provider=ollama` is optional.
  EMBEDDINGS_PROVIDER: arg('provider') ?? 'gemini',
});

const RESULTS_DIR = 'rag-eval-results';
mkdirSync(RESULTS_DIR, { recursive: true });

const model =
  env.EMBEDDINGS_PROVIDER === 'gemini' ? env.GEMINI_EMBEDDING_MODEL : env.EMBEDDING_MODEL;
const cachePath = `${RESULTS_DIR}/embedding-cache-${env.EMBEDDINGS_PROVIDER}-${model}.json`;
const cache: Record<string, number[]> = existsSync(cachePath)
  ? JSON.parse(readFileSync(cachePath, 'utf8'))
  : {};
const saveCache = () => writeFileSync(cachePath, JSON.stringify(cache));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Caches vectors on disk and spaces the uncached requests out (free-tier rate limits). */
class CachingEmbedder implements Embedder {
  fresh = 0;
  constructor(private readonly inner: Embedder) {}
  async embed(texts: string[], kind: 'document' | 'query' = 'document') {
    const key = (text: string) => createHash('sha256').update(`${kind}\n${text}`).digest('hex');
    const missing = texts.filter((text) => !cache[key(text)]);
    const unique = [...new Set(missing)];
    for (let start = 0; start < unique.length; start += 4) {
      const group = unique.slice(start, start + 4);
      const vectors = await this.inner.embed(group, kind);
      group.forEach((text, i) => (cache[key(text)] = vectors[i]!));
      this.fresh += group.length;
      saveCache();
      if (start + 4 < unique.length) await sleep(pause);
    }
    return texts.map((text) => cache[key(text)]!);
  }
}

let inner: Embedder;
if (env.EMBEDDINGS_PROVIDER === 'gemini') {
  if (!env.GEMINI_API_KEY) {
    console.error('EMBEDDINGS_PROVIDER=gemini needs GEMINI_API_KEY in apps/api/.env.');
    process.exit(2);
  }
  inner = new GeminiEmbedder(createGeminiClient(env.GEMINI_API_KEY), env.GEMINI_EMBEDDING_MODEL);
} else {
  inner = new OllamaEmbedder({ url: env.OLLAMA_URL, model: env.EMBEDDING_MODEL });
}
const embedder = new CachingEmbedder(inner);

// The benchmark owns the test database: it empties it, like the integration tests.
const url = new URL(env.DATABASE_URL);
if (!url.pathname.endsWith('_test')) url.pathname = `${url.pathname}_test`;
execSync('pnpm exec prisma migrate deploy', {
  stdio: 'pipe',
  env: { ...process.env, DATABASE_URL: url.toString() },
});
const { prisma, resetDatabase } = createTestPrismaFor(url.toString());
await resetDatabase();

const access = createAccessModule({
  prisma,
  jwtSecret: 'x'.repeat(32),
  invitationSender: { send: async () => {} },
});
const { cooperativeId } = await access.provisionCooperative({
  name: 'RAG benchmark',
  cif: 'F12345674',
  admin: { email: 'admin@rag.test', name: 'Ana', password: 'una-clave-larga' },
});

// Real indexing path: files -> unpdf -> chunking -> embeddings -> pgvector.
const started = Date.now();
const { chunks: chunkCount } = await indexBenchmarkCorpus({
  prisma,
  cooperativeId,
  embedder,
  files: new InMemoryFileStorage(),
  thresholds: { vector: env.EMBEDDING_MIN_SCORE!, text: env.EMBEDDING_TEXT_MIN_SCORE! },
});
const indexingMs = Date.now() - started;

// Queries are embedded once; every arm and threshold reuses them.
await embedder.embed(
  RETRIEVAL_CASES.map((c) => c.question.trim()),
  'query',
);

const bestScores = new Map<string, number>();
async function run(
  arm: BenchmarkArm,
  minVector: number,
  minText: number,
): Promise<(CaseResult & { contextChars: number })[]> {
  const results = await searchBenchmarkCases(
    { prisma, cooperativeId, embedder },
    { arm, minVector, minText },
  );
  if (arm === 'vector' && minVector === 0)
    for (const r of results) bestScores.set(r.testCase.id, Math.max(0, ...r.scores));
  return results;
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const row = (name: string, m: RetrievalMetrics, context: number) =>
  `${name.padEnd(10)} ${pct(m.hitAt1).padStart(7)} ${pct(m.hitAt5).padStart(7)} ${m.mrr.toFixed(3).padStart(7)} ${pct(m.noAnswerPrecision).padStart(9)} ${pct(m.answeredShare).padStart(9)} ${String(context).padStart(9)}`;
const meanChars = (results: CaseResult[]) =>
  Math.round(
    results.reduce((sum, r) => sum + r.fragments.reduce((s, f) => s + f.content.length, 0), 0) /
      results.length,
  );
/** Average number of distinct documents among the returned fragments of answerable questions. */
const meanDocuments = (results: CaseResult[]) => {
  const answered = results.filter((r) => r.testCase.expected.length > 0 && r.fragments.length > 0);
  return (
    answered.reduce((sum, r) => sum + new Set(r.fragments.map((f) => f.title)).size, 0) /
    Math.max(1, answered.length)
  );
};
const meanContextChars = (results: { contextChars: number }[]) =>
  Math.round(results.reduce((sum, r) => sum + r.contextChars, 0) / results.length);

console.log(
  `\nRAG retrieval benchmark [${label}] provider=${env.EMBEDDINGS_PROVIDER} model=${model}\n` +
    `corpus: ${RETRIEVAL_CORPUS.length} documents, ${chunkCount} chunks; cases: ${RETRIEVAL_CASES.length} ` +
    `(thresholds vector=${env.EMBEDDING_MIN_SCORE} text=${env.EMBEDDING_TEXT_MIN_SCORE}); ` +
    `indexing ${(indexingMs / 1000).toFixed(1)}s, ${embedder.fresh} texts embedded fresh\n`,
);
console.log(
  'arm          hit@1   hit@5     MRR  no-answer  answered  ctx chars  model ctx  docs@5',
);
const byArm: Record<string, { metrics: RetrievalMetrics; contextChars: number }> = {};
let hybrid: CaseResult[] = [];
for (const arm of ['vector', 'text', 'hybrid'] as const) {
  const results = await run(arm, env.EMBEDDING_MIN_SCORE!, env.EMBEDDING_TEXT_MIN_SCORE!);
  if (arm === 'hybrid') hybrid = results;
  const metrics = computeMetrics(results);
  byArm[arm] = { metrics, contextChars: meanChars(results) };
  console.log(
    `${row(arm, metrics, meanChars(results))} ${String(meanContextChars(results)).padStart(10)} ${meanDocuments(results).toFixed(2).padStart(7)}`,
  );
}

console.log('\nHybrid misses (rank of the expected fragment, or the unwanted results):');
for (const r of hybrid) {
  const rank = firstHitRank(r.fragments, r.testCase);
  const answerable = r.testCase.expected.length > 0;
  if (answerable ? rank !== 1 : r.fragments.length > 0)
    console.log(
      `  ${r.testCase.id} ${r.testCase.question} -> ${answerable ? (rank ?? 'miss') : `${r.fragments.length} unwanted`}`,
    );
}

const sweepRows: { vector: number; text: number; score: number; metrics: RetrievalMetrics }[] = [];
if (sweep) {
  // Best cosine of every question against the corpus: where answerable and unanswerable ones fall.
  const best = await run('vector', 0, 0);
  const scores = (answerable: boolean) =>
    best
      .filter((r) => r.testCase.expected.length > 0 === answerable)
      .map((r) => bestScores.get(r.testCase.id) ?? 0)
      .sort((x, y) => x - y);
  const summary = (values: number[]) =>
    `min ${values[0]!.toFixed(2)}  median ${values[Math.floor(values.length / 2)]!.toFixed(2)}  max ${values[values.length - 1]!.toFixed(2)}`;
  console.log(`\nBest cosine per question: answerable ${summary(scores(true))}`);
  console.log(`                          unanswerable ${summary(scores(false))}`);

  const steps = Array.from({ length: 14 }, (_, i) => Math.round((0.2 + i * 0.05) * 100) / 100);
  for (const vector of steps) {
    for (const text of steps.filter((t) => t <= vector)) {
      const metrics = computeMetrics(await run('hybrid', vector, text));
      const score = (metrics.hitAt5 + metrics.mrr + metrics.noAnswerPrecision) / 3;
      sweepRows.push({ vector, text, score, metrics });
    }
  }
  const top = [...sweepRows].sort(
    (a, b) => b.score - a.score || b.vector - a.vector || b.text - a.text,
  );
  console.log('\nThreshold sweep (hybrid), best 10 by mean(hit@5, MRR, no-answer):');
  console.log('  vector  text |  hit@1  hit@5    MRR  no-answer | score');
  for (const r of top.slice(0, 10))
    console.log(
      `  ${r.vector.toFixed(2)}  ${r.text.toFixed(2)} | ${pct(r.metrics.hitAt1).padStart(6)} ${pct(r.metrics.hitAt5).padStart(6)} ${r.metrics.mrr.toFixed(3)} ${pct(r.metrics.noAnswerPrecision).padStart(9)} | ${r.score.toFixed(3)}`,
    );
}

const file = `${RESULTS_DIR}/${label}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(
  file,
  JSON.stringify(
    {
      label,
      provider: env.EMBEDDINGS_PROVIDER,
      model,
      thresholds: { vector: env.EMBEDDING_MIN_SCORE, text: env.EMBEDDING_TEXT_MIN_SCORE },
      corpus: { documents: RETRIEVAL_CORPUS.length, chunks: chunkCount },
      indexingMs,
      byArm,
      sweep: sweepRows,
      cases: hybrid.map((r) => ({
        id: r.testCase.id,
        question: r.testCase.question,
        rank: firstHitRank(r.fragments, r.testCase),
        returned: r.fragments.length,
      })),
    },
    null,
    2,
  ),
);
console.log(`\nResults written to apps/api/${file}`);
await prisma.$disconnect();
