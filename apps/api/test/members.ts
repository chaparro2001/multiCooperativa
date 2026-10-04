import request from 'supertest';
import type { Express } from 'express';

import type { PrismaClient } from '../src/shared/infrastructure/prisma';

export const TEST_PASSWORD = 'una-clave-larga';

/**
 * Adds an active member with a predefined profile and logs them in. Reuses the
 * Argon2 hash of `passwordOf` so tests do not pay a hash per member.
 */
export async function memberToken(
  deps: { prisma: PrismaClient; app: Express },
  input: {
    cooperativeId: string;
    email: string;
    profileName: string;
    isPartner: boolean;
    passwordOf: string;
  },
): Promise<string> {
  const { prisma, app } = deps;
  const { passwordHash } = await prisma.user.findUniqueOrThrow({
    where: { email: input.passwordOf },
  });
  const profile = await prisma.profile.findFirstOrThrow({
    where: { cooperativeId: input.cooperativeId, name: input.profileName },
  });
  const user = await prisma.user.upsert({
    where: { email: input.email },
    update: {},
    create: { email: input.email, name: input.profileName, passwordHash },
  });
  await prisma.membership.create({
    data: {
      userId: user.id,
      cooperativeId: input.cooperativeId,
      profileId: profile.id,
      status: 'activa',
      isPartner: input.isPartner,
    },
  });
  const login = await request(app)
    .post('/auth/login')
    .send({ email: input.email, password: TEST_PASSWORD });
  return login.body.accessToken as string;
}
