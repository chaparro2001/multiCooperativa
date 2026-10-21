import { z } from 'zod';

// Upper bound so Argon2 CPU is not spent on oversized inputs.
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
  /** Only for a new user; a user who already has an account does not need it. */
  password: password.optional(),
});

export const authTokensSchema = z.object({
  accessToken: z.string(),
  /** Seconds until the access token expires. */
  accessTokenExpiresIn: z.number().int().positive(),
  refreshToken: z.string(),
});

export const acceptInvitationResponseSchema = z.object({
  cooperativeId: z.uuid(),
  /** Null if the user already had an account: they must log in with their password. */
  tokens: authTokensSchema.nullable(),
});

export const apiErrorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  /** Error data for the UI, e.g. which fields are missing when publishing an announcement. */
  details: z.record(z.string(), z.unknown()).optional(),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;
export type LogoutRequest = z.infer<typeof logoutRequestSchema>;
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;
export type AuthTokens = z.infer<typeof authTokensSchema>;
export type AcceptInvitationResponse = z.infer<typeof acceptInvitationResponseSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;

/** One failed field of a request that broke its contract: `details.issues` of a 400 `invalid_request`. */
export const validationIssueSchema = z.object({
  /** Dot-separated path of the field, e.g. `lines.0.concept`; empty for the whole body. */
  path: z.string(),
  /** Zod issue code, e.g. `too_small`, `invalid_format`, `invalid_type`. */
  code: z.string(),
});
export type ValidationIssue = z.infer<typeof validationIssueSchema>;
