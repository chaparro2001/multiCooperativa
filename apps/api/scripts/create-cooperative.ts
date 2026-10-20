/**
 * Creates a cooperative with its 4 predefined profiles and an administrator.
 *
 *   ADMIN_PASSWORD='…' pnpm --filter @multicooperativa/api cooperative:create \
 *     --name "Cooperativa del Campo" --cif F12345678 \
 *     --admin-email admin@field.test --admin-name "Ada Lovelace"
 *
 * The password is passed as an environment variable so it does not end up in
 * the shell history. It is not needed if the administrator is already a platform user.
 */
import { parseArgs } from 'node:util';

import { loadEnv } from '../src/config/env';
import {
  AccessApplicationError,
  AccessDomainError,
  createAccessModule,
  UnavailableInvitationSender,
} from '../src/modules/access';
import { createPrismaClient } from '../src/shared/infrastructure/prisma';

const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    cif: { type: 'string' },
    'admin-email': { type: 'string' },
    'admin-name': { type: 'string' },
  },
});

const missing = (['name', 'cif', 'admin-email', 'admin-name'] as const).filter(
  (option) => !values[option],
);
if (missing.length > 0) {
  console.error(`Missing options: ${missing.map((option) => `--${option}`).join(', ')}`);
  process.exit(1);
}

const env = loadEnv(process.env);
const prisma = createPrismaClient(env.DATABASE_URL);

try {
  const result = await createAccessModule({
    prisma,
    jwtSecret: env.JWT_SECRET,
    // Provisioning creates the administrator directly active: it sends no invitations.
    invitationSender: new UnavailableInvitationSender(),
  }).provisionCooperative({
    name: values.name!,
    cif: values.cif!,
    admin: {
      email: values['admin-email']!,
      name: values['admin-name']!,
      password: process.env.ADMIN_PASSWORD || undefined,
    },
  });
  console.log(`Cooperative created: ${result.cooperativeId}`);
  console.log(`Administrator: user ${result.adminUserId}, membership ${result.adminMembershipId}`);
} catch (error) {
  if (error instanceof AccessApplicationError || error instanceof AccessDomainError) {
    console.error(`The cooperative was not created. ${error.message}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
} finally {
  await prisma.$disconnect();
}
