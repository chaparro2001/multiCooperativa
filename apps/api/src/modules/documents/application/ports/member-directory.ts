/** What documents need from the access module, through its public interface. */
export interface MemberDirectory {
  displayNames(cooperativeId: string, membershipIds: string[]): Promise<Map<string, string>>;
}
