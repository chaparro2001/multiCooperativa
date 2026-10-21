import { acceptInvitationRequestSchema, loginRequestSchema } from '@multicooperativa/contracts';

import { collect, type FieldErrors, mergeErrors, required, zodFieldErrors } from '@/forms/errors';
import { EMAIL_ERROR, isEmail } from '@/forms/rules';
import type { ServerMapping } from '@/forms/server-errors';

/** NFR-ACC-01: the server enforces it too (`weak_password`). */
export const MIN_PASSWORD_LENGTH = 10;

/** US-ACC-02: both fields are needed to try; the server decides if they are right. */
export function validateLogin(values: { email: string; password: string }): FieldErrors {
  const own = collect({
    email: !values.email.trim() ? required : !isEmail(values.email) ? EMAIL_ERROR : undefined,
    password: values.password ? undefined : required,
  });
  const parsed = loginRequestSchema.safeParse(values);
  return mergeErrors(own, parsed.success ? {} : zodFieldErrors(parsed.error));
}

/**
 * US-ACC-01: a new user must choose a password (the server tells with `password_required`);
 * someone who already has an account leaves it empty. When one is typed it must follow the
 * password rules and be repeated.
 */
export function validateInvitation(values: { password: string; confirm: string }): FieldErrors {
  const typed = values.password.length > 0 || values.confirm.length > 0;
  const own = collect({
    password:
      typed && values.password.length < MIN_PASSWORD_LENGTH
        ? { key: 'auth.invitation.errors.passwordTooShort', params: { min: MIN_PASSWORD_LENGTH } }
        : undefined,
    confirm:
      typed && values.confirm !== values.password
        ? { key: 'auth.invitation.errors.confirmMismatch' }
        : undefined,
  });
  const parsed = acceptInvitationRequestSchema.safeParse({
    token: 'x',
    password: values.password || undefined,
  });
  return mergeErrors(
    own,
    parsed.success
      ? {}
      : zodFieldErrors(parsed.error, (path) => (path[0] === 'token' ? null : String(path[0]))),
  );
}

export const INVITATION_FIELDS = ['password', 'confirm'] as const;

export const INVITATION_SERVER_MAPPING: ServerMapping = {
  codes: { password_required: 'password', weak_password: 'password' },
};
