import { beforeEach, describe, expect, it } from 'vitest';

import { createPermission } from '../domain/permission';
import { CooperativeNotFoundError, UnauthenticatedError } from './errors';
import type {
  AccessContextStore,
  ActiveMembership,
  UserSummary,
} from './ports/access-context-store';
import type { AccessTokenVerifier } from './ports/tokens';
import { authenticateRequest, getMe, resolveCooperativeContext } from './request-context';
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

describe('request authentication (US-ACC-07)', () => {
  it('accepts a valid token of an open session', async () => {
    await expect(authenticateRequest(deps(), `valid:user-1:${sessionId}`)).resolves.toEqual({
      userId: 'user-1',
      sessionId,
    });
  });

  it('Given a request without a valid session, when it reaches a protected endpoint, then it is rejected', async () => {
    await expect(authenticateRequest(deps(), undefined)).rejects.toThrow(UnauthenticatedError);
    await expect(authenticateRequest(deps(), 'firma-mala')).rejects.toThrow(UnauthenticatedError);
  });

  it('a closed session stops being valid immediately, even if the JWT has not expired', async () => {
    await sessions.revoke(sessionId, clock.now());

    await expect(authenticateRequest(deps(), `valid:user-1:${sessionId}`)).rejects.toThrow(
      UnauthenticatedError,
    );
  });

  it('an expired session is not valid', async () => {
    clock.current = new Date('2026-11-09T10:00:00Z');

    await expect(authenticateRequest(deps(), `valid:user-1:${sessionId}`)).rejects.toThrow(
      UnauthenticatedError,
    );
  });

  it('the token user must be the session user', async () => {
    await expect(authenticateRequest(deps(), `valid:user-2:${sessionId}`)).rejects.toThrow(
      UnauthenticatedError,
    );
  });

  it('a session that does not exist is not valid', async () => {
    await expect(
      authenticateRequest(deps(), 'valid:user-1:00000000-0000-4000-8000-000000000999'),
    ).rejects.toThrow(UnauthenticatedError);
  });
});

describe('cooperative context (ADR-003)', () => {
  const membership: ActiveMembership = {
    membershipId: 'mem-1',
    profileName: 'Socio',
    isPartner: true,
    permissions: [createPermission('announcements', 'read')],
  };
  const contexts: AccessContextStore = {
    findActiveMembership: async (userId, cooperativeId) =>
      userId === 'user-1' && cooperativeId === COOP ? membership : null,
    findUserSummary: async () => null,
  };
  const session = { userId: 'user-1', sessionId: 'sess-1' };

  it('builds the context with the permissions of the active membership', async () => {
    await expect(resolveCooperativeContext({ contexts }, session, COOP)).resolves.toEqual({
      ...session,
      cooperativeId: COOP,
      ...membership,
    });
  });

  it('Given a user without an active membership in a cooperative, when they request one of its resources, then it is not found', async () => {
    await expect(resolveCooperativeContext({ contexts }, session, OTHER_COOP)).rejects.toThrow(
      CooperativeNotFoundError,
    );
  });

  it('an identifier that is not a UUID does not exist either', async () => {
    await expect(resolveCooperativeContext({ contexts }, session, 'abc')).rejects.toThrow(
      CooperativeNotFoundError,
    );
  });
});

describe('GET /me (US-ACC-05, US-ACC-14)', () => {
  const summary: UserSummary = {
    id: 'user-1',
    email: 'ada@campo.es',
    name: 'Ada',
    memberships: [
      {
        membershipId: 'mem-1',
        cooperativeId: COOP,
        cooperativeName: 'Campo',
        primaryColor: '#7A1F5C',
        profileName: 'Socio',
        isPartner: true,
      },
      {
        membershipId: 'mem-2',
        cooperativeId: OTHER_COOP,
        cooperativeName: 'Mar',
        primaryColor: null,
        profileName: 'Socio',
        isPartner: false,
      },
    ],
  };
  const contexts: AccessContextStore = {
    findActiveMembership: async () => null,
    findUserSummary: async (userId) => (userId === 'user-1' ? summary : null),
  };

  it('returns each membership with its cooperative colour, null for the default theme', async () => {
    const me = await getMe({ contexts }, { userId: 'user-1', sessionId: 'sess-1' });
    expect(me.memberships.map((m) => m.primaryColor)).toEqual(['#7A1F5C', null]);
  });
});
