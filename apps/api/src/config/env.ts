import { z } from 'zod';

/** Local storage of docker-compose.yml: valid only outside production (ADR-005). */
const LOCAL_STORAGE = {
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'multicooperativa',
  S3_ACCESS_KEY_ID: 'multicooperativa',
  S3_SECRET_ACCESS_KEY: 'multicooperativa-dev',
} as const;

/** Local Ollama of docker-compose.yml (ADR-006). */
const LOCAL_OLLAMA_URL = 'http://localhost:11434';

/** Web dev server of Expo: the only cross-origin caller outside production. */
const LOCAL_CORS_ORIGINS = ['http://localhost:8081'];

/** Flash / Flash-Lite generateContent models with a free tier, each with its own quota (ADR-009). */
const DEFAULT_FALLBACK_MODELS = 'gemini-3.6-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite';

const REQUIRED_IN_PRODUCTION = ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const;

/**
 * Default minimum cosine similarity per embeddings provider (ADR-022): scores of different models
 * are not comparable.
 * - ollama (bge-m3): calibrated on the sample documents (ADR-022): relevant questions reached 0.48-0.66
 *   with their best fragment, off-topic ones 0.24-0.42; 0.40 drops most of the noise.
 * - gemini (gemini-embedding-2): NOT calibrated (no paid calls); a conservative low value that
 *   filters little. Raise it with EMBEDDING_MIN_SCORE after measuring.
 */
export const DEFAULT_MIN_SCORE = { ollama: 0.4, gemini: 0.3 } as const;

/**
 * Default cosine floor for text-search hits per provider (ADR-022); never above the vector threshold.
 * - ollama (bge-m3): 0.30. Off-topic questions scored 0.18-0.32 against every fragment of the
 *   sample documents, relevant ones 0.41-0.66 with their best fragment: 0.30 drops the clearly
 *   unrelated fragments that merely share words and keeps everything relevant.
 * - gemini (gemini-embedding-2): 0.25, NOT calibrated, lower than the vector default so it filters little.
 */
export const DEFAULT_TEXT_MIN_SCORE = { ollama: 0.3, gemini: 0.25 } as const;

const optionalScore = z
  .string()
  .transform((value) => (value.trim() === '' ? undefined : Number(value)))
  .refine(
    (value) => value === undefined || (Number.isFinite(value) && value >= 0 && value <= 1),
    'must be a number between 0 and 1',
  )
  .optional();

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    /** Connection pool of the API: maximum connections, wait for a free one, idle lifetime. */
    DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    DB_POOL_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(5_000),
    DB_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(30_000),
    /** Per-statement limit on the API's connections only (migrations are not affected). 0 disables it. */
    DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(0).max(600_000).default(30_000),
    /** Signing secret of the access JWTs (HS256): at least 256 bits. */
    JWT_SECRET: z.string().min(32),
    /** Empty for AWS S3; the service URL for any other compatible one. */
    S3_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
    /** Browser-reachable URL of the storage, used only to presign download links when `S3_ENDPOINT` is an internal hostname (ADR-012). */
    S3_PUBLIC_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_BUCKET: z.string().min(3).optional(),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    /** `endpoint/bucket/key` paths instead of subdomains: required by RustFS and most compatible services. */
    S3_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    /** Who computes the embeddings: local Ollama (ADR-006, default) or Gemini (ADR-010, hosted demo). */
    EMBEDDINGS_PROVIDER: z.enum(['ollama', 'gemini']).default('ollama'),
    /** Gemini embedding model; asked at 1024 dimensions. Only read with EMBEDDINGS_PROVIDER=gemini. */
    GEMINI_EMBEDDING_MODEL: z.string().min(1).default('gemini-embedding-2'),
    /** Ollama service that computes the embeddings (ADR-006). */
    OLLAMA_URL: z.url({ protocol: /^https?$/ }).optional(),
    EMBEDDING_MODEL: z.string().min(1).default('bge-m3'),
    /** Minimum cosine similarity (0..1) for a vector-search hit; text matches are kept regardless (ADR-022). Scores depend on the model, so unset uses the default of EMBEDDINGS_PROVIDER (DEFAULT_MIN_SCORE). Empty counts as unset. */
    EMBEDDING_MIN_SCORE: optionalScore,
    /** Minimum cosine similarity (0..1) for a text-search hit, at most EMBEDDING_MIN_SCORE: a fragment sharing terms with the question but unrelated in meaning is dropped (ADR-022). Unset uses the default of EMBEDDINGS_PROVIDER (DEFAULT_TEXT_MIN_SCORE). Empty counts as unset. */
    EMBEDDING_TEXT_MIN_SCORE: optionalScore,
    /** Time limit of one Ollama embeddings call (a batch of fragments), sized for a CPU-only host. */
    EMBEDDING_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600_000).default(120_000),
    /** Gemini API key (ADR-009), shared by the AI assistant and document extraction. Without it both answer 503; the rest works. */
    GEMINI_API_KEY: z.string().min(1).optional(),
    /** Gemini model shared by the assistant and document extraction: Flash class, free tier. */
    GEMINI_MODEL: z.string().min(1).default('gemini-3.8-flash'),
    /** Comma-separated Gemini models (free tier) tried in order when GEMINI_MODEL keeps answering overloaded (503/429). Empty string: no fallback. */
    GEMINI_FALLBACK_MODELS: z
      .string()
      .default(DEFAULT_FALLBACK_MODELS)
      .transform((value) =>
        value
          .split(',')
          .map((model) => model.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.string().regex(/^[\w.-]+$/, 'must be a model id such as gemini-3.6-flash'))),
    /** Who answers the assistant's chat: Gemini (ADR-009) or a local model in Ollama (ADR-013). Extraction and discrepancy explanations are always Gemini. */
    ASSISTANT_LLM_PROVIDER: z.enum(['gemini', 'ollama']).default('gemini'),
    /** Ollama chat model with tool support. Only read with ASSISTANT_LLM_PROVIDER=ollama. */
    ASSISTANT_OLLAMA_MODEL: z.string().min(1).default('qwen3:8b'),
    /** Models a cooperative's administrator may pick (US-AI-07, ADR-014), comma-separated. Empty: only ASSISTANT_OLLAMA_MODEL. Never pulled by the app. */
    ASSISTANT_OLLAMA_MODELS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((model) => model.trim())
          .filter(Boolean),
      )
      .pipe(
        z.array(z.string().regex(/^[\w.:/-]+$/, 'must be an Ollama model id such as qwen3:8b')),
      ),
    /** Time limit of one Ollama chat call, sized for a CPU-only host. */
    ASSISTANT_OLLAMA_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600_000).default(90_000),
    /** Master key (32 random bytes, base64: `openssl rand -base64 32`) that encrypts the API keys cooperatives bring for hosted assistant providers (US-AI-07, ADR-019). Without it hosted mode is unavailable. Changing it invalidates the stored keys. */
    ASSISTANT_SECRETS_KEY: z
      .string()
      .transform((value) => (value === '' ? undefined : value))
      .refine(
        (value) =>
          value === undefined ||
          (/^[A-Za-z0-9+/]+={0,2}$/.test(value) && Buffer.from(value, 'base64').length === 32),
        'must be 32 bytes in base64 (openssl rand -base64 32)',
      )
      .optional(),
    /** BR-AI-08: messages per user and hour. */
    ASSISTANT_MESSAGE_LIMIT_PER_HOUR: z.coerce.number().int().min(1).default(30),
    /** Comma-separated origins allowed by CORS (the hosted web app). Empty denies every browser origin. */
    CORS_ORIGINS: z
      .string()
      .optional()
      .transform((value) =>
        (value ?? '')
          .split(',')
          .map((origin) => origin.trim().replace(/\/+$/, ''))
          .filter(Boolean),
      )
      .pipe(z.array(z.url({ protocol: /^https?$/ }))),
    /** How invitation links reach the invitee: printed to the API console (development) or returned to the inviting administrator (ADR-016). In production `console` makes inviting answer 503. */
    INVITATION_DELIVERY: z.enum(['console', 'link']).default('console'),
    /** Public URL of the web app (origin or origin plus path); invitation links are `${WEB_APP_URL}/invitation?token=…`. Required with INVITATION_DELIVERY=link. */
    WEB_APP_URL: z
      .url({ protocol: /^https?$/ })
      .transform((value) => value.replace(/\/+$/, ''))
      .optional(),
    /** Bearer secret of `POST /jobs/due-dates` (external scheduler). Without it the endpoint does not exist. */
    JOBS_TOKEN: z.string().min(32).optional(),
  })
  .superRefine((env, context) => {
    if (env.EMBEDDINGS_PROVIDER === 'gemini' && !env.GEMINI_API_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['GEMINI_API_KEY'],
        message: 'required with EMBEDDINGS_PROVIDER=gemini',
      });
    }
    // Only an explicit floor can conflict: the default one is capped at the vector threshold.
    const minScore = env.EMBEDDING_MIN_SCORE ?? DEFAULT_MIN_SCORE[env.EMBEDDINGS_PROVIDER];
    if (env.EMBEDDING_TEXT_MIN_SCORE !== undefined && env.EMBEDDING_TEXT_MIN_SCORE > minScore) {
      context.addIssue({
        code: 'custom',
        path: ['EMBEDDING_TEXT_MIN_SCORE'],
        message: `must not exceed EMBEDDING_MIN_SCORE (${minScore})`,
      });
    }
    if (
      env.NODE_ENV === 'production' &&
      env.ASSISTANT_LLM_PROVIDER === 'ollama' &&
      !env.OLLAMA_URL
    ) {
      context.addIssue({
        code: 'custom',
        path: ['OLLAMA_URL'],
        message: 'required with ASSISTANT_LLM_PROVIDER=ollama',
      });
    }
    if (env.INVITATION_DELIVERY === 'link' && !env.WEB_APP_URL) {
      context.addIssue({
        code: 'custom',
        path: ['WEB_APP_URL'],
        message: 'required with INVITATION_DELIVERY=link',
      });
    }
    if (env.NODE_ENV !== 'production') return;
    for (const name of REQUIRED_IN_PRODUCTION) {
      if (!env[name]) {
        context.addIssue({ code: 'custom', path: [name], message: 'required in production' });
      }
    }
    if (env.EMBEDDINGS_PROVIDER === 'ollama' && !env.OLLAMA_URL) {
      context.addIssue({ code: 'custom', path: ['OLLAMA_URL'], message: 'required in production' });
    }
  })
  .transform((env) => {
    // Outside production, anything missing falls back to the local docker-compose storage.
    // In production superRefine has already rejected the missing ones.
    const local = env.NODE_ENV === 'production' ? undefined : LOCAL_STORAGE;
    const minScore = env.EMBEDDING_MIN_SCORE ?? DEFAULT_MIN_SCORE[env.EMBEDDINGS_PROVIDER];
    return {
      ...env,
      S3_ENDPOINT: env.S3_ENDPOINT ?? local?.S3_ENDPOINT,
      S3_BUCKET: env.S3_BUCKET ?? local?.S3_BUCKET ?? '',
      S3_ACCESS_KEY_ID: env.S3_ACCESS_KEY_ID ?? local?.S3_ACCESS_KEY_ID ?? '',
      S3_SECRET_ACCESS_KEY: env.S3_SECRET_ACCESS_KEY ?? local?.S3_SECRET_ACCESS_KEY ?? '',
      EMBEDDING_MIN_SCORE: minScore,
      EMBEDDING_TEXT_MIN_SCORE:
        env.EMBEDDING_TEXT_MIN_SCORE ??
        Math.min(DEFAULT_TEXT_MIN_SCORE[env.EMBEDDINGS_PROVIDER], minScore),
      OLLAMA_URL: env.OLLAMA_URL ?? (local ? LOCAL_OLLAMA_URL : ''),
      CORS_ORIGINS: env.CORS_ORIGINS.length > 0 || !local ? env.CORS_ORIGINS : LOCAL_CORS_ORIGINS,
    };
  });

export type Env = z.infer<typeof envSchema>;

/** Validates the environment at startup; throws naming every invalid variable. */
export function loadEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration. ${details}`);
  }
  return result.data;
}
