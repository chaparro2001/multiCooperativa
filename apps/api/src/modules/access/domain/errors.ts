/** Base class for business-rule violations of the access module. */
export abstract class AccessDomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidPermissionError extends AccessDomainError {
  readonly code = 'invalid_permission';
}

/** The profile has no permission for the module: 403 (RNF-ACC-06). */
export class ModuleAccessDeniedError extends AccessDomainError {
  readonly code = 'forbidden';

  constructor(
    readonly module: string,
    readonly required: string,
  ) {
    super('Tu perfil no tiene acceso a este módulo.');
  }
}

export class InvalidMembershipTransitionError extends AccessDomainError {
  readonly code = 'invalid_membership_transition';
}

export class SelfModificationError extends AccessDomainError {
  readonly code = 'self_modification';

  constructor() {
    super('Un administrador no puede modificar su propia membresía (RN-ACC-08).');
  }
}

export class LastAdminError extends AccessDomainError {
  readonly code = 'last_admin';

  constructor() {
    super('La cooperativa debe conservar al menos un administrador activo (RN-ACC-07).');
  }
}

export class InvitationNotUsableError extends AccessDomainError {
  readonly code = 'invitation_not_usable';

  constructor(readonly reason: 'expired' | 'used') {
    super('La invitación ha caducado o ya se ha usado; hay que pedir una nueva (RN-ACC-10).');
  }
}

export class WeakPasswordError extends AccessDomainError {
  readonly code = 'weak_password';
}
