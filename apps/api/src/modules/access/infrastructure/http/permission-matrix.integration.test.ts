import { authTokensSchema, myPermissionsResponseSchema } from '@multicooperativa/contracts';
import { Router } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../../../../test/database';
import { createApp } from '../../../../app';
import { loadEnv } from '../../../../config/env';
import { ACCESS_LEVELS, type AccessLevel, MODULES, type Module } from '../../domain/permission';
import type { PredefinedProfileName } from '../../domain/predefined-profiles';
import {
  createAccessModule,
  getCooperativeContext,
  requireAccess,
  requirePermission,
} from '../../index';
import { parseCell, SPEC_MATRIX } from '../../testing/spec-permission-matrix';

/**
 * ADR-004: the matrix of section 3 checked end to end. Permissions come from
 * the database as the provisioning stored them and go through the real guards.
 */

const PROFILES: PredefinedProfileName[] = ['Socio', 'Consejo rector', 'Gestor', 'Administrador'];
const PASSWORD = 'una-clave-larga';

const prisma = createTestPrisma();
const access = createAccessModule({
  prisma,
  jwtSecret: loadEnv(process.env).JWT_SECRET,
  authRateLimits: false,
  invitationSender: { send: async () => {} },
});

// A probe per module and level, guarded exactly as a module's route will be.
const probes = Router();
for (const module of MODULES) {
  for (const level of ACCESS_LEVELS) {
    probes.get(
      `/cooperativas/:cooperativeId/sonda/${module}/${level}`,
      access.requireCooperative,
      requirePermission(module, level),
      (_req, res) => {
        res.json({ scope: requireAccess(getCooperativeContext(res).permissions, module, level) });
      },
    );
  }
}
const app = createApp({ routers: [access.router, probes], errorHandlers: [access.errorHandler] });

let cooperativeId: string;
const tokens = new Map<PredefinedProfileName, string>();

beforeAll(async () => {
  await resetDatabase(prisma);
  ({ cooperativeId } = await access.provisionCooperative({
    name: 'Cooperativa del Campo',
    cif: 'F12345678',
    admin: { email: 'administrador@campo.es', name: 'Ada', password: PASSWORD },
  }));
  const { passwordHash } = await prisma.user.findFirstOrThrow();

  for (const profileName of PROFILES) {
    const email = `${profileName.toLowerCase().replace(' ', '-')}@campo.es`;
    if (profileName !== 'Administrador') {
      const profile = await prisma.profile.findFirstOrThrow({
        where: { cooperativeId, name: profileName },
      });
      await prisma.user.create({
        data: {
          email,
          name: profileName,
          passwordHash,
          memberships: {
            create: { cooperativeId, profileId: profile.id, status: 'activa', isPartner: true },
          },
        },
      });
    }
    const response = await request(app).post('/auth/login').send({ email, password: PASSWORD });
    tokens.set(profileName, authTokensSchema.parse(response.body).accessToken);
  }
});
afterAll(() => prisma.$disconnect());

const as = (profile: PredefinedProfileName) => ({
  Authorization: `Bearer ${tokens.get(profile)}`,
});

describe('matriz perfiles × módulos por HTTP (ADR-004)', () => {
  it.each(PROFILES)('GET /me/permisos de %s coincide con la matriz', async (profile) => {
    const response = await request(app)
      .get(`/cooperativas/${cooperativeId}/me/permisos`)
      .set(as(profile));

    const expected = MODULES.flatMap((module) => {
      const grant = parseCell(SPEC_MATRIX[module][profile]);
      return grant ? [{ module, ...grant }] : [];
    });
    const { permissions } = myPermissionsResponseSchema.parse(response.body);
    const byModule = (a: { module: string }, b: { module: string }) =>
      a.module.localeCompare(b.module);
    expect([...permissions].sort(byModule)).toEqual(expected.sort(byModule));
  });

  const cases = PROFILES.flatMap((profile) =>
    MODULES.flatMap((module) =>
      ACCESS_LEVELS.map((level) => ({
        profile,
        module,
        level,
        cell: SPEC_MATRIX[module][profile],
      })),
    ),
  );

  it.each(cases)(
    '$profile pide $module con nivel $level (matriz: $cell)',
    async ({
      profile,
      module,
      level,
    }: {
      profile: PredefinedProfileName;
      module: Module;
      level: AccessLevel;
    }) => {
      const grant = parseCell(SPEC_MATRIX[module][profile]);
      const allowed = grant !== null && (level === 'consulta' || grant.level === 'gestion');

      const response = await request(app)
        .get(`/cooperativas/${cooperativeId}/sonda/${module}/${level}`)
        .set(as(profile));

      if (allowed) {
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ scope: grant.scope });
      } else {
        // HU-ACC-07: denied before any logic, with no hint of the data.
        expect(response.status).toBe(403);
        expect(response.body.error).toBe('forbidden');
      }
    },
  );

  it.each(PROFILES)('el endpoint real de miembros respeta la matriz para %s', async (profile) => {
    const response = await request(app)
      .get(`/cooperativas/${cooperativeId}/miembros`)
      .set(as(profile));

    expect(response.status).toBe(profile === 'Administrador' ? 200 : 403);
  });
});
