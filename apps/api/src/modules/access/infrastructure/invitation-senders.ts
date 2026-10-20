import type { InvitationSender } from '../application/ports/invitation-sender';
import { InvitationDeliveryUnavailableError } from '../application/errors';

/** Deep link that opens the activation screen of the app (scheme in apps/mobile/app.json). */
export function invitationLink(token: string): string {
  return `multicooperativa://invitation?token=${encodeURIComponent(token)}`;
}

/**
 * Development only: prints the link instead of emailing it. It writes a token
 * to the log, which NFR-ACC-08 forbids anywhere else, so it is never used in production.
 */
export class ConsoleInvitationSender implements InvitationSender {
  async send(invitation: { email: string; token: string; expiresAt: Date }): Promise<void> {
    console.info(
      `[invitation · development only] ${invitation.email} → ${invitationLink(invitation.token)} ` +
        `(expires ${invitation.expiresAt.toISOString()})`,
    );
  }
}

/** Until an email provider is configured: the membership is created and can be resent later. */
export class UnavailableInvitationSender implements InvitationSender {
  async send(): Promise<void> {
    throw new InvitationDeliveryUnavailableError();
  }
}
