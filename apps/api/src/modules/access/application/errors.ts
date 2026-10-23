/** Base class for failures of the access use cases that are not domain rules. */
export abstract class AccessApplicationError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class CooperativeAlreadyExistsError extends AccessApplicationError {
  readonly code = 'cooperative_already_exists';

  constructor(cif: string) {
    super(`A cooperative with tax id ${cif} already exists.`);
  }
}

export class PasswordRequiredError extends AccessApplicationError {
  readonly code = 'password_required';

  constructor() {
    super('The administrator is a new user: a password is required.');
  }
}

/** Generic on purpose: never tells whether the email exists (NFR-ACC-05). */
export class InvalidCredentialsError extends AccessApplicationError {
  readonly code = 'invalid_credentials';

  constructor() {
    super('Incorrect email or password.');
  }
}

export class LoginLockedError extends AccessApplicationError {
  readonly code = 'login_locked';

  constructor(readonly until: Date) {
    super('Too many failed attempts. Try again later (BR-ACC-11).');
  }
}

export class NoActiveMembershipError extends AccessApplicationError {
  readonly code = 'no_active_membership';

  constructor() {
    super('You do not have access to any cooperative.');
  }
}

/** Unknown, expired, revoked or replayed: the client must log in again. */
export class InvalidRefreshTokenError extends AccessApplicationError {
  readonly code = 'invalid_refresh_token';

  constructor() {
    super('The session is not valid. Log in again.');
  }
}

/** Missing, invalid or expired access token, or a closed session: 401 (US-ACC-07). */
export class UnauthenticatedError extends AccessApplicationError {
  readonly code = 'unauthenticated';

  constructor() {
    super('Authentication is required.');
  }
}

/**
 * The cooperative does not exist or the user has no active membership in it.
 * Both look the same, so nobody learns which cooperatives exist (ADR-003, NFR-ACC-06).
 */
export class CooperativeNotFoundError extends AccessApplicationError {
  readonly code = 'not_found';

  constructor() {
    super('Not found.');
  }
}

/** Same code as an expired or used invitation: an unknown token reveals nothing more. */
export class InvitationNotFoundError extends AccessApplicationError {
  readonly code = 'invitation_not_usable';

  constructor() {
    super(
      'The invitation has expired or was already used; a new one must be requested (BR-ACC-10).',
    );
  }
}

export class AdminNotActivatedError extends AccessApplicationError {
  readonly code = 'admin_not_activated';

  constructor() {
    super(
      'That email has a pending invitation: it must be activated before administering another cooperative.',
    );
  }
}

/** A member of another cooperative, or one that does not exist: 404 (NFR-ACC-06). */
export class MemberNotFoundError extends AccessApplicationError {
  readonly code = 'not_found';

  constructor() {
    super('Not found.');
  }
}

/** US-ACC-08: the email already has a live membership in this cooperative. */
export class MemberAlreadyExistsError extends AccessApplicationError {
  readonly code = 'member_already_exists';

  constructor() {
    super('That person is already a member of the cooperative or has a pending invitation.');
  }
}

/** The profile does not exist in this cooperative. */
export class ProfileNotFoundError extends AccessApplicationError {
  readonly code = 'profile_not_found';

  constructor() {
    super('The profile does not exist in this cooperative.');
  }
}

export class InvitationNotPendingError extends AccessApplicationError {
  readonly code = 'invitation_not_pending';

  constructor() {
    super('Only the invitation of a member who has not accepted it yet can be resent.');
  }
}

/** No way to deliver invitations is configured (production without email provider). */
export class InvitationDeliveryUnavailableError extends AccessApplicationError {
  readonly code = 'invitation_delivery_unavailable';

  constructor() {
    super('The invitation could not be sent. Try again later by resending it.');
  }
}

/** Another live membership of the cooperative already has this NIF (ADR-025). */
export class MemberNifTakenError extends AccessApplicationError {
  readonly code = 'member_nif_taken';

  constructor() {
    super('Another member of the cooperative already has this NIF.');
  }
}
