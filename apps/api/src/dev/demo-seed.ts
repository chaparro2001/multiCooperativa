import { createHash, randomBytes } from 'node:crypto';

import type { AccessModule } from '../modules/access';
import type { PrismaClient } from '../shared/infrastructure/prisma';

/**
 * Demo data for development and the TFM demo: two cooperatives with a user of
 * every predefined profile. Never run against production.
 */

type ProfileName = 'Socio' | 'Consejo rector' | 'Gestor' | 'Administrador';
type Status = 'active' | 'suspended' | 'invited';

interface DemoMember {
  email: string;
  name: string;
  profile: ProfileName;
  isPartner: boolean;
  partnerNumber?: string;
  status?: Status;
}

interface DemoCooperative {
  name: string;
  /** Valid control digit: invoices will validate tax ids (Milestone 4). */
  cif: string;
  admin: { email: string; name: string; partnerNumber: string };
  members: DemoMember[];
}

/** In two cooperatives with different profiles: exercises the cooperative selector (US-ACC-05). */
const LUCIA = { email: 'lucia@demo.test', name: 'Lucía Martín' };

export const DEMO_COOPERATIVES: DemoCooperative[] = [
  {
    name: 'Cooperativa Agrícola San Isidro',
    cif: 'F12345674',
    admin: { email: 'admin@sanisidro.test', name: 'Ana Torres', partnerNumber: '001' },
    members: [
      {
        email: 'consejo@sanisidro.test',
        name: 'Carlos Ruiz',
        profile: 'Consejo rector',
        isPartner: true,
        partnerNumber: '002',
      },
      // Hired manager: manages invoices but is not a partner, so cannot vote (BR-ACC-06).
      { email: 'gestor@sanisidro.test', name: 'Elena Gómez', profile: 'Gestor', isPartner: false },
      {
        email: 'socio@sanisidro.test',
        name: 'Javier López',
        profile: 'Socio',
        isPartner: true,
        partnerNumber: '003',
      },
      { ...LUCIA, profile: 'Socio', isPartner: true, partnerNumber: '004' },
      {
        email: 'suspendido@sanisidro.test',
        name: 'Pedro Sanz',
        profile: 'Socio',
        isPartner: true,
        partnerNumber: '005',
        status: 'suspended',
      },
      {
        email: 'invitada@sanisidro.test',
        name: 'Marta Díaz',
        profile: 'Socio',
        isPartner: true,
        partnerNumber: '006',
        status: 'invited',
      },
    ],
  },
  {
    name: 'Cooperativa Olivarera La Esperanza',
    cif: 'F76543214',
    admin: { email: 'admin@laesperanza.test', name: 'Rosa Navarro', partnerNumber: '001' },
    members: [
      { ...LUCIA, profile: 'Consejo rector', isPartner: true, partnerNumber: '002' },
      {
        email: 'gestor@laesperanza.test',
        name: 'Miguel Ortega',
        profile: 'Gestor',
        isPartner: false,
      },
      {
        email: 'socio@laesperanza.test',
        name: 'Isabel Romero',
        profile: 'Socio',
        isPartner: true,
        partnerNumber: '003',
      },
    ],
  },
];

export interface DemoSeedResult {
  cooperatives: { name: string; id: string; created: boolean }[];
  /** Raw tokens of the pending invitations created now, to open the activation screen. */
  invitations: { email: string; token: string }[];
}

/**
 * Idempotent: a cooperative whose CIF already exists is left untouched.
 * Every demo user gets `password`.
 */
export async function seedDemoData(
  deps: { prisma: PrismaClient; access: AccessModule },
  password: string,
): Promise<DemoSeedResult> {
  const { prisma, access } = deps;
  const result: DemoSeedResult = { cooperatives: [], invitations: [] };

  for (const demo of DEMO_COOPERATIVES) {
    const existing = await prisma.cooperative.findUnique({ where: { cif: demo.cif } });
    if (existing) {
      result.cooperatives.push({ name: demo.name, id: existing.id, created: false });
      continue;
    }

    // Through the module, exactly as the provisioning script does.
    const provisioned = await access.provisionCooperative({
      name: demo.name,
      cif: demo.cif,
      admin: { email: demo.admin.email, name: demo.admin.name, password },
    });
    const cooperativeId = provisioned.cooperativeId;
    await prisma.membership.update({
      where: { id: provisioned.adminMembershipId },
      data: { isPartner: true, partnerNumber: demo.admin.partnerNumber },
    });
    // Same password for everyone: reuse the admin's Argon2id hash instead of hashing again.
    const { passwordHash } = await prisma.user.findUniqueOrThrow({
      where: { id: provisioned.adminUserId },
    });

    const profiles = await prisma.profile.findMany({ where: { cooperativeId } });
    const profileId = (name: ProfileName) => profiles.find((p) => p.name === name)!.id;

    for (const member of demo.members) {
      const status = member.status ?? 'active';
      const user = await prisma.user.upsert({
        where: { email: member.email },
        create: {
          email: member.email,
          name: member.name,
          // An invited user has no password until they accept (US-ACC-01).
          passwordHash: status === 'invited' ? null : passwordHash,
        },
        update: {},
      });

      let invitation: { tokenHash: string; expiresAt: Date } | undefined;
      if (status === 'invited') {
        const token = randomBytes(32).toString('base64url');
        // Same scheme as CryptoSecretTokens; the seed test accepts this token through the API.
        invitation = {
          tokenHash: createHash('sha256').update(token).digest('hex'),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        };
        result.invitations.push({ email: member.email, token });
      }

      await prisma.membership.create({
        data: {
          userId: user.id,
          cooperativeId,
          profileId: profileId(member.profile),
          status,
          isPartner: member.isPartner,
          partnerNumber: member.partnerNumber ?? null,
          ...(invitation && { invitation: { create: invitation } }),
        },
      });
    }

    result.cooperatives.push({ name: demo.name, id: cooperativeId, created: true });
  }

  return result;
}
