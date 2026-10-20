import { WeakPasswordError } from './errors';

export const MIN_PASSWORD_LENGTH = 10;

/** NFR-ACC-01. */
export function assertPasswordPolicy(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new WeakPasswordError(
      `The password must have at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }
}
