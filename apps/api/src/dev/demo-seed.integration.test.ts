import {
  acceptInvitationResponseSchema,
  authTokensSchema,
  meResponseSchema,
  myPermissionsResponseSchema,
} from '@multicooperativa/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../test/database';
import { createApi } from '../api';
import { InMemoryFileStorage } from '../shared/files/in-memory-file-storage';
import { loadEnv } from '../config/env';
import { createAccessModule } from '../modules/access';
import { HashingEmbedder } from '../modules/documents';
import { DEMO_COOPERATIVES, type DemoSeedResult, seedDemoData } from './demo-seed';

const PASSWORD = 'a-long-demo-password';
const prisma = createTestPrisma();
const jwtSecret = loadEnv(process.env).JWT_SECRET;
const invitationSender = { send: async () => {} };
const access = createAccessModule({ prisma, jwtSecret, invitationSender });
const { app } = createApi({
  embedder: new HashingEmbedder(),
  prisma,
  jwtSecret,
  invitationSender,
  files: new InMemoryFileStorage(),
  authRateLimits: false,
});

let seeded: DemoSeedResult;

beforeAll(async () => {
  await resetDatabase(prisma);
  seeded = await seedDemoData({ prisma, access }, PASSWORD);
});
afterAll(() => prisma.$disconnect());

async function login(email: string) {
  const response = await request(app).post('/auth/login').send({ email, password: PASSWORD });
  return response;
}

describe('sample data', () => {
  it('creates two cooperatives with the four profiles covered in each', async () => {
    expect(seeded.cooperatives.map((c) => c.created)).toEqual([true, true]);

    for (const { id } of seeded.cooperatives) {
      const profiles = await prisma.membership.findMany({
        where: { cooperativeId: id, status: 'active' },
        select: { profile: { select: { name: true } } },
      });
      expect(new Set(profiles.map((m) => m.profile.name))).toEqual(
        new Set(['Socio', 'Consejo rector', 'Gestor', 'Administrador']),
      );
    }
  });

  it('every active user logs in and sees the expected profile in their cooperative', async () => {
    for (const [index, demo] of DEMO_COOPERATIVES.entries()) {
      const cooperativeId = seeded.cooperatives[index]!.id;
      const active = [
        { email: demo.admin.email, profile: 'Administrador' },
        ...demo.members.filter((m) => (m.status ?? 'active') === 'active'),
      ];
      for (const member of active) {
        const { accessToken } = authTokensSchema.parse((await login(member.email)).body);
        const permissions = myPermissionsResponseSchema.parse(
          (
            await request(app)
              .get(`/cooperatives/${cooperativeId}/me/permissions`)
              .set('Authorization', `Bearer ${accessToken}`)
          ).body,
        );
        expect(permissions.profileName, member.email).toBe(member.profile);
      }
    }
  });

  it('Lucía belongs to both cooperatives, with different profiles (cooperative selector)', async () => {
    const { accessToken } = authTokensSchema.parse((await login('lucia@demo.test')).body);

    const me = meResponseSchema.parse(
      (await request(app).get('/me').set('Authorization', `Bearer ${accessToken}`)).body,
    );

    expect(me.memberships.map((m) => m.profileName).sort()).toEqual(['Consejo rector', 'Socio']);
  });

  it('the hired manager is not a partner (cannot vote, BR-ACC-06)', async () => {
    const manager = await prisma.membership.findFirstOrThrow({
      where: { user: { email: 'gestor@sanisidro.test' } },
    });
    expect(manager.isPartner).toBe(false);
  });

  it('the suspended member has no active cooperative', async () => {
    const response = await login('suspendido@sanisidro.test');

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('no_active_membership');
  });

  it('the pending invitation is accepted with the token the seed returns', async () => {
    const [invitation] = seeded.invitations;

    const response = await request(app)
      .post('/auth/invitations/accept')
      .send({ token: invitation!.token, password: PASSWORD });

    expect(response.status).toBe(200);
    expect(acceptInvitationResponseSchema.parse(response.body).tokens).not.toBeNull();
  });

  it('is idempotent: a second run creates and changes nothing', async () => {
    const before = await prisma.membership.count();

    const again = await seedDemoData({ prisma, access }, PASSWORD);

    expect(again.cooperatives.map((c) => c.created)).toEqual([false, false]);
    expect(again.invitations).toEqual([]);
    expect(await prisma.membership.count()).toBe(before);
  });
});
