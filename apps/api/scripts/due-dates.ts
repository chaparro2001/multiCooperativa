/**
 * Proceso diario de vencimientos (HU-FAC-07), para lanzarlo desde un cron:
 *
 *   pnpm --filter @multicooperativa/api jobs:due-dates
 *
 * Idempotente (RNF-FAC-04): se puede repetir sin duplicar avisos. El API
 * también lo ejecuta al arrancar y cada hora.
 */
import { loadEnv } from '../src/config/env';
import { runDueDatesJob } from '../src/modules/invoicing';
import { InProcessEventBus } from '../src/shared/events';
import { createPrismaClient } from '../src/shared/infrastructure/prisma';

const env = loadEnv(process.env);
const prisma = createPrismaClient(env.DATABASE_URL);
try {
  // Sin suscriptores aquí: las notificaciones (Hito 6) se engancharán al bus del API.
  const result = await runDueDatesJob({
    prisma,
    events: new InProcessEventBus({ onHandlerError: () => {} }),
  });
  console.log(`Vencidas: ${result.overdue}. Avisos de próximo vencimiento: ${result.dueSoon}.`);
} finally {
  await prisma.$disconnect();
}
