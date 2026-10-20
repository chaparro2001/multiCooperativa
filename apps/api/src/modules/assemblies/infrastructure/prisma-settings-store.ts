import type { PrismaClient } from '../../../shared/infrastructure/prisma';
import { DEFAULT_MIN_NOTICE_DAYS } from '../domain/assembly';
import { DEFAULT_POLICY } from '../domain/voting-result';
import type { AssemblySettings, AssemblySettingsStore } from '../application/ports/settings-store';

export class PrismaSettingsStore implements AssemblySettingsStore {
  constructor(private readonly prisma: PrismaClient) {}

  async get(cooperativeId: string): Promise<AssemblySettings> {
    const row = await this.prisma.assemblySettings.findUnique({ where: { cooperativeId } });
    if (!row) return { policy: DEFAULT_POLICY, minNoticeDays: DEFAULT_MIN_NOTICE_DAYS };
    return {
      policy: {
        quorumPercent: {
          first: row.firstCallQuorumPercent,
          second: row.secondCallQuorumPercent,
        },
        reinforced: { numerator: row.reinforcedNumerator, denominator: row.reinforcedDenominator },
      },
      minNoticeDays: row.minNoticeDays,
    };
  }
}
