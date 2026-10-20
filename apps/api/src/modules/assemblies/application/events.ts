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

export type AssemblyEvent = AssemblyConvened | VotingOpened | VotingClosed;
