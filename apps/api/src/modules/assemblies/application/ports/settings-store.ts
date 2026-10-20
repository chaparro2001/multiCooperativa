import type { VotingPolicy } from '../../domain/voting-result';

export interface AssemblySettings {
  policy: VotingPolicy;
  minNoticeDays: number;
}

/** BR-ASM-05/08/09: per cooperative, with the specification's defaults. */
export interface AssemblySettingsStore {
  get(cooperativeId: string): Promise<AssemblySettings>;
}
