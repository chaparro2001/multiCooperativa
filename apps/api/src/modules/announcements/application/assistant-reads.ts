import type { CooperativeContext } from '../../access';
import { type AnnouncementDeps, listAnnouncements } from './announcements';

export interface LatestAnnouncement {
  id: string;
  title: string;
  /** Cut so a long announcement does not flood the model's context. */
  body: string;
  pinned: boolean;
  publishedAt: string | null;
  authorName: string | null;
}

/** What the AI assistant reads (requirements/07, section 3). Same use case, same permissions. */
export interface AnnouncementReads {
  latest(context: CooperativeContext, count: number): Promise<LatestAnnouncement[]>;
}

const BODY_EXCERPT = 600;

export function createAnnouncementReads(deps: AnnouncementDeps): AnnouncementReads {
  return {
    async latest(context, count) {
      const page = await listAnnouncements(deps, context, 0);
      // Managers also list drafts and withdrawn ones; the assistant only reports what is published.
      const published = page.items.filter((item) => item.status === 'published');
      return published.slice(0, count).map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body.slice(0, BODY_EXCERPT),
        pinned: item.pinned,
        publishedAt: item.publishedAt?.toISOString() ?? null,
        authorName: item.authorName,
      }));
    },
  };
}
