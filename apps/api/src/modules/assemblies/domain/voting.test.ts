import { describe, expect, it } from 'vitest';

import {
  AlreadyVotedError,
  InvalidVotingTransitionError,
  NotInCensusError,
  VotingClosedError,
} from './errors';
import { assertCanClose, assertCanOpen, assertCanVote, visibleTally } from './voting';

const open = {
  assemblyStatus: 'convened',
  votable: true,
  votingStatus: 'pending',
  censusSize: 10,
} as const;

describe('open and close a voting (US-ASM-04)', () => {
  it('a votable item of a convened assembly is opened', () => {
    expect(() => assertCanOpen(open)).not.toThrow();
  });

  it.each([
    [{ ...open, assemblyStatus: 'draft' }, 'assembly not convened'],
    [{ ...open, votable: false }, 'informative item'],
    [{ ...open, votingStatus: 'open' }, 'already open'],
    [{ ...open, votingStatus: 'closed' }, 'already closed'],
    [{ ...open, censusSize: 0 }, 'no members in the census'],
  ] as const)('is not opened: %o (%s)', (input, _reason) => {
    expect(() => assertCanOpen(input)).toThrow(InvalidVotingTransitionError);
  });

  it('only an open voting is closed', () => {
    expect(() => assertCanClose('open')).not.toThrow();
    expect(() => assertCanClose('pending')).toThrow(InvalidVotingTransitionError);
    expect(() => assertCanClose('closed')).toThrow(InvalidVotingTransitionError);
  });
});

describe('vote (US-ASM-05)', () => {
  it('Given I am in the census and have not voted, then I can vote', () => {
    expect(() =>
      assertCanVote({ votingStatus: 'open', inCensus: true, previousVote: null }),
    ).not.toThrow();
  });

  it('Given I have already voted, then it is rejected and the cast vote is reported', () => {
    try {
      assertCanVote({ votingStatus: 'open', inCensus: true, previousVote: 'against' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AlreadyVotedError);
      expect((error as AlreadyVotedError).choice).toBe('against');
    }
  });

  it('Given I was not in the census, then it is rejected', () => {
    expect(() =>
      assertCanVote({ votingStatus: 'open', inCensus: false, previousVote: null }),
    ).toThrow(NotInCensusError);
  });

  it('a voting that has not been opened accepts no votes', () => {
    expect(() =>
      assertCanVote({ votingStatus: 'pending', inCensus: false, previousVote: null }),
    ).toThrow(VotingClosedError);
  });

  it('Given a closed voting, then it is rejected', () => {
    expect(() =>
      assertCanVote({ votingStatus: 'closed', inCensus: true, previousVote: null }),
    ).toThrow(VotingClosedError);
  });
});

describe('what is visible of the tally (BR-ASM-11)', () => {
  const tally = { inFavor: 3, against: 1, abstentions: 0 };

  it('open and without manage access: how people voted is not visible', () => {
    expect(visibleTally('open', false, tally)).toBeNull();
  });

  it('open with manage access, or closed for everyone: visible', () => {
    expect(visibleTally('open', true, tally)).toEqual(tally);
    expect(visibleTally('closed', false, tally)).toEqual(tally);
  });
});
