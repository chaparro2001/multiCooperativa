import type { AssemblySummary } from '@multicooperativa/contracts';

export const MAX_ATTENTION_ITEMS = 3;

export type AttentionKind = 'votes' | 'invoices' | 'assembly' | 'announcements';

export interface AttentionItemData {
  kind: AttentionKind;
  /** Plural count for the title; absent for the next assembly. */
  count?: number;
  /** Where tapping goes. */
  route: string;
  /** ISO instant of the next assembly (for the meta line). */
  at?: string;
}

export interface AttentionInput {
  /** Undefined while loading or when the profile cannot read the module. */
  assemblies?: readonly Pick<AssemblySummary, 'id' | 'status' | 'firstCallAt' | 'openVotings'>[];
  unreadAnnouncements?: number;
  /** Invoices overdue or about to be (invoicing attention). */
  invoicesNeedingAttention?: number;
  now: Date;
}

/**
 * "Pendiente para ti": what the member should look at, most urgent first (open votes, invoices,
 * next assembly, unread announcements), at most three, empty when there is nothing.
 */
export function attentionItems(input: AttentionInput): AttentionItemData[] {
  const items: AttentionItemData[] = [];
  const convened = (input.assemblies ?? []).filter((a) => a.status === 'convened');

  const voting = convened.filter((a) => a.openVotings > 0);
  const openVotes = voting.reduce((sum, a) => sum + a.openVotings, 0);
  if (openVotes > 0) {
    items.push({
      kind: 'votes',
      count: openVotes,
      route: voting.length === 1 ? `/assemblies/${voting[0]!.id}` : '/assemblies',
    });
  }

  const invoices = input.invoicesNeedingAttention ?? 0;
  if (invoices > 0) {
    items.push({ kind: 'invoices', count: invoices, route: '/invoices?kind=invoice' });
  }

  const upcoming = convened
    .filter((a) => new Date(a.firstCallAt).getTime() >= input.now.getTime())
    .sort((a, b) => a.firstCallAt.localeCompare(b.firstCallAt))[0];
  if (upcoming) {
    items.push({
      kind: 'assembly',
      route: `/assemblies/${upcoming.id}`,
      at: upcoming.firstCallAt,
    });
  }

  const unread = input.unreadAnnouncements ?? 0;
  if (unread > 0) {
    items.push({ kind: 'announcements', count: unread, route: '/announcements' });
  }

  return items.slice(0, MAX_ATTENTION_ITEMS);
}
