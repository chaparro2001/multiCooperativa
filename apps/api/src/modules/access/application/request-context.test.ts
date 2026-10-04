import { beforeEach, describe, expect, it } from 'vitest';

import { createPermission } from '../domain/permission';
import { CooperativeNotFoundError, UnauthenticatedError } from './errors';
import type { AccessContextStore, ActiveMembership } from './ports/access-context-store';
import type { AccessTokenVerifier } from './ports/tokens';
import { authenticateRequest, resolveCooperativeContext } from './request-context';
import { FakeClock, InMemorySessions } from './testing/fakes';

const COOP = '11111111-1111-4111-8111-111111111111';
const OTHER_COOP = '22222222-2222-4222-8222-222222222222';

let clock: FakeClock;
let sessions: InMemorySessions;
let sessionId: string;

/** Accepts tokens of the form "valid:<userId>:<sessionId>". */
const verifier: AccessTokenVerifier = {
  verify: async (token) => {
    const [kind, userId, sid] = token.split(':');
    return kind === 'valid' && userId && sid ? { userId, sessionId: sid } : null;
  },
};

beforeEach(async () => {
  clock = new FakeClock(new Date('2026-10-10T10:00:00Z'));
  sessions = new InMemorySessions();
  sessionId = await sessions.create({
    userId: 'user-1',
    refreshTokenHash: 'h',
    expiresAt: new Date('2026-11-09T10:00:00Z'),
  });
});

const deps = () => ({ accessTokens: verifier, sessions, now: clock.now });

describe('autenticación de la petición (HU-ACC-07)', () => {
  it('acepta un token válido de una sesión abierta', async () => {
    await expect(authenticateRequest(deps(), `valid:user-1:${sessionId}`)).resolves.toEqual({
      userId: 'user-1',
      sessionId,
    });
  });

  it('Dado una petición sin sesión válida, cuando llega a un endpoint protegido, entonces se rechaza', async () => {
    await expect(authenticateRequest(deps(), undefined)).rejects.toThrow(UnauthenticatedError);
    await expect(authenticateRequest(deps(), 'firma-mala')).rejects.toThrow(UnauthenticatedError);
  });

  it('una sesión cerrada deja de valer al momento, aunque el JWT no haya caducado', async () => {
    await sessions.revoke(sessionId, clock.now());

    await expect(authenticateRequest(deps(), `valid:user-1:${sessionId}`)).rejects.toThrow(
      UnauthenticatedError,
    );
  });

  it('una sesión caducada no vale', async () => {
    clock.current = new Date('2026-11-09T10:00:00Z');

    await expect(authenticateRequest(deps(), `valid:user-1:${sessionId}`)).rejects.toThrow(
      UnauthenticatedError,
    );
  });

  it('el usuario del token tiene que ser el de la sesión', async () => {
    await expect(authenticateRequest(deps(), `valid:user-2:${sessionId}`)).rejects.toThrow(
      UnauthenticatedError,
    );
  });

  it('una sesión que no existe no vale', async () => {
    await expect(
      authenticateRequest(deps(), 'valid:user-1:00000000-0000-4000-8000-000000000999'),
    ).rejects.toThrow(UnauthenticatedError);
  });
});

describe('contexto de cooperativa (ADR-003)', () => {
  const membership: ActiveMembership = {
    membershipId: 'mem-1',
    profileName: 'Socio',
    isPartner: true,
    permissions: [createPermission('comunicados', 'consulta')],
  };
  const contexts: AccessContextStore = {
    findActiveMembership: async (userId, cooperativeId) =>
      userId === 'user-1' && cooperativeId === COOP ? membership : null,
    findUserSummary: async () => null,
  };
  const session = { userId: 'user-1', sessionId: 'sess-1' };

  it('construye el contexto con los permisos de la membresía activa', async () => {
    await expect(resolveCooperativeContext({ contexts }, session, COOP)).resolves.toEqual({
      ...session,
      cooperativeId: COOP,
      ...membership,
    });
  });

  it('Dado un usuario sin membresía activa en una cooperativa, cuando pide un recurso de ella, entonces no la encuentra', async () => {
    await expect(resolveCooperativeContext({ contexts }, session, OTHER_COOP)).rejects.toThrow(
      CooperativeNotFoundError,
    );
  });

  it('un identificador que no es UUID tampoco existe', async () => {
    await expect(resolveCooperativeContext({ contexts }, session, 'abc')).rejects.toThrow(
      CooperativeNotFoundError,
    );
  });
});
