import { normalizeEmail } from '../domain/email';
import { lockedUntil, relevantAttemptsSince } from '../domain/login-lockout';
import { InvalidCredentialsError, LoginLockedError, NoActiveMembershipError } from './errors';
import type { LoginStore } from './ports/login-store';
import type { PasswordHasher } from './ports/password-hasher';
import { type AuthTokens, type SessionDeps, startSession } from './session-tokens';

export interface LoginInput {
  email: string;
  password: string;
}

/** US-ACC-02. */
export async function login(
  deps: SessionDeps & { loginStore: LoginStore; hasher: PasswordHasher },
  input: LoginInput,
): Promise<AuthTokens> {
  const now = deps.now();
  const email = normalizeEmail(input.email);

  // Checked before the password: while locked, even the right password is refused.
  // Attempts are counted per email whether or not it exists (NFR-ACC-05).
  const failures = await deps.loginStore.failedAttemptsSince(email, relevantAttemptsSince(now));
  const until = lockedUntil(failures, now);
  if (until) throw new LoginLockedError(until);

  const user = await deps.loginStore.findCredentialsByEmail(email);
  const valid = await deps.hasher.verify(user?.passwordHash ?? null, input.password);
  if (!user || !valid) {
    await deps.loginStore.recordFailedAttempt(email, now);
    throw new InvalidCredentialsError();
  }
  await deps.loginStore.clearFailedAttempts(email);

  if ((await deps.loginStore.countActiveMemberships(user.id)) === 0) {
    throw new NoActiveMembershipError();
  }
  return startSession(deps, user.id, now);
}
