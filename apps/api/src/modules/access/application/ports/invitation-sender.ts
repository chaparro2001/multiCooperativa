/** Delivers the single-use invitation link to the invitee. */
export interface InvitationSender {
  send(invitation: {
    email: string;
    cooperativeId: string;
    token: string;
    expiresAt: Date;
  }): Promise<void>;
}
