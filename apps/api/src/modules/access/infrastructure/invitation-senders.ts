import type { InvitationDelivery, InvitationSender } from '../application/ports/invitation-sender';
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

/** Web activation page, served by the hosted web app under its base path (ADR-016). */
export function invitationWebUrl(webAppUrl: string, token: string): string {
  return `${webAppUrl.replace(/\/+$/, '')}/invitation?token=${encodeURIComponent(token)}`;
}

/**
 * Administrator delivery (ADR-016): nothing is sent; the link goes back in the response to the
 * administrator who issued it (the only one who can already grant access) so they pass it on.
 * It never writes the token to the log (NFR-ACC-08).
 */
export class LinkInvitationSender implements InvitationSender {
  constructor(private readonly webAppUrl: string) {}

  async send(invitation: { token: string }): Promise<InvitationDelivery> {
    return { invitationUrl: invitationWebUrl(this.webAppUrl, invitation.token) };
  }
}

export type InvitationDeliveryMode = 'console' | 'link';

/**
 * `link` works everywhere; `console` prints the token, so in production it is replaced by the
 * sender that refuses (503) rather than leaking tokens to the logs.
 */
export function createInvitationSender(options: {
  delivery: InvitationDeliveryMode;
  webAppUrl?: string;
  production: boolean;
}): InvitationSender {
  if (options.delivery === 'link') {
    if (!options.webAppUrl)
      throw new Error('WEB_APP_URL is required with INVITATION_DELIVERY=link');
    return new LinkInvitationSender(options.webAppUrl);
  }
  return options.production ? new UnavailableInvitationSender() : new ConsoleInvitationSender();
}
