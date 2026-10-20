/**
 * Daily due-dates process (US-INV-07), to run from a cron:
 *
 *   pnpm --filter @multicooperativa/api jobs:due-dates
 *
 * Idempotent (NFR-INV-04): it can be repeated without duplicating notices. The
 * API also runs it on startup and every hour.
 */
import { loadEnv } from '../src/config/env';
import { runDueDatesJob } from '../src/modules/invoicing';
import { InProcessEventBus } from '../src/shared/events';
import { createPrismaClient } from '../src/shared/infrastructure/prisma';

const env = loadEnv(process.env);
const prisma = createPrismaClient(env.DATABASE_URL);
try {
  // No subscribers here: notifications (Milestone 6) will hook into the API bus.
  const result = await runDueDatesJob({
    prisma,
    events: new InProcessEventBus({ onHandlerError: () => {} }),
  });
  console.log(`Overdue: ${result.overdue}. Due-soon notices: ${result.dueSoon}.`);
} finally {
  await prisma.$disconnect();
}
