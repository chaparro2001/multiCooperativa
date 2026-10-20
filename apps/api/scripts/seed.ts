/**
 * Sample data: two cooperatives with users of every profile.
 *
 *   pnpm --filter @multicooperativa/api db:seed
 *
 * All users get the password from SEED_PASSWORD or, if it is not set, the
 * demo password printed at the end. It is idempotent: a cooperative that
 * already exists is left untouched. It refuses to run in production.
 */
import { seedDemoData } from '../src/dev/demo-seed';
import { loadEnv } from '../src/config/env';
import {
  createAccessModule,
  invitationLink,
  UnavailableInvitationSender,
} from '../src/modules/access';
import { createPrismaClient } from '../src/shared/infrastructure/prisma';

const DEMO_PASSWORD = 'demo-cooperativa-2026';

const env = loadEnv(process.env);
if (env.NODE_ENV === 'production') {
  console.error('Sample data is not loaded in production.');
  process.exit(1);
}

const password = process.env.SEED_PASSWORD || DEMO_PASSWORD;
const prisma = createPrismaClient(env.DATABASE_URL);
const access = createAccessModule({
  prisma,
  jwtSecret: env.JWT_SECRET,
  invitationSender: new UnavailableInvitationSender(),
});

try {
  const result = await seedDemoData({ prisma, access }, password);

  for (const cooperative of result.cooperatives) {
    const state = cooperative.created ? 'created' : 'already existed, unchanged';
    console.log(`${cooperative.name} (${cooperative.id}): ${state}`);
  }
  for (const invitation of result.invitations) {
    console.log(`Pending invitation for ${invitation.email}: ${invitationLink(invitation.token)}`);
  }
  if (result.cooperatives.some((cooperative) => cooperative.created)) {
    console.log(
      `Password of all users: ${process.env.SEED_PASSWORD ? '(SEED_PASSWORD)' : password}`,
    );
    console.log('Users: docs/sample-data.md');
  }
} finally {
  await prisma.$disconnect();
}
