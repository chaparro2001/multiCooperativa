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

/** The profile has no permission for the module: 403 (NFR-ACC-06). */
export class ModuleAccessDeniedError extends AccessDomainError {
  readonly code = 'forbidden';

  constructor(
    readonly module: string,
    readonly required: string,
  ) {
    super('Your profile has no access to this module.');
  }
}

export class InvalidMembershipTransitionError extends AccessDomainError {
  readonly code = 'invalid_membership_transition';
}

export class SelfModificationError extends AccessDomainError {
  readonly code = 'self_modification';

  constructor() {
    super('An administrator cannot modify their own membership (BR-ACC-08).');
  }
}

export class LastAdminError extends AccessDomainError {
  readonly code = 'last_admin';

  constructor() {
    super('The cooperative must keep at least one active administrator (BR-ACC-07).');
  }
}

export class InvitationNotUsableError extends AccessDomainError {
  readonly code = 'invitation_not_usable';

  constructor(readonly reason: 'expired' | 'used') {
    super(
      'The invitation has expired or was already used; a new one must be requested (BR-ACC-10).',
    );
  }
}

export class WeakPasswordError extends AccessDomainError {
  readonly code = 'weak_password';
}

/** The partner's NIF has a wrong letter or check digit (ADR-025). */
export class InvalidMemberNifError extends AccessDomainError {
  readonly code = 'invalid_member_nif';

  constructor() {
    super('The NIF is not valid: check the letter or the check digit.');
  }
}
