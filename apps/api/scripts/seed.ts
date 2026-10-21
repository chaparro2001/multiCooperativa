/**
 * Sample data: two cooperatives with users of every profile.
 *
 *   pnpm --filter @multicooperativa/api db:seed
 *
 * All users get the password from SEED_PASSWORD or, if it is not set, the
 * demo password printed at the end. It is idempotent and additive: a cooperative
 * that already exists is left untouched and nothing is ever deleted.
 *
 * Against the hosted demo (docs/04-deployment.md), with the direct Neon URL:
 *
 *   DATABASE_URL='postgresql://…neon…' SEED_PASSWORD='…' \
 *     pnpm --filter @multicooperativa/api db:seed --allow-production
 *
 * Without the flag it refuses any database that is not local, and NODE_ENV=production.
 * The sample documents and announcements go through the API: see seed-content.ts.
 */
import { randomBytes } from 'node:crypto';

import { seedDemoData } from '../src/dev/demo-seed';
import { ALLOW_PRODUCTION_FLAG, seedRefusal } from '../src/dev/seed-guard';
import { loadEnv } from '../src/config/env';
import {
  createAccessModule,
  invitationLink,
  UnavailableInvitationSender,
} from '../src/modules/access';
import { createPrismaClient } from '../src/shared/infrastructure/prisma';

const DEMO_PASSWORD = 'demo-cooperativa-2026';

// The guard runs first, on the raw environment: a production-like one would otherwise fail
// validation for variables (S3) that seeding does not use.
const refusal = process.env.DATABASE_URL
  ? seedRefusal({
      nodeEnv: process.env.NODE_ENV ?? 'development',
      databaseUrl: process.env.DATABASE_URL,
      allowProduction: process.argv.includes(ALLOW_PRODUCTION_FLAG),
    })
  : null;
if (refusal) {
  console.error(refusal);
  process.exit(1);
}

// Seeding issues no tokens and touches no storage: no JWT_SECRET or S3 settings are needed.
const env = loadEnv({
  JWT_SECRET: randomBytes(32).toString('hex'),
  ...process.env,
  NODE_ENV: 'development',
});

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
  console.log(`Capital movements added: ${result.capitalMovementsAdded}`);
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
