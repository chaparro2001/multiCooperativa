import type { DomainEvent } from '../../../shared/events';

/** RN-COM-07: emitted once, when a draft becomes published. Consumed by notifications. */
export type AnnouncementPublished = DomainEvent<
  'ComunicadoPublicado',
  { cooperativeId: string; announcementId: string; title: string }
>;

export type AnnouncementEvent = AnnouncementPublished;
