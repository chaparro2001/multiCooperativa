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

export class AdminNotActivatedError extends AccessApplicationError {
  readonly code = 'admin_not_activated';

  constructor() {
    super(
      'Ese email tiene una invitación pendiente: debe activarla antes de administrar otra cooperativa.',
    );
  }
}
