import type { PendingInvitation } from '../ports/invitation-store';
import type { LoginStore, UserCredentials } from '../ports/login-store';
import type { PasswordHasher } from '../ports/password-hasher';
import type { SessionStore, StoredSession } from '../ports/session-store';
import type { SessionDeps } from '../session-tokens';

/** In-memory doubles for the access use cases. Test-only. */

export const fakeHasher: PasswordHasher = {
  hash: async (password) => `hashed(${password})`,
  verify: async (hash, password) => hash === `hashed(${password})`,
};

export class FakeClock {
  constructor(public current: Date) {}
  now = () => this.current;
  advanceMinutes(minutes: number) {
    this.current = new Date(this.current.getTime() + minutes * 60 * 1000);
  }
}

export class InMemorySessions implements SessionStore {
  readonly sessions = new Map<string, StoredSession>();
  private nextId = 1;

  async create(data: { userId: string; refreshTokenHash: string; expiresAt: Date }) {
    const id = `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, '0')}`;
    this.sessions.set(id, { id, ...data, revokedAt: null });
    return id;
  }

  async findById(id: string) {
    return this.sessions.get(id) ?? null;
  }

  async rotate(
    id: string,
    currentHash: string,
    next: { refreshTokenHash: string; expiresAt: Date },
  ) {
    const session = this.sessions.get(id);
    if (!session || session.revokedAt || session.refreshTokenHash !== currentHash) return false;
    this.sessions.set(id, { ...session, ...next });
    return true;
  }

  async revoke(id: string, at: Date) {
    const session = this.sessions.get(id);
    if (session && !session.revokedAt) this.sessions.set(id, { ...session, revokedAt: at });
  }
}

export class InMemoryLoginStore implements LoginStore {
  readonly users = new Map<string, UserCredentials & { activeMemberships: number }>();
  readonly failures: { email: string; at: Date }[] = [];

  addUser(email: string, user: UserCredentials & { activeMemberships: number }) {
    this.users.set(email, user);
  }

  async findCredentialsByEmail(email: string) {
    const user = this.users.get(email);
    return user ? { id: user.id, passwordHash: user.passwordHash } : null;
  }

  async countActiveMemberships(userId: string) {
    return [...this.users.values()].find((user) => user.id === userId)?.activeMemberships ?? 0;
  }

  async failedAttemptsSince(email: string, since: Date) {
    return this.failures.filter((f) => f.email === email && f.at >= since).map((f) => f.at);
  }

  async recordFailedAttempt(email: string, at: Date) {
    this.failures.push({ email, at });
  }

  async clearFailedAttempts(email: string) {
    for (let i = this.failures.length - 1; i >= 0; i--) {
      if (this.failures[i]!.email === email) this.failures.splice(i, 1);
    }
  }
}

export function sessionDeps(clock: FakeClock, sessions = new InMemorySessions()) {
  let secret = 0;
  const deps: SessionDeps = {
    sessions,
    accessTokens: { issue: async ({ userId, sessionId }) => `jwt(${userId},${sessionId})` },
    secrets: { generate: () => `secret-${++secret}`, hash: (token) => `sha(${token})` },
    now: clock.now,
  };
  return { ...deps, sessions };
}

export function pendingInvitation(overrides: Partial<PendingInvitation> = {}): PendingInvitation {
  return {
    id: 'inv-1',
    membershipId: 'mem-1',
    membershipStatus: 'invitada',
    cooperativeId: 'coop-1',
    expiresAt: new Date('2026-10-12T10:00:00Z'),
    usedAt: null,
    user: { id: 'user-1', hasPassword: false },
    ...overrides,
  };
}
