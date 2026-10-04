import { z } from 'zod';

/** Local storage of docker-compose.yml: valid only outside production (ADR-005). */
const LOCAL_STORAGE = {
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'multicooperativa',
  S3_ACCESS_KEY_ID: 'multicooperativa',
  S3_SECRET_ACCESS_KEY: 'multicooperativa-dev',
} as const;

const STORAGE_REQUIRED_IN_PRODUCTION = [
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
] as const;

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    /** Firma de los JWT de acceso (HS256): al menos 256 bits. */
    JWT_SECRET: z.string().min(32),
    /** Vacío para AWS S3; la URL del servicio para cualquier otro compatible. */
    S3_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_BUCKET: z.string().min(3).optional(),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    /** Rutas `endpoint/bucket/clave` en vez de subdominios: lo piden RustFS y la mayoría de compatibles. */
    S3_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV !== 'production') return;
    for (const name of STORAGE_REQUIRED_IN_PRODUCTION) {
      if (!env[name]) {
        context.addIssue({ code: 'custom', path: [name], message: 'obligatoria en producción' });
      }
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
    throw new Error(`Configuración de entorno inválida. ${details}`);
  }
  return result.data;
}
