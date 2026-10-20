import {
  type AcceptInvitationResponse,
  acceptInvitationResponseSchema,
  authTokensSchema,
} from '@multicooperativa/contracts';

import type { ApiClient } from '../api/api-client';
import { type TokenStore, toStoredTokens } from './token-store';

/** The authentication endpoints (US-ACC-01, US-ACC-02, US-ACC-03) plus token persistence. */
export function createAuthService(deps: {
  api: ApiClient;
  tokens: TokenStore;
  now?: () => number;
}) {
  const now = deps.now ?? Date.now;

  return {
    async signIn(email: string, password: string): Promise<void> {
      const tokens = await deps.api.request('/auth/login', {
        method: 'POST',
        body: { email, password },
        schema: authTokensSchema,
        auth: false,
      });
      await deps.tokens.save(toStoredTokens(tokens, now()));
    },

    /** Returns whether a session started (new user) or the user must log in (existing account). */
    async acceptInvitation(
      token: string,
      password: string | undefined,
    ): Promise<AcceptInvitationResponse> {
      const result = await deps.api.request('/auth/invitations/accept', {
        method: 'POST',
        body: { token, password },
        schema: acceptInvitationResponseSchema,
        auth: false,
      });
      if (result.tokens) await deps.tokens.save(toStoredTokens(result.tokens, now()));
      return result;
    },

    /** Revokes on the server when it can; the device forgets the tokens in any case. */
    async signOut(): Promise<void> {
      const session = await deps.tokens.load();
      try {
        if (session) {
          await deps.api.request('/auth/logout', {
            method: 'POST',
            body: { refreshToken: session.refreshToken },
            auth: false,
          });
        }
      } catch {
        // Offline or already closed: logging out locally is what matters to the user.
      } finally {
        await deps.tokens.clear();
      }
    },

    async hasSession(): Promise<boolean> {
      return (await deps.tokens.load()) !== null;
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
