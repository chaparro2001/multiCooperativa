import type { DomainEvent } from '../../../shared/events';
import type { Outcome } from '../domain/voting-result';

/** Notifications tell the members (requisitos/04, section 6). */
export type AssemblyConvened = DomainEvent<
  'AsambleaConvocada',
  { cooperativeId: string; assemblyId: string; firstCallAt: string }
>;

export type VotingOpened = DomainEvent<
  'VotacionAbierta',
  { cooperativeId: string; assemblyId: string; pointId: string; title: string }
>;

export type VotingClosed = DomainEvent<
  'VotacionCerrada',
  { cooperativeId: string; assemblyId: string; pointId: string; title: string; outcome: Outcome }
>;

export type AssemblyEvent = AssemblyConvened | VotingOpened | VotingClosed;
