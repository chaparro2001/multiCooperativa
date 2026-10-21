/** What a delivery channel hands back to the inviting administrator, if anything. */
export interface InvitationDelivery {
  /** Link to pass on by hand: set only by the administrator-delivery channel (ADR-016). */
  invitationUrl?: string;
}

/** Delivers the single-use invitation link to the invitee. */
export interface InvitationSender {
  send(invitation: {
    email: string;
    cooperativeId: string;
    token: string;
    expiresAt: Date;
  }): Promise<InvitationDelivery | void>;
}
