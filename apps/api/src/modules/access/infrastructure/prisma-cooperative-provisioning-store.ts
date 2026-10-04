import type { PrismaClient } from '../../../shared/infrastructure/prisma';
import type {
  CooperativeProvisioningStore,
  ProvisionCooperativeData,
  ProvisionCooperativeResult,
} from '../application/ports/cooperative-provisioning-store';
import { toPermissionColumns } from './permission-mapper';

export class PrismaCooperativeProvisioningStore implements CooperativeProvisioningStore {
  constructor(private readonly prisma: PrismaClient) {}

  async findUserByEmail(email: string): Promise<{ id: string; hasPassword: boolean } | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    });
    return user && { id: user.id, hasPassword: user.passwordHash !== null };
  }

  async cooperativeExistsByCif(cif: string): Promise<boolean> {
    return (await this.prisma.cooperative.count({ where: { cif } })) > 0;
  }

  provision(data: ProvisionCooperativeData): Promise<ProvisionCooperativeResult> {
    return this.prisma.$transaction(async (tx) => {
      const cooperative = await tx.cooperative.create({
        data: { name: data.name, cif: data.cif },
      });

      const profileIds = new Map<string, string>();
      for (const profile of data.profiles) {
        const created = await tx.profile.create({
          data: {
            cooperativeId: cooperative.id,
            name: profile.name,
            predefined: true,
            permissions: { create: profile.permissions.map(toPermissionColumns) },
          },
        });
        profileIds.set(profile.name, created.id);
      }

      const adminUserId =
        data.admin.kind === 'existing'
          ? data.admin.userId
          : (
              await tx.user.create({
                data: {
                  email: data.admin.email,
                  name: data.admin.name,
                  passwordHash: data.admin.passwordHash,
                },
              })
            ).id;

      const membership = await tx.membership.create({
        data: {
          userId: adminUserId,
          cooperativeId: cooperative.id,
          profileId: profileIds.get(data.adminProfileName)!,
          status: 'activa',
        },
      });

      return { cooperativeId: cooperative.id, adminUserId, adminMembershipId: membership.id };
    });
  }
}
