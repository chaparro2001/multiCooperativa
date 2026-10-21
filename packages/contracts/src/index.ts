import { z } from 'zod';

export * from './access';
export * from './announcements';
export * from './assistant';
export * from './assemblies';
export * from './auth';
export * from './documents';
export * from './invoicing';
export * from './member-area';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
