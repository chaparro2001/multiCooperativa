import { z } from 'zod';

export * from './access';
export * from './announcements';
export * from './auth';
export * from './documents';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
