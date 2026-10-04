export type Majority = 'simple' | 'reforzada';
export type Call = 'primera' | 'segunda';
export type Outcome = 'aprobado' | 'rechazado' | 'sin_quorum';

export interface Tally {
  readonly inFavor: number;
  readonly against: number;
  readonly abstentions: number;
}

/** Rules a cooperative may configure (RN-ASA-05, RN-ASA-08, RN-ASA-09). */
export interface VotingPolicy {
  /** Integer percentage of the census that must take part, per call. */
  readonly quorumPercent: Readonly<Record<Call, number>>;
  /** Reinforced majority: in favour ≥ numerator/denominator of (in favour + against). */
  readonly reinforced: { readonly numerator: number; readonly denominator: number };
}

export const DEFAULT_POLICY: VotingPolicy = {
  quorumPercent: { primera: 50, segunda: 0 },
  reinforced: { numerator: 2, denominator: 3 },
};

export interface VotingResult extends Tally {
  census: number;
  votesCast: number;
  quorumReached: boolean;
  call: Call;
  outcome: Outcome;
}

function assertTally(census: number, tally: Tally): number {
  const counts = [census, tally.inFavor, tally.against, tally.abstentions];
  if (counts.some((count) => !Number.isInteger(count) || count < 0)) {
    throw new Error('Recuento de votos inválido.');
  }
  const votesCast = tally.inFavor + tally.against + tally.abstentions;
  if (votesCast > census) throw new Error('Hay más votos que socios en el censo.');
  return votesCast;
}

/**
 * Pure result of a closed voting (RNF-ASA-02). Integer arithmetic only, so
 * thresholds such as 2/3 or 50 % are exact.
 */
export function computeResult(input: {
  census: number;
  tally: Tally;
  majority: Majority;
  call: Call;
  policy: VotingPolicy;
}): VotingResult {
  const { census, tally, majority, call, policy } = input;
  const votesCast = assertTally(census, tally);

  // RN-ASA-04/05: votesCast / census ≥ quorum%  ⇔  votesCast · 100 ≥ quorum% · census.
  const quorumReached = votesCast * 100 >= policy.quorumPercent[call] * census;

  // RN-ASA-07/08: abstentions count for participation, never for the majority.
  const decided = tally.inFavor + tally.against;
  const { numerator, denominator } = policy.reinforced;
  const approved =
    majority === 'simple'
      ? tally.inFavor > tally.against
      : tally.inFavor > 0 && tally.inFavor * denominator >= numerator * decided;

  return {
    census,
    ...tally,
    votesCast,
    quorumReached,
    call,
    // RN-ASA-06: without quorum the item is not approved.
    outcome: !quorumReached ? 'sin_quorum' : approved ? 'aprobado' : 'rechazado',
  };
}

/** HU-ASA-07: first call; if it lacks quorum and there is a second call, the second applies. */
export function resolveResult(input: {
  census: number;
  tally: Tally;
  majority: Majority;
  policy: VotingPolicy;
  secondCallAvailable: boolean;
}): VotingResult {
  const first = computeResult({ ...input, call: 'primera' });
  if (first.quorumReached || !input.secondCallAvailable) return first;
  return computeResult({ ...input, call: 'segunda' });
}
