import type { CooperativeContext } from '../../access';
import { effectOf } from '../domain/capital';
import { formatMoney } from '../domain/money';
import { getMyRecord, listMyMovements, type MemberAreaDeps } from './member-area';

export interface MyContributions {
  partnerNumber: string | null;
  /** Euros, exact decimal string. */
  capital: string;
  /** Newest first; `capitalChange` is signed (a refund is negative). */
  latestMovements: {
    date: string;
    type: string;
    concept: string;
    capitalChange: string;
  }[];
}

/** What the AI assistant reads (requirements/07, section 3). Same use cases, same permissions, always the caller's own data. */
export interface MemberAreaReads {
  myContributions(context: CooperativeContext, count: number): Promise<MyContributions>;
}

export function createMemberAreaReads(deps: MemberAreaDeps): MemberAreaReads {
  return {
    async myContributions(context, count) {
      const { member, balanceCents } = await getMyRecord(deps, context);
      const { movements } = await listMyMovements(deps, context);
      return {
        partnerNumber: member.partnerNumber,
        capital: formatMoney(balanceCents),
        latestMovements: movements.slice(0, count).map((movement) => ({
          date: movement.date,
          type: movement.type,
          concept: movement.concept,
          capitalChange: formatMoney(effectOf(movement.type, movement.amountCents)),
        })),
      };
    },
  };
}
