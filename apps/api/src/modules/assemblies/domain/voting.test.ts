import { describe, expect, it } from 'vitest';

import {
  AlreadyVotedError,
  InvalidVotingTransitionError,
  NotInCensusError,
  VotingClosedError,
} from './errors';
import { assertCanClose, assertCanOpen, assertCanVote, visibleTally } from './voting';

const open = {
  assemblyStatus: 'convocada',
  votable: true,
  votingStatus: 'pendiente',
  censusSize: 10,
} as const;

describe('abrir y cerrar una votación (HU-ASA-04)', () => {
  it('se abre un punto votable de una asamblea convocada', () => {
    expect(() => assertCanOpen(open)).not.toThrow();
  });

  it.each([
    [{ ...open, assemblyStatus: 'borrador' }, 'asamblea no convocada'],
    [{ ...open, votable: false }, 'punto informativo'],
    [{ ...open, votingStatus: 'abierta' }, 'ya abierta'],
    [{ ...open, votingStatus: 'cerrada' }, 'ya cerrada'],
    [{ ...open, censusSize: 0 }, 'sin socios en el censo'],
  ] as const)('no se abre: %o (%s)', (input, _reason) => {
    expect(() => assertCanOpen(input)).toThrow(InvalidVotingTransitionError);
  });

  it('solo se cierra una votación abierta', () => {
    expect(() => assertCanClose('abierta')).not.toThrow();
    expect(() => assertCanClose('pendiente')).toThrow(InvalidVotingTransitionError);
    expect(() => assertCanClose('cerrada')).toThrow(InvalidVotingTransitionError);
  });
});

describe('votar (HU-ASA-05)', () => {
  it('Dado que estoy en el censo y no he votado, entonces puedo votar', () => {
    expect(() =>
      assertCanVote({ votingStatus: 'abierta', inCensus: true, previousVote: null }),
    ).not.toThrow();
  });

  it('Dado que ya he votado, entonces se rechaza y se indica el voto emitido', () => {
    try {
      assertCanVote({ votingStatus: 'abierta', inCensus: true, previousVote: 'en_contra' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AlreadyVotedError);
      expect((error as AlreadyVotedError).choice).toBe('en_contra');
    }
  });

  it('Dado que no estaba en el censo, entonces se rechaza', () => {
    expect(() =>
      assertCanVote({ votingStatus: 'abierta', inCensus: false, previousVote: null }),
    ).toThrow(NotInCensusError);
  });

  it('Dado una votación cerrada, entonces se rechaza', () => {
    expect(() =>
      assertCanVote({ votingStatus: 'cerrada', inCensus: true, previousVote: null }),
    ).toThrow(VotingClosedError);
  });
});

describe('qué se ve del recuento (RN-ASA-11)', () => {
  const tally = { inFavor: 3, against: 1, abstentions: 0 };

  it('abierta y sin gestión: no se ve el sentido de los votos', () => {
    expect(visibleTally('abierta', false, tally)).toBeNull();
  });

  it('abierta con gestión, o cerrada para todos: se ve', () => {
    expect(visibleTally('abierta', true, tally)).toEqual(tally);
    expect(visibleTally('cerrada', false, tally)).toEqual(tally);
  });
});
