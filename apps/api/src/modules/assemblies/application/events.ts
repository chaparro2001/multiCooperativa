import type { DomainEvent } from '../../../shared/events';
import type { Outcome } from '../domain/voting-result';

/** Notifications tell the members (docs/requirements/04-assemblies.md, section 6). */
export type AssemblyConvened = DomainEvent<
  'AssemblyConvened',
  { cooperativeId: string; assemblyId: string; firstCallAt: string }
>;

export type VotingOpened = DomainEvent<
  'VotingOpened',
  { cooperativeId: string; assemblyId: string; pointId: string; title: string }
>;

export type VotingClosed = DomainEvent<
  'VotingClosed',
  { cooperativeId: string; assemblyId: string; pointId: string; title: string; outcome: Outcome }
>;

/**
 * US-ASM-09: a convened assembly moved. Dates are ISO instants. The announcements
 * module publishes the notice when `notifyMembers` is true.
 */
export type AssemblyRescheduled = DomainEvent<
  'AssemblyRescheduled',
  {
    cooperativeId: string;
    assemblyId: string;
    assemblyType: 'ordinary' | 'extraordinary';
    previous: { firstCallAt: string; secondCallAt: string | null; place: string };
    firstCallAt: string;
    secondCallAt: string | null;
    place: string;
    reason: string | null;
    notifyMembers: boolean;
    rescheduledByMembershipId: string;
  }
>;

export type AssemblyEvent = AssemblyConvened | AssemblyRescheduled | VotingOpened | VotingClosed;
