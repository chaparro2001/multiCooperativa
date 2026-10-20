/** What assemblies need from the access module, through its public interface. */
export interface MemberDirectory {
  /** Active members with partner status (BR-ASM-02). */
  listVoters(cooperativeId: string): Promise<string[]>;
}
