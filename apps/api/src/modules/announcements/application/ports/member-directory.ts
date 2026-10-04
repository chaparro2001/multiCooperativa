/** What announcements need from the access module, through its public interface. */
export interface MemberDirectory {
  countActiveMembers(cooperativeId: string): Promise<number>;
  displayNames(cooperativeId: string, membershipIds: string[]): Promise<Map<string, string>>;
}
