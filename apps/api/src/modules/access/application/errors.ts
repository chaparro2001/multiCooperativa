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
    super(`Ya existe una cooperativa con el CIF ${cif}.`);
  }
}

export class PasswordRequiredError extends AccessApplicationError {
  readonly code = 'password_required';

  constructor() {
    super('El administrador es un usuario nuevo: hace falta una contraseña.');
  }
}

/** Generic on purpose: never tells whether the email exists (RNF-ACC-05). */
export class InvalidCredentialsError extends AccessApplicationError {
  readonly code = 'invalid_credentials';

  constructor() {
    super('Email o contraseña incorrectos.');
  }
}

export class LoginLockedError extends AccessApplicationError {
  readonly code = 'login_locked';

  constructor(readonly until: Date) {
    super('Demasiados intentos fallidos. Vuelve a intentarlo más tarde (RN-ACC-11).');
  }
}

export class NoActiveMembershipError extends AccessApplicationError {
  readonly code = 'no_active_membership';

  constructor() {
    super('No tienes acceso a ninguna cooperativa.');
  }
}

/** Unknown, expired, revoked or replayed: the client must log in again. */
export class InvalidRefreshTokenError extends AccessApplicationError {
  readonly code = 'invalid_refresh_token';

  constructor() {
    super('La sesión no es válida. Vuelve a iniciar sesión.');
  }
}

/** Missing, invalid or expired access token, or a closed session: 401 (HU-ACC-07). */
export class UnauthenticatedError extends AccessApplicationError {
  readonly code = 'unauthenticated';

  constructor() {
    super('Hace falta iniciar sesión.');
  }
}

/**
 * The cooperative does not exist or the user has no active membership in it.
 * Both look the same, so nobody learns which cooperatives exist (ADR-003, RNF-ACC-06).
 */
export class CooperativeNotFoundError extends AccessApplicationError {
  readonly code = 'not_found';

  constructor() {
    super('No encontrado.');
  }
}

/** Same code as an expired or used invitation: an unknown token reveals nothing more. */
export class InvitationNotFoundError extends AccessApplicationError {
  readonly code = 'invitation_not_usable';

  constructor() {
    super('La invitación ha caducado o ya se ha usado; hay que pedir una nueva (RN-ACC-10).');
  }
}

export class AdminNotActivatedError extends AccessApplicationError {
  readonly code = 'admin_not_activated';

  constructor() {
    super(
      'Ese email tiene una invitación pendiente: debe activarla antes de administrar otra cooperativa.',
    );
  }
}
