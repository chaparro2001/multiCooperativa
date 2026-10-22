import { createApi } from './api';
import { loadEnv } from './config/env';
import { createInvitationSender } from './modules/access';
import { createGeminiLanguageModel, createOllamaModelRuntime } from './modules/assistant';
import { GeminiEmbedder, OllamaEmbedder } from './modules/documents';
import {
  GeminiDiscrepancyExplainer,
  GeminiDocumentExtractor,
  createGeminiClient,
} from './modules/invoicing';
import { S3FileStorage, s3SettingsFromEnv } from './shared/files/s3-file-storage';
import { describeError, log } from './shared/infrastructure/log';
import { createPrismaClient } from './shared/infrastructure/prisma';

const env = loadEnv(process.env);
const production = env.NODE_ENV === 'production';

const files = new S3FileStorage(s3SettingsFromEnv(env));
// Locally the bucket is created automatically; in production it is provisioned beforehand (ADR-005).
if (!production) await files.ensureBucket();

const gemini = env.GEMINI_API_KEY ? createGeminiClient(env.GEMINI_API_KEY) : undefined;

const prisma = createPrismaClient(env.DATABASE_URL, {
  max: env.DB_POOL_MAX,
  connectionTimeoutMs: env.DB_POOL_CONNECTION_TIMEOUT_MS,
  idleTimeoutMs: env.DB_POOL_IDLE_TIMEOUT_MS,
  statementTimeoutMs: env.DB_STATEMENT_TIMEOUT_MS,
});

const { app, indexing, runDueDates, purgeAuthRecords } = createApi({
  prisma,
  jwtSecret: env.JWT_SECRET,
  files,
  // Ollama locally (ADR-006); Gemini in the hosted demo (ADR-010). Vectors of different models
  // are not comparable: each environment indexes its documents with its own provider.
  embedder:
    env.EMBEDDINGS_PROVIDER === 'gemini' && gemini
      ? new GeminiEmbedder(gemini, env.GEMINI_EMBEDDING_MODEL)
      : new OllamaEmbedder({
          url: env.OLLAMA_URL,
          model: env.EMBEDDING_MODEL,
          timeoutMs: env.EMBEDDING_TIMEOUT_MS,
        }),
  embeddingMinScore: env.EMBEDDING_MIN_SCORE,
  // Scanned documents are read by Gemini (ADR-009); without a key, extraction answers 503.
  documentExtractor:
    gemini && new GeminiDocumentExtractor(gemini, env.GEMINI_MODEL, env.GEMINI_FALLBACK_MODELS),
  discrepancyExplainer:
    gemini && new GeminiDiscrepancyExplainer(gemini, env.GEMINI_MODEL, env.GEMINI_FALLBACK_MODELS),
  // The assistant runs on a local Ollama model (ADR-013) or on Gemini (ADR-009). Without the
  // provider's key the assistant answers 503 and the rest of the app keeps working.
  // With Ollama each cooperative picks its model among ASSISTANT_OLLAMA_MODELS (ADR-014).
  assistantLocalModels:
    env.ASSISTANT_LLM_PROVIDER === 'ollama'
      ? createOllamaModelRuntime({
          url: env.OLLAMA_URL,
          defaultModel: env.ASSISTANT_OLLAMA_MODEL,
          models: env.ASSISTANT_OLLAMA_MODELS,
          timeoutMs: env.ASSISTANT_OLLAMA_TIMEOUT_MS,
        })
      : undefined,
  languageModel:
    env.ASSISTANT_LLM_PROVIDER !== 'ollama' && env.GEMINI_API_KEY
      ? createGeminiLanguageModel({
          apiKey: env.GEMINI_API_KEY,
          model: env.GEMINI_MODEL,
          fallbackModels: env.GEMINI_FALLBACK_MODELS,
        })
      : null,
  // Cooperatives can bring their own hosted provider key (ADR-019); keys are encrypted with this one.
  assistantSecretsKey: env.ASSISTANT_SECRETS_KEY,
  assistantMessageLimitPerHour: env.ASSISTANT_MESSAGE_LIMIT_PER_HOUR,
  // No email provider (ADR-016): with `link` the administrator receives the link and passes it on;
  // `console` prints it in development and, in production, answers 503 instead of logging tokens.
  invitationSender: createInvitationSender({
    delivery: env.INVITATION_DELIVERY,
    webAppUrl: env.WEB_APP_URL,
    production,
  }),
  // In production the API sits behind the host's proxy (Render): one hop.
  trustProxy: production ? 1 : false,
  corsOrigins: env.CORS_ORIGINS,
  jobsToken: env.JOBS_TOKEN,
});

const server = app.listen(env.PORT, () => {
  log.info('api_listening', { port: env.PORT, env: env.NODE_ENV });
});
// Explicit HTTP limits. Uploads are capped at 20 MB (documents; 10 MB elsewhere, multer), so 10
// minutes to receive a whole request is generous even on a slow mobile link (20 MB at 0.5 Mbit/s
// takes 320 s) while a stalled client cannot hold a socket forever. Keep-alive is longer than the 90 s idle time of the
// Cloudflare Tunnel (and of Render's proxy at 60 s) so the proxy, not the API, closes idle
// connections; headersTimeout must stay above keepAliveTimeout.
server.requestTimeout = 600_000;
server.keepAliveTimeout = 95_000;
server.headersTimeout = 100_000;

// Whatever a restart left half-done is re-indexed in the background (ADR-006).
indexing
  .resumePending()
  .then((count) => count > 0 && log.info('indexing_resumed', { count }))
  .catch((error) => log.error('indexing_resume_failed', { error: describeError(error) }));

// Invoice due dates (US-INV-07): on startup and every hour. A free host sleeps when idle, so an
// external cron also calls POST /jobs/due-dates. It works by dates and is
// idempotent (NFR-INV-04), so in practice it acts once a day.
const HOUR = 60 * 60 * 1000;
const dueDates = () =>
  runDueDates()
    .then(({ overdue, dueSoon }) => {
      if (overdue + dueSoon > 0) log.info('due_dates_processed', { overdue, dueSoon });
    })
    .catch((error) => log.error('due_dates_failed', { error: describeError(error) }));
void dueDates();
const dueDatesTimer = setInterval(dueDates, HOUR);
dueDatesTimer.unref();

// Housekeeping of expired sessions and old failed logins, with the same cadence (the external cron
// also calls POST /jobs/purge-auth-records).
const purgeAuth = () =>
  purgeAuthRecords()
    .then(({ sessions, failedAttempts }) => {
      if (sessions + failedAttempts > 0)
        log.info('auth_records_purged', { sessions, failedAttempts });
    })
    .catch((error) => log.error('auth_records_purge_failed', { error: describeError(error) }));
void purgeAuth();
const purgeAuthTimer = setInterval(purgeAuth, HOUR);
purgeAuthTimer.unref();

// Graceful shutdown (docker stop / Render deploy send SIGTERM): stop accepting connections, let
// the in-flight requests finish, close the database pool and leave; a hard timeout bounds it.
const SHUTDOWN_TIMEOUT_MS = 10_000;
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info('api_shutting_down', { signal });
  setTimeout(() => {
    log.error('api_shutdown_timeout', { timeoutMs: SHUTDOWN_TIMEOUT_MS });
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
  clearInterval(dueDatesTimer);
  clearInterval(purgeAuthTimer);
  server.close(async (closeError) => {
    if (closeError) log.error('api_close_failed', { error: describeError(closeError) });
    try {
      await prisma.$disconnect();
    } catch (error) {
      log.error('prisma_disconnect_failed', { error: describeError(error) });
    }
    process.exit(closeError ? 1 : 0);
  });
  // Idle keep-alive connections would otherwise hold close() until the hard timeout.
  server.closeIdleConnections();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) =>
  log.error('unhandled_rejection', { error: describeError(reason) }),
);
