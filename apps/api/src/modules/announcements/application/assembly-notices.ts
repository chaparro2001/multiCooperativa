import { formatDateTime, translate } from '../../../shared/i18n';
import type { EventPublisher } from '../../../shared/events';
import { createDraft, publish } from '../domain/announcement';
import type { AnnouncementEvent } from './events';
import type { AnnouncementStore } from './ports/announcement-store';

/** The part of `AssemblyRescheduled` this module reads (no import of the other module's internals). */
export interface AssemblyRescheduledNotice {
  cooperativeId: string;
  assemblyType: 'ordinary' | 'extraordinary';
  previous: { firstCallAt: string; place: string };
  firstCallAt: string;
  secondCallAt: string | null;
  place: string;
  reason: string | null;
  notifyMembers: boolean;
  /** Who moved the assembly: the author of the announcement. */
  rescheduledByMembershipId: string;
}

export interface AssemblyNoticeDeps {
  announcements: AnnouncementStore;
  events: EventPublisher<AnnouncementEvent>;
}

/**
 * US-ASM-09: an assembly was rescheduled. Publishes an announcement right away,
 * in the cooperative of the event and visible like any other (text from the
 * server catalog). Does nothing when the manager chose not to notify.
 */
export async function announceAssemblyRescheduled(
  deps: AssemblyNoticeDeps,
  notice: AssemblyRescheduledNotice,
  occurredAt: Date,
): Promise<void> {
  if (!notice.notifyMembers) return;
  const assembly = translate(
    undefined,
    notice.assemblyType === 'ordinary' ? 'assembly.type.ordinary' : 'assembly.type.extraordinary',
  );
  const lines = [
    translate(undefined, 'assembly.rescheduled.intro', { assembly }),
    translate(undefined, 'assembly.rescheduled.before', {
      date: formatDateTime(undefined, new Date(notice.previous.firstCallAt)),
      place: notice.previous.place,
    }),
    translate(undefined, 'assembly.rescheduled.now', {
      date: formatDateTime(undefined, new Date(notice.firstCallAt)),
      place: notice.place,
    }),
    ...(notice.secondCallAt
      ? [
          translate(undefined, 'assembly.rescheduled.secondCall', {
            date: formatDateTime(undefined, new Date(notice.secondCallAt)),
          }),
        ]
      : []),
    ...(notice.reason
      ? [translate(undefined, 'assembly.rescheduled.reason', { reason: notice.reason })]
      : []),
  ];
  const state = publish(
    createDraft({
      title: translate(undefined, 'assembly.rescheduled.title', { assembly }),
      body: lines.join('\n'),
    }),
    occurredAt,
  );
  const created = await deps.announcements.create(notice.cooperativeId, {
    authorMembershipId: notice.rescheduledByMembershipId,
    state,
  });
  await deps.events.publish({
    type: 'AnnouncementPublished',
    occurredAt,
    payload: {
      cooperativeId: notice.cooperativeId,
      announcementId: created.id,
      title: created.title,
    },
  });
}
