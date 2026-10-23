import type { CooperativeContext } from '../../access';
import { effectOf } from '../domain/capital';
import { formatMoney } from '../domain/money';
import {
  capitalSummary,
  findPartners,
  getMyRecord,
  latestMovementsOf,
  listMyMovements,
  memberCensus,
  partnersWithNif,
  type MemberAreaDeps,
  type Period,
} from './member-area';

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

export interface CapitalSummaryView {
  /** Euros, exact decimal string. */
  totalCapital: string;
  partners: number;
  /** What was registered in the period; the whole history when no bound was given. */
  period: {
    from: string | null;
    to: string | null;
    contributions: string;
    refunds: string;
    /** Net of the corrections (signed). */
    corrections: string;
  };
}

export interface CensusView {
  activePartners: number;
  suspendedPartners: number;
  /** Invited partners that have not accepted the invitation yet. */
  invitedNotActivated: number;
  /** Null when the question gave no period. */
  joinedInPeriod: number | null;
  leftInPeriod: number | null;
  period: { from: string | null; to: string | null };
}

export interface PartnerDetail {
  name: string;
  email: string;
  partnerNumber: string | null;
  nif: string | null;
  status: string;
  profile: string;
  /** YYYY-MM-DD. */
  joinedAt: string;
  capital: string;
  /** Only when the question matched a single partner. */
  latestMovements?: MyContributions['latestMovements'];
}

export interface PartnerIdentity {
  name: string;
  partnerNumber: string | null;
  nif: string;
}

/** A question about a partner returns at most this many candidates. */
export const MAX_PARTNER_MATCHES = 5;

/**
 * What the AI assistant reads (requirements/07, section 3). Same use cases, same permissions.
 * `myContributions` is always the caller's own data; the others need "all" scope in the member
 * area (the board and the managers) and otherwise fail with a 403 like the app's listing.
 */
export interface MemberAreaReads {
  myContributions(context: CooperativeContext, count: number): Promise<MyContributions>;
  capitalSummary(context: CooperativeContext, period: Period): Promise<CapitalSummaryView>;
  census(context: CooperativeContext, period: Period): Promise<CensusView>;
  /** Partners matching a name, partner number or email; their latest movements only if one matches. */
  memberDetail(context: CooperativeContext, query: string, count: number): Promise<PartnerDetail[]>;
  /** Partners that have a NIF, to cross with third parties (ADR-025). */
  partnersWithNif(context: CooperativeContext): Promise<PartnerIdentity[]>;
}

const day = (value: Date) => value.toISOString().slice(0, 10);

export function createMemberAreaReads(deps: MemberAreaDeps): MemberAreaReads {
  return {
    async capitalSummary(context, period) {
      const result = await capitalSummary(deps, context, period);
      return {
        totalCapital: formatMoney(result.totalCents),
        partners: result.partnerCount,
        period: {
          from: period.from ?? null,
          to: period.to ?? null,
          contributions: formatMoney(result.period.contributionsCents),
          refunds: formatMoney(result.period.refundsCents),
          corrections: formatMoney(result.period.correctionsCents),
        },
      };
    },

    async census(context, period) {
      const result = await memberCensus(deps, context, period);
      const bounded = Boolean(period.from || period.to);
      return {
        activePartners: result.activePartners,
        suspendedPartners: result.suspendedPartners,
        invitedNotActivated: result.invitedNotActivated,
        joinedInPeriod: bounded ? result.joinedInPeriod : null,
        leftInPeriod: bounded ? result.leftInPeriod : null,
        period: { from: period.from ?? null, to: period.to ?? null },
      };
    },

    async memberDetail(context, query, count) {
      const matches = await findPartners(deps, context, query);
      const shown = matches.slice(0, MAX_PARTNER_MATCHES);
      return Promise.all(
        shown.map(async ({ member, balanceCents }) => ({
          name: member.name,
          email: member.email,
          partnerNumber: member.partnerNumber,
          nif: member.nif,
          status: member.status,
          profile: member.profileName,
          joinedAt: day(member.joinedAt),
          capital: formatMoney(balanceCents),
          ...(matches.length === 1 && {
            latestMovements: (await latestMovementsOf(deps, context, member, count)).map(
              (movement) => ({
                date: movement.date,
                type: movement.type,
                concept: movement.concept,
                capitalChange: formatMoney(effectOf(movement.type, movement.amountCents)),
              }),
            ),
          }),
        })),
      );
    },

    async partnersWithNif(context) {
      const partners = await partnersWithNif(deps, context);
      return partners.map((partner) => ({
        name: partner.name,
        partnerNumber: partner.partnerNumber,
        nif: partner.nif!,
      }));
    },

    async myContributions(context, count) {
      const { member, balanceCents } = await getMyRecord(deps, context);
      // Only the latest few are read: one small page, the capital comes from the record.
      const { movements } = await listMyMovements(deps, context, { limit: count });
      return {
        partnerNumber: member.partnerNumber,
        capital: formatMoney(balanceCents),
        latestMovements: movements.map((movement) => ({
          date: movement.date,
          type: movement.type,
          concept: movement.concept,
          capitalChange: formatMoney(effectOf(movement.type, movement.amountCents)),
        })),
      };
    },
  };
}
