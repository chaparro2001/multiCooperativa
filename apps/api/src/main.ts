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
import { createPrismaClient } from './shared/infrastructure/prisma';

const env = loadEnv(process.env);
const production = env.NODE_ENV === 'production';

const files = new S3FileStorage(s3SettingsFromEnv(env));
// Locally the bucket is created automatically; in production it is provisioned beforehand (ADR-005).
if (!production) await files.ensureBucket();

const gemini = env.GEMINI_API_KEY ? createGeminiClient(env.GEMINI_API_KEY) : undefined;

const { app, indexing, runDueDates } = createApi({
  prisma: createPrismaClient(env.DATABASE_URL),
  jwtSecret: env.JWT_SECRET,
  files,
  // Ollama locally (ADR-006); Gemini in the hosted demo (ADR-010). Vectors of different models
  // are not comparable: each environment indexes its documents with its own provider.
  embedder:
    env.EMBEDDINGS_PROVIDER === 'gemini' && gemini
      ? new GeminiEmbedder(gemini, env.GEMINI_EMBEDDING_MODEL)
      : new OllamaEmbedder({ url: env.OLLAMA_URL, model: env.EMBEDDING_MODEL }),
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

app.listen(env.PORT, () => {
  console.log(`API listening on port ${env.PORT} (${env.NODE_ENV})`);
});

// Whatever a restart left half-done is re-indexed in the background (ADR-006).
indexing
  .resumePending()
  .then((count) => count > 0 && console.log(`Indexing: ${count} pending versions queued`))
  .catch((error) => console.error('Could not resume the pending indexing jobs:', error));

// Invoice due dates (US-INV-07): on startup and every hour. A free host sleeps when idle, so an
// external cron also calls POST /jobs/due-dates. It works by dates and is
// idempotent (NFR-INV-04), so in practice it acts once a day.
const HOUR = 60 * 60 * 1000;
const dueDates = () =>
  runDueDates()
    .then(({ overdue, dueSoon }) => {
      if (overdue + dueSoon > 0) console.log(`Due dates: ${overdue} overdue, ${dueSoon} notices`);
    })
    .catch((error) => console.error('Due-dates process failed:', error));
void dueDates();
setInterval(dueDates, HOUR).unref();
