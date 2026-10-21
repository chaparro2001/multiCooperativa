/** Every method is scoped to one cooperative (ADR-003). */
export interface UnreadStore {
  /** Published announcements of the cooperative that the membership has not read (BR-ANN-06). */
  countUnread(cooperativeId: string, membershipId: string): Promise<number>;
}
