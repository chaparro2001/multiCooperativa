/** Everything the assistant takes from the other modules, always through their public interfaces. */
export type { CooperativeContext } from '../../access';
export type { AnnouncementReads, LatestAnnouncement } from '../../announcements';
export type { AssemblyReads } from '../../assemblies';
export { DOCUMENT_SEARCH_RESULTS, type FragmentHit } from '../../documents';
export type { InvoiceDetail, InvoicingReads } from '../../invoicing';
export type { MemberAreaReads } from '../../members';
