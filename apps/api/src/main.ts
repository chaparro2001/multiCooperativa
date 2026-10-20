import { createApi } from './api';
import { loadEnv } from './config/env';
import { ConsoleInvitationSender, UnavailableInvitationSender } from './modules/access';
import { OllamaEmbedder } from './modules/documents';
import { ClaudeDocumentExtractor, createClaudeClient } from './modules/invoicing';
import { S3FileStorage, s3SettingsFromEnv } from './shared/files/s3-file-storage';
import { createPrismaClient } from './shared/infrastructure/prisma';

const env = loadEnv(process.env);
const production = env.NODE_ENV === 'production';

const files = new S3FileStorage(s3SettingsFromEnv(env));
// Locally the bucket is created automatically; in production it is provisioned beforehand (ADR-005).
if (!production) await files.ensureBucket();

const { app, indexing, runDueDates } = createApi({
  prisma: createPrismaClient(env.DATABASE_URL),
  jwtSecret: env.JWT_SECRET,
  files,
  embedder: new OllamaEmbedder({ url: env.OLLAMA_URL, model: env.EMBEDDING_MODEL }),
  // Scanned documents are read by Claude (ADR-007); without a key, extraction answers 503.
  documentExtractor: env.ANTHROPIC_API_KEY
    ? new ClaudeDocumentExtractor(createClaudeClient(env.ANTHROPIC_API_KEY), env.ANTHROPIC_MODEL)
    : undefined,
  // No email provider yet: in development the link is printed to the console;
  // in production inviting returns 503 until one is configured.
  invitationSender: production ? new UnavailableInvitationSender() : new ConsoleInvitationSender(),
  // In production the API sits behind the Railway proxy: one hop.
  trustProxy: production ? 1 : false,
});

app.listen(env.PORT, () => {
  console.log(`API listening on port ${env.PORT} (${env.NODE_ENV})`);
});

// Whatever a restart left half-done is re-indexed in the background (ADR-006).
indexing
  .resumePending()
  .then((count) => count > 0 && console.log(`Indexing: ${count} pending versions queued`))
  .catch((error) => console.error('Could not resume the pending indexing jobs:', error));

// Invoice due dates (US-INV-07): on startup and every hour. It works by dates and is
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
