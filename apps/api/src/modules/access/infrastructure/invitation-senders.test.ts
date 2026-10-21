import { describe, expect, it, vi } from 'vitest';

import { InvitationDeliveryUnavailableError } from '../application/errors';
import {
  ConsoleInvitationSender,
  createInvitationSender,
  invitationWebUrl,
  LinkInvitationSender,
  UnavailableInvitationSender,
} from './invitation-senders';

const invitation = {
  email: 'grace@campo.es',
  cooperativeId: 'coop',
  token: 'a+b/c=',
  expiresAt: new Date('2026-10-17T10:00:00Z'),
};

describe('invitation delivery (US-ACC-08, ADR-016)', () => {
  it('builds the web link under the base path, tolerating a trailing slash, and encodes the token', () => {
    expect(invitationWebUrl('https://x.github.io/multiCooperativa', 'tok')).toBe(
      'https://x.github.io/multiCooperativa/invitation?token=tok',
    );
    expect(invitationWebUrl('https://x.github.io/multiCooperativa/', 'a+b/c=')).toBe(
      'https://x.github.io/multiCooperativa/invitation?token=a%2Bb%2Fc%3D',
    );
  });

  it('the link sender returns the link and never logs the token (NFR-ACC-08)', async () => {
    const spies = (['log', 'info', 'warn', 'error'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    );

    const delivery = await new LinkInvitationSender('https://w.example/app').send(invitation);

    expect(delivery).toEqual({
      invitationUrl: 'https://w.example/app/invitation?token=a%2Bb%2Fc%3D',
    });
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('createInvitationSender: link works in production; console is refused there instead of logging tokens', async () => {
    const webAppUrl = 'https://w.example/app';
    expect(
      createInvitationSender({ delivery: 'link', webAppUrl, production: true }),
    ).toBeInstanceOf(LinkInvitationSender);
    expect(createInvitationSender({ delivery: 'console', production: false })).toBeInstanceOf(
      ConsoleInvitationSender,
    );
    const production = createInvitationSender({ delivery: 'console', production: true });
    expect(production).toBeInstanceOf(UnavailableInvitationSender);
    await expect(production.send(invitation)).rejects.toThrow(InvitationDeliveryUnavailableError);
    expect(() => createInvitationSender({ delivery: 'link', production: false })).toThrow(
      /WEB_APP_URL/,
    );
  });
});
