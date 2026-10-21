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
const DEFAULT_FALLBACK_MODELS = 'gemini-3.6-flash,gemini-3.1-flash-lite';

const REQUIRED_IN_PRODUCTION = ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const;

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    /** Signing secret of the access JWTs (HS256): at least 256 bits. */
    JWT_SECRET: z.string().min(32),
    /** Empty for AWS S3; the service URL for any other compatible one. */
    S3_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
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
    return {
      ...env,
      S3_ENDPOINT: env.S3_ENDPOINT ?? local?.S3_ENDPOINT,
      S3_BUCKET: env.S3_BUCKET ?? local?.S3_BUCKET ?? '',
      S3_ACCESS_KEY_ID: env.S3_ACCESS_KEY_ID ?? local?.S3_ACCESS_KEY_ID ?? '',
      S3_SECRET_ACCESS_KEY: env.S3_SECRET_ACCESS_KEY ?? local?.S3_SECRET_ACCESS_KEY ?? '',
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
