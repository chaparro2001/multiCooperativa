import { beforeEach, describe, expect, it } from 'vitest';

import { InProcessEventBus } from '../../../shared/events';
import {
  type AssemblyNoticeDeps,
  type AssemblyRescheduledNotice,
  announceAssemblyRescheduled,
} from './assembly-notices';
import type { AnnouncementEvent } from './events';
import { InMemoryAnnouncementStore } from './testing/in-memory-announcement-store';

const COOP = '40000000-0000-4000-8000-000000000001';
const OTHER_COOP = '40000000-0000-4000-8000-000000000002';
const at = new Date('2026-10-10T10:00:00Z');

const notice = (overrides: Partial<AssemblyRescheduledNotice> = {}): AssemblyRescheduledNotice => ({
  cooperativeId: COOP,
  assemblyType: 'ordinary',
  previous: { firstCallAt: '2026-11-20T17:00:00Z', place: 'Salón social' },
  firstCallAt: '2026-12-01T17:00:00Z',
  secondCallAt: '2026-12-01T17:30:00Z',
  place: 'Casa de cultura',
  reason: 'La sala no está disponible',
  notifyMembers: true,
  rescheduledByMembershipId: 'mem-manager',
  ...overrides,
});

let store: InMemoryAnnouncementStore;
let published: AnnouncementEvent[];
let deps: AssemblyNoticeDeps;

beforeEach(() => {
  store = new InMemoryAnnouncementStore();
  published = [];
  const events = new InProcessEventBus<AnnouncementEvent>({ onHandlerError: () => {} });
  events.subscribe('AnnouncementPublished', (event) => void published.push(event));
  deps = { announcements: store, events };
});

describe('announcement of a rescheduled assembly (US-ASM-09)', () => {
  it('publishes at once, authored by who moved it, with the old and new date, place and reason', async () => {
    await announceAssemblyRescheduled(deps, notice(), at);

    expect(store.rows).toHaveLength(1);
    const row = store.rows[0]!;
    expect(row).toMatchObject({
      cooperativeId: COOP,
      authorMembershipId: 'mem-manager',
      status: 'published',
      publishedAt: at,
      title: 'Cambio de fecha: Asamblea ordinaria',
    });
    expect(row.body).toContain('Antes: viernes, 20 de noviembre de 2026, 18:00, en Salón social.');
    expect(row.body).toContain('Ahora: martes, 1 de diciembre de 2026, 18:00, en Casa de cultura.');
    expect(row.body).toContain('Segunda convocatoria: martes, 1 de diciembre de 2026, 18:30.');
    expect(row.body).toContain('Motivo: La sala no está disponible');
    expect(published).toHaveLength(1);
    expect(published[0]!.payload).toMatchObject({ cooperativeId: COOP, title: row.title });
  });

  it('leaves out the second call and the reason when there are none', async () => {
    await announceAssemblyRescheduled(deps, notice({ secondCallAt: null, reason: null }), at);

    expect(store.rows[0]!.body).not.toContain('Segunda convocatoria');
    expect(store.rows[0]!.body).not.toContain('Motivo');
  });

  it('does nothing when the manager chose not to notify', async () => {
    await announceAssemblyRescheduled(deps, notice({ notifyMembers: false }), at);

    expect(store.rows).toEqual([]);
    expect(published).toEqual([]);
  });

  it('is created only in the cooperative of the event (isolation)', async () => {
    await announceAssemblyRescheduled(deps, notice({ cooperativeId: OTHER_COOP }), at);

    expect(store.rows.map((row) => row.cooperativeId)).toEqual([OTHER_COOP]);
    const visible = await store.list(COOP, {
      onlyPublished: true,
      readerMembershipId: 'm',
      offset: 0,
      limit: 5,
    });
    expect(visible).toEqual([]);
  });
});
