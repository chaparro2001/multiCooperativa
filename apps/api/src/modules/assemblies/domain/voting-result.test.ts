import { describe, expect, it } from 'vitest';

import { computeResult, DEFAULT_POLICY, resolveResult } from './voting-result';

describe('resultado de una votación: tabla del apartado 9 (RNF-ASA-02)', () => {
  it.each([
    {
      census: 10,
      inFavor: 4,
      against: 1,
      abstentions: 0,
      majority: 'simple',
      call: 'primera',
      expected: 'aprobado',
      why: '50 % de participación',
    },
    {
      census: 10,
      inFavor: 3,
      against: 1,
      abstentions: 0,
      majority: 'simple',
      call: 'primera',
      expected: 'sin_quorum',
      why: '40 % < 50 %',
    },
    {
      census: 10,
      inFavor: 3,
      against: 1,
      abstentions: 0,
      majority: 'simple',
      call: 'segunda',
      expected: 'aprobado',
      why: 'sin mínimo en segunda',
    },
    {
      census: 10,
      inFavor: 3,
      against: 3,
      abstentions: 2,
      majority: 'simple',
      call: 'primera',
      expected: 'rechazado',
      why: 'empate',
    },
    {
      census: 9,
      inFavor: 4,
      against: 2,
      abstentions: 0,
      majority: 'reforzada',
      call: 'segunda',
      expected: 'aprobado',
      why: '4/6 = 2/3',
    },
    {
      census: 9,
      inFavor: 3,
      against: 2,
      abstentions: 1,
      majority: 'reforzada',
      call: 'segunda',
      expected: 'rechazado',
      why: '3/5 < 2/3',
    },
    {
      census: 10,
      inFavor: 0,
      against: 0,
      abstentions: 6,
      majority: 'simple',
      call: 'primera',
      expected: 'rechazado',
      why: 'sin votos a favor',
    },
  ] as const)(
    'censo $census, $inFavor/$against/$abstentions, $majority en $call → $expected ($why)',
    ({ census, inFavor, against, abstentions, majority, call, expected }) => {
      const result = computeResult({
        census,
        tally: { inFavor, against, abstentions },
        majority,
        call,
        policy: DEFAULT_POLICY,
      });
      expect(result.outcome).toBe(expected);
    },
  );
});

describe('detalle del resultado (HU-ASA-06)', () => {
  it('devuelve votos, participación sobre el censo, quórum y convocatoria aplicada', () => {
    expect(
      computeResult({
        census: 10,
        tally: { inFavor: 4, against: 1, abstentions: 2 },
        majority: 'simple',
        call: 'primera',
        policy: DEFAULT_POLICY,
      }),
    ).toEqual({
      census: 10,
      inFavor: 4,
      against: 1,
      abstentions: 2,
      votesCast: 7,
      quorumReached: true,
      call: 'primera',
      outcome: 'aprobado',
    });
  });

  it('RN-ASA-04: las abstenciones cuentan para la participación', () => {
    const result = computeResult({
      census: 10,
      tally: { inFavor: 1, against: 0, abstentions: 4 },
      majority: 'simple',
      call: 'primera',
      policy: DEFAULT_POLICY,
    });
    expect(result).toMatchObject({ votesCast: 5, quorumReached: true, outcome: 'aprobado' });
  });

  it('RN-ASA-07: las abstenciones no cuentan para la mayoría', () => {
    const result = computeResult({
      census: 10,
      tally: { inFavor: 2, against: 1, abstentions: 7 },
      majority: 'reforzada',
      call: 'primera',
      policy: DEFAULT_POLICY,
    });
    // 2/3 de a favor + en contra, aunque sean 2 de 10 votos emitidos.
    expect(result.outcome).toBe('aprobado');
  });

  it('el quórum se calcula con aritmética exacta: 1 de 3 no llega al 33,34 %', () => {
    const policy = { ...DEFAULT_POLICY, quorumPercent: { primera: 34, segunda: 0 } };
    const result = computeResult({
      census: 3,
      tally: { inFavor: 1, against: 0, abstentions: 0 },
      majority: 'simple',
      call: 'primera',
      policy,
    });
    expect(result.quorumReached).toBe(false);
  });

  it('la fracción de la mayoría reforzada es configurable (RN-ASA-08)', () => {
    const policy = { ...DEFAULT_POLICY, reinforced: { numerator: 3, denominator: 4 } };
    const tally = { inFavor: 4, against: 2, abstentions: 0 };
    const input = { census: 9, tally, majority: 'reforzada', call: 'segunda', policy } as const;
    // 4/6 = 0,67 < 3/4
    expect(computeResult(input).outcome).toBe('rechazado');
  });

  it('rechaza un recuento imposible: más votos que censo o negativos', () => {
    const base = { majority: 'simple', call: 'primera', policy: DEFAULT_POLICY } as const;
    expect(() =>
      computeResult({ ...base, census: 2, tally: { inFavor: 2, against: 1, abstentions: 0 } }),
    ).toThrow();
    expect(() =>
      computeResult({ ...base, census: 2, tally: { inFavor: -1, against: 0, abstentions: 0 } }),
    ).toThrow();
  });
});

describe('segunda convocatoria (HU-ASA-07)', () => {
  const tally = { inFavor: 3, against: 1, abstentions: 0 };

  it('Dado segunda convocatoria configurada, cuando no hay quórum en primera, entonces se aplica la segunda', () => {
    const result = resolveResult({
      census: 10,
      tally,
      majority: 'simple',
      policy: DEFAULT_POLICY,
      secondCallAvailable: true,
    });
    expect(result).toMatchObject({ call: 'segunda', quorumReached: true, outcome: 'aprobado' });
  });

  it('sin segunda convocatoria, queda sin quórum (RN-ASA-06)', () => {
    const result = resolveResult({
      census: 10,
      tally,
      majority: 'simple',
      policy: DEFAULT_POLICY,
      secondCallAvailable: false,
    });
    expect(result).toMatchObject({ call: 'primera', quorumReached: false, outcome: 'sin_quorum' });
  });

  it('si hay quórum en primera, se queda en primera aunque exista la segunda', () => {
    const result = resolveResult({
      census: 10,
      tally: { inFavor: 5, against: 1, abstentions: 0 },
      majority: 'simple',
      policy: DEFAULT_POLICY,
      secondCallAvailable: true,
    });
    expect(result.call).toBe('primera');
  });
});
