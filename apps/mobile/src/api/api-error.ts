import { apiErrorSchema } from '@multicooperativa/contracts';

/** An answer of the API other than 2xx, with the `error` code of its body. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static async fromResponse(response: Response): Promise<ApiError> {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Not JSON (a proxy error page, for instance).
    }
    const parsed = apiErrorSchema.safeParse(body);
    const code = parsed.success ? parsed.data.error : `http_${response.status}`;
    const message = parsed.success && parsed.data.message ? parsed.data.message : '';
    return new ApiError(response.status, code, message);
  }
}

/** The request never reached the API (no network, server down). */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super('No se puede conectar con el servidor.', { cause });
    this.name = 'NetworkError';
  }
}

const MESSAGES: Record<string, string> = {
  invalid_request: 'Revisa los datos introducidos.',
  invalid_credentials: 'Email o contraseña incorrectos.',
  login_locked: 'Demasiados intentos fallidos. Espera unos minutos y vuelve a intentarlo.',
  too_many_requests: 'Demasiadas peticiones. Espera unos minutos y vuelve a intentarlo.',
  no_active_membership: 'No tienes acceso a ninguna cooperativa.',
  invitation_not_usable:
    'La invitación ha caducado o ya se ha usado. Pide una nueva a tu cooperativa.',
  weak_password: 'La contraseña debe tener al menos 10 caracteres.',
  unauthenticated: 'Tu sesión ha terminado. Vuelve a iniciar sesión.',
  invalid_refresh_token: 'Tu sesión ha terminado. Vuelve a iniciar sesión.',
  forbidden: 'Tu perfil no tiene acceso a esta sección.',
  not_found: 'No encontrado.',
};

/** The text to show the user for any failure. */
export function messageFor(error: unknown): string {
  if (error instanceof NetworkError) return error.message;
  if (error instanceof ApiError) {
    return MESSAGES[error.code] ?? (error.message || 'Ha ocurrido un error. Inténtalo de nuevo.');
  }
  return 'Ha ocurrido un error. Inténtalo de nuevo.';
}
