import { z } from 'zod';

// Límite superior para no gastar CPU de Argon2 en entradas desmesuradas.
const password = z.string().min(1).max(256);
const opaqueToken = z.string().min(1).max(512);

export const loginRequestSchema = z.object({
  email: z.string().trim().min(1).max(320),
  password,
});

export const refreshRequestSchema = z.object({ refreshToken: opaqueToken });

export const logoutRequestSchema = refreshRequestSchema;

export const acceptInvitationRequestSchema = z.object({
  token: opaqueToken,
  /** Solo para un usuario nuevo; un usuario con cuenta no la necesita. */
  password: password.optional(),
});

export const authTokensSchema = z.object({
  accessToken: z.string(),
  /** Segundos hasta que caduca el token de acceso. */
  accessTokenExpiresIn: z.number().int().positive(),
  refreshToken: z.string(),
});

export const acceptInvitationResponseSchema = z.object({
  cooperativeId: z.uuid(),
  /** Nulo si el usuario ya tenía cuenta: debe iniciar sesión con su contraseña. */
  tokens: authTokensSchema.nullable(),
});

export const apiErrorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;
export type LogoutRequest = z.infer<typeof logoutRequestSchema>;
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;
export type AuthTokens = z.infer<typeof authTokensSchema>;
export type AcceptInvitationResponse = z.infer<typeof acceptInvitationResponseSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
