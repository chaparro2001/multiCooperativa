import type { DomainEvent } from '../../../shared/events';

/** BR-ANN-07: emitted once, when a draft becomes published. Consumed by notifications. */
export type AnnouncementPublished = DomainEvent<
  'AnnouncementPublished',
  { cooperativeId: string; announcementId: string; title: string }
>;

export type AnnouncementEvent = AnnouncementPublished;
