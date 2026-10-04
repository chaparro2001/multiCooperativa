import { z } from 'zod';

const appConfigSchema = z.object({
  apiUrl: z.url({ protocol: /^https?$/ }).transform((url) => url.replace(/\/+$/, '')),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

/**
 * Validates the configuration injected by the host (the Expo shell today,
 * another native app if this module is ever embedded).
 */
export function parseAppConfig(raw: { apiUrl: string | undefined }): AppConfig {
  const result = appConfigSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Configuración de la app inválida. ${details}`);
  }
  return result.data;
}
