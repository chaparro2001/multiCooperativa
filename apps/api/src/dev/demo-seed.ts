import { createHash, randomBytes } from 'node:crypto';

import type { AccessModule } from '../modules/access';
import type { PrismaClient } from '../shared/infrastructure/prisma';

/**
 * Demo data for development and the TFM demo: two cooperatives with a user of
 * every predefined profile. Never run against production.
 */

type ProfileName = 'Socio' | 'Consejo rector' | 'Gestor' | 'Administrador';
type Status = 'active' | 'suspended' | 'invited';

/** Capital movement of the member area (requirements/06). Amount as registered: a correction is signed. */
interface DemoMovement {
  date: string;
  type: 'mandatory_contribution' | 'voluntary_contribution' | 'refund' | 'correction';
  concept: string;
  amount: string;
}

const mandatory = (date: string, amount: string): DemoMovement => ({
  date,
  type: 'mandatory_contribution',
  concept: 'Aportación obligatoria al capital',
  amount,
});
const voluntary = (date: string, amount: string, concept: string): DemoMovement => ({
  date,
  type: 'voluntary_contribution',
  concept,
  amount,
});

interface DemoMember {
  email: string;
  name: string;
  profile: ProfileName;
  isPartner: boolean;
  partnerNumber?: string;
  status?: Status;
  /** Added once, only to a member who has no movement yet. */
  capital?: DemoMovement[];
}

interface DemoCooperative {
  name: string;
  /** Valid control digit: invoices will validate tax ids (Milestone 4). */
  cif: string;
  admin: { email: string; name: string; partnerNumber: string; capital?: DemoMovement[] };
  members: DemoMember[];
}

/** In two cooperatives with different profiles: exercises the cooperative selector (US-ACC-05). */
const LUCIA = { email: 'lucia@demo.test', name: 'Lucía Martín' };

export const DEMO_COOPERATIVES: DemoCooperative[] = [
  {
    name: 'Cooperativa Agrícola San Isidro',
    cif: 'F12345674',
    admin: {
      email: 'admin@sanisidro.test',
      name: 'Ana Torres',
      partnerNumber: '001',
      capital: [
        mandatory('2024-01-15', '600.00'),
        voluntary('2025-03-10', '150.00', 'Aportación voluntaria'),
      ],
    },
    members: [
      {
        email: 'consejo@sanisidro.test',
        name: 'Carlos Ruiz',
        profile: 'Consejo rector',
        isPartner: true,
        partnerNumber: '002',
        capital: [
          mandatory('2024-01-15', '600.00'),
          voluntary('2025-06-02', '500.00', 'Aportación voluntaria para la nave nueva'),
          {
            date: '2026-02-10',
            type: 'refund',
            concept: 'Devolución parcial',
            amount: '100.00',
          },
        ],
      },
      // Hired manager: manages invoices but is not a partner, so cannot vote (BR-ACC-06).
      { email: 'gestor@sanisidro.test', name: 'Elena Gómez', profile: 'Gestor', isPartner: false },
      {
        email: 'socio@sanisidro.test',
        name: 'Javier López',
        profile: 'Socio',
        isPartner: true,
        partnerNumber: '003',
        capital: [
          mandatory('2024-02-01', '600.00'),
          voluntary('2025-05-20', '250.50', 'Aportación voluntaria campaña 2025'),
          {
            date: '2025-11-12',
            type: 'refund',
            concept: 'Devolución parcial',
            amount: '100.00',
          },
          {
            date: '2025-11-13',
            type: 'correction',
            concept: 'Corrección de la devolución',
            amount: '-0.50',
          },
        ],
      },
      {
        ...LUCIA,
        profile: 'Socio',
        isPartner: true,
        partnerNumber: '004',
        capital: [mandatory('2024-03-05', '600.00')],
      },
      {
        email: 'suspendido@sanisidro.test',
        name: 'Pedro Sanz',
        profile: 'Socio',
        isPartner: true,
        partnerNumber: '005',
        status: 'suspended',
        capital: [mandatory('2024-01-20', '600.00')],
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
    admin: {
      email: 'admin@laesperanza.test',
      name: 'Rosa Navarro',
      partnerNumber: '001',
      capital: [mandatory('2023-11-30', '900.00')],
    },
    members: [
      {
        ...LUCIA,
        profile: 'Consejo rector',
        isPartner: true,
        partnerNumber: '002',
        capital: [
          mandatory('2023-11-30', '900.00'),
          voluntary('2025-04-18', '300.00', 'Aportación voluntaria'),
        ],
      },
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
        capital: [
          mandatory('2024-05-06', '900.00'),
          voluntary('2026-01-15', '100.00', 'Aportación voluntaria'),
        ],
      },
    ],
  },
];

export interface DemoSeedResult {
  cooperatives: { name: string; id: string; created: boolean }[];
  /** Raw tokens of the pending invitations created now, to open the activation screen. */
  invitations: { email: string; token: string }[];
  /** Capital movements added now: only to members who had none, so a second run adds nothing. */
  capitalMovementsAdded: number;
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
  const result: DemoSeedResult = { cooperatives: [], invitations: [], capitalMovementsAdded: 0 };

  for (const demo of DEMO_COOPERATIVES) {
    const existing = await prisma.cooperative.findUnique({ where: { cif: demo.cif } });
    if (existing) {
      result.cooperatives.push({ name: demo.name, id: existing.id, created: false });
      result.capitalMovementsAdded += await seedCapital(prisma, existing.id, demo);
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
    result.capitalMovementsAdded += await seedCapital(prisma, cooperativeId, demo);
  }

  return result;
}

/**
 * Additive and idempotent, also on a cooperative that already exists (the hosted demo): a member
 * who already has any movement is left alone, so nothing is duplicated and nothing registered
 * through the app is touched. Recorded by the cooperative's administrator.
 */
async function seedCapital(
  prisma: PrismaClient,
  cooperativeId: string,
  demo: DemoCooperative,
): Promise<number> {
  const planned = [
    { email: demo.admin.email, movements: demo.admin.capital ?? [] },
    ...demo.members.map((member) => ({ email: member.email, movements: member.capital ?? [] })),
  ].filter((entry) => entry.movements.length > 0);

  const memberships = await prisma.membership.findMany({
    where: {
      cooperativeId,
      user: { email: { in: [demo.admin.email, ...planned.map((p) => p.email)] } },
    },
    select: { id: true, joinedAt: true, user: { select: { email: true } } },
  });
  const membershipOf = (email: string) => memberships.find((m) => m.user.email === email)?.id;
  const recordedBy = membershipOf(demo.admin.email);
  if (!recordedBy) return 0;

  let added = 0;
  for (const { email, movements } of planned) {
    const membershipId = membershipOf(email);
    if (!membershipId) continue;
    // The partner joined the day of their first movement; only fills a joining date that is not set.
    if (!memberships.find((m) => m.id === membershipId)?.joinedAt) {
      await prisma.membership.update({
        where: { id: membershipId },
        data: { joinedAt: new Date(`${movements[0]!.date}T00:00:00Z`) },
      });
    }
    const existing = await prisma.capitalMovement.count({ where: { cooperativeId, membershipId } });
    if (existing > 0) continue;
    await prisma.capitalMovement.createMany({
      data: movements.map((movement, index) => ({
        cooperativeId,
        membershipId,
        date: new Date(`${movement.date}T00:00:00Z`),
        type: movement.type,
        concept: movement.concept,
        amount: movement.amount,
        recordedByMembershipId: recordedBy,
        // Keeps the order of a day with several movements.
        recordedAt: new Date(new Date(`${movement.date}T09:00:00Z`).getTime() + index * 1000),
      })),
    });
    added += movements.length;
  }
  return added;
}
