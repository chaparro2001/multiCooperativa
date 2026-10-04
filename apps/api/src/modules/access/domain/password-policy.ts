import { WeakPasswordError } from './errors';

export const MIN_PASSWORD_LENGTH = 10;

/** RNF-ACC-01. */
export function assertPasswordPolicy(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new WeakPasswordError(
      `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    );
  }
}
