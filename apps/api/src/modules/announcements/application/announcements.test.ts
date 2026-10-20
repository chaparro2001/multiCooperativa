import { beforeEach, describe, expect, it } from 'vitest';

import type { CooperativeContext } from '../../access';
import { InProcessEventBus } from '../../../shared/events';
import { InMemoryFileStorage } from '../../../shared/files/in-memory-file-storage';
import {
  AttachmentRejectedError,
  InvalidAnnouncementError,
  InvalidAnnouncementTransitionError,
} from '../domain/errors';
import {
  addAttachment,
  type AnnouncementDeps,
  createAnnouncement,
  getAnnouncement,
  listAnnouncements,
  PAGE_SIZE,
  publishAnnouncement,
  updateAnnouncement,
  withdrawAnnouncement,
} from './announcements';
import { AnnouncementNotFoundError } from './errors';
import type { AnnouncementEvent } from './events';
import { InMemoryAnnouncementStore } from './testing/in-memory-announcement-store';

const COOP = '40000000-0000-4000-8000-000000000001';
const OTHER_COOP = '40000000-0000-4000-8000-000000000002';
const pdf = (text = 'content') => new TextEncoder().encode(`%PDF-1.4 ${text}`);

function context(
  membershipId: string,
  level: 'read' | 'manage' | null,
  cooperativeId = COOP,
): CooperativeContext {
  return {
    userId: `user-${membershipId}`,
    sessionId: 'session',
    cooperativeId,
    membershipId,
    profileName: 'x',
    isPartner: true,
    permissions: level ? [{ module: 'announcements', level, scope: 'all' }] : [],
  };
}

const manager = context('mem-manager', 'manage');
const reader = context('mem-member', 'read');

let store: InMemoryAnnouncementStore;
let files: InMemoryFileStorage;
let published: AnnouncementEvent[];
let deps: AnnouncementDeps;
let now: Date;

beforeEach(() => {
  store = new InMemoryAnnouncementStore();
  files = new InMemoryFileStorage();
  published = [];
  now = new Date('2026-10-10T10:00:00Z');
  const events = new InProcessEventBus<AnnouncementEvent>({ onHandlerError: () => {} });
  events.subscribe('AnnouncementPublished', (event) => void published.push(event));
  deps = {
    announcements: store,
    files,
    events,
    now: () => now,
    members: {
      countActiveMembers: async () => 10,
      displayNames: async (_coop, ids) => new Map(ids.map((id) => [id, `Name of ${id}`])),
    },
  };
});

const draft = (title = 'Assembly', body = 'The assembly is convened.') =>
  createAnnouncement(deps, manager, { title, body });

async function publishedAnnouncement(title = 'Assembly') {
  const created = await draft(title);
  now = new Date(now.getTime() + 60_000);
  return publishAnnouncement(deps, manager, created.id);
}

describe('publish (US-ANN-01)', () => {
  it('Given a valid title and body, when I save, then it is a draft visible only with manage access', async () => {
    const created = await draft();

    expect(created).toMatchObject({ status: 'draft', authorMembershipId: 'mem-manager' });
    expect((await listAnnouncements(deps, reader, 0)).items).toEqual([]);
    expect((await listAnnouncements(deps, manager, 0)).items).toHaveLength(1);
  });

  it('Given a draft, when I publish it, then everyone sees it and AnnouncementPublished is emitted', async () => {
    const result = await publishedAnnouncement();

    expect(result.status).toBe('published');
    expect((await listAnnouncements(deps, reader, 0)).items.map((i) => i.id)).toEqual([result.id]);
    expect(published).toEqual([
      {
        type: 'AnnouncementPublished',
        occurredAt: now,
        payload: { cooperativeId: COOP, announcementId: result.id, title: 'Assembly' },
      },
    ]);
  });

  it('publishing twice fails and emits no second event (BR-ANN-07)', async () => {
    const result = await publishedAnnouncement();

    await expect(publishAnnouncement(deps, manager, result.id)).rejects.toThrow(
      InvalidAnnouncementTransitionError,
    );
    expect(published).toHaveLength(1);
  });

  it('Given an announcement without body, when I try to publish it, then nothing is published or emitted', async () => {
    const created = await createAnnouncement(deps, manager, { title: 'Title only', body: '' });

    await expect(publishAnnouncement(deps, manager, created.id)).rejects.toThrow(
      InvalidAnnouncementError,
    );
    expect(published).toEqual([]);
  });
});

describe('permissions (US-ACC-07)', () => {
  it('with read access one cannot create, edit, publish, withdraw or attach', async () => {
    const created = await draft();
    const attempts = [
      createAnnouncement(deps, reader, { title: 'x', body: 'y' }),
      updateAnnouncement(deps, reader, created.id, { title: 'z' }),
      publishAnnouncement(deps, reader, created.id),
      withdrawAnnouncement(deps, reader, created.id),
      addAttachment(deps, reader, created.id, { name: 'a.pdf', content: pdf() }),
    ];
    for (const attempt of attempts) {
      await expect(attempt).rejects.toMatchObject({ code: 'forbidden' });
    }
  });

  it('without the module nothing can be read', async () => {
    await expect(listAnnouncements(deps, context('m', null), 0)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});

describe('list (US-ANN-02)', () => {
  it('Given published announcements, then they are ordered newest first with pinned ones first', async () => {
    const first = await publishedAnnouncement('First');
    await publishedAnnouncement('Second');
    await publishedAnnouncement('Third');
    await updateAnnouncement(deps, manager, first.id, { pinned: true });

    const titles = (await listAnnouncements(deps, reader, 0)).items.map((i) => i.title);

    expect(titles).toEqual(['First', 'Third', 'Second']);
  });

  it('Given announcements I have not opened, then they appear as unread', async () => {
    const a = await publishedAnnouncement('A');
    await publishedAnnouncement('B');
    await getAnnouncement(deps, reader, a.id);

    const items = (await listAnnouncements(deps, reader, 0)).items;

    expect(items.map((i) => [i.title, i.read])).toEqual([
      ['B', false],
      ['A', true],
    ]);
  });

  it('Given more than 20 announcements, when I reach the end, then the next ones are loaded', async () => {
    for (let i = 0; i < PAGE_SIZE + 3; i++) await publishedAnnouncement(`C${i}`);

    const first = await listAnnouncements(deps, reader, 0);
    const second = await listAnnouncements(deps, reader, first.nextOffset!);

    expect(first.items).toHaveLength(PAGE_SIZE);
    expect(first.nextOffset).toBe(PAGE_SIZE);
    expect(second.items).toHaveLength(3);
    expect(second.nextOffset).toBeNull();
  });

  it('includes the author name', async () => {
    await publishedAnnouncement();

    expect((await listAnnouncements(deps, reader, 0)).items[0]?.authorName).toBe(
      'Name of mem-manager',
    );
  });
});

describe('read (US-ANN-03)', () => {
  it('Given a published announcement, when I open it, then I see its data and it is marked read once', async () => {
    const result = await publishedAnnouncement();
    const firstOpen = now;

    const detail = await getAnnouncement(deps, reader, result.id);
    now = new Date(now.getTime() + 3600_000);
    await getAnnouncement(deps, reader, result.id);

    expect(detail).toMatchObject({
      title: 'Assembly',
      authorName: 'Name of mem-manager',
      readStats: null,
    });
    expect(store.reads.get(`${result.id}:mem-member`)).toEqual(firstOpen);
    expect(store.reads.size).toBe(1);
  });

  it('Given an attachment, when I open it, then it downloads through a 5-minute signed URL', async () => {
    const result = await publishedAnnouncement();
    await addAttachment(deps, manager, result.id, { name: 'Agenda.pdf', content: pdf() });

    const detail = await getAnnouncement(deps, reader, result.id);

    expect(detail.attachments).toEqual([
      expect.objectContaining({
        name: 'Agenda.pdf',
        url: expect.stringContaining('expires=300'),
      }),
    ]);
    expect(detail.attachments[0]).not.toHaveProperty('fileKey');
  });

  it('Given a withdrawn or draft announcement, when I open it without manage access, then it does not exist', async () => {
    const created = await draft();
    const withdrawn = await publishedAnnouncement();
    await withdrawAnnouncement(deps, manager, withdrawn.id);

    for (const id of [created.id, withdrawn.id]) {
      await expect(getAnnouncement(deps, reader, id)).rejects.toThrow(AnnouncementNotFoundError);
    }
  });

  it('an announcement of another cooperative does not exist (ADR-003)', async () => {
    const result = await publishedAnnouncement();

    await expect(
      getAnnouncement(deps, context('mem-x', 'manage', OTHER_COOP), result.id),
    ).rejects.toThrow(AnnouncementNotFoundError);
  });

  it('opening a draft with manage access does not count as a read', async () => {
    const created = await draft();

    await getAnnouncement(deps, manager, created.id);

    expect(store.reads.size).toBe(0);
  });
});

describe('edit and withdraw (US-ANN-05)', () => {
  it('Given a published announcement, when I edit it, then it is marked as edited and the notice is not sent again', async () => {
    const result = await publishedAnnouncement();
    now = new Date('2026-10-12T09:00:00Z');

    const edited = await updateAnnouncement(deps, manager, result.id, { body: 'Fixed' });

    expect(edited).toMatchObject({ body: 'Fixed', editedAt: now });
    expect(published).toHaveLength(1);
  });

  it('Given a published announcement, when I withdraw it, then it is no longer visible with read access', async () => {
    const result = await publishedAnnouncement();

    await withdrawAnnouncement(deps, manager, result.id);

    expect((await listAnnouncements(deps, reader, 0)).items).toEqual([]);
    expect((await listAnnouncements(deps, manager, 0)).items[0]?.status).toBe('withdrawn');
  });
});

describe('read counts (US-ANN-07)', () => {
  it('with manage access the reads over active members are visible', async () => {
    const result = await publishedAnnouncement();
    await getAnnouncement(deps, reader, result.id);
    await getAnnouncement(deps, context('mem-other', 'read'), result.id);

    const detail = await getAnnouncement(deps, manager, result.id);

    // The manager's own read when opening it also counts.
    expect(detail.readStats).toEqual({ readCount: 3, activeMembers: 10 });
  });
});

describe('attachments (BR-ANN-05)', () => {
  it('stores the PDF in storage under a cooperative key', async () => {
    const created = await draft();

    const attachment = await addAttachment(deps, manager, created.id, {
      name: 'a.pdf',
      content: pdf(),
    });

    expect(attachment).toMatchObject({ name: 'a.pdf', size: pdf().byteLength });
    expect([...files.files.keys()]).toEqual([
      expect.stringMatching(new RegExp(`^cooperatives/${COOP}/announcements/`)),
    ]);
  });

  it('rejects by content a file that is not a PDF, without uploading it', async () => {
    const created = await draft();

    await expect(
      addAttachment(deps, manager, created.id, {
        name: 'fake.pdf',
        content: new TextEncoder().encode('<html>'),
      }),
    ).rejects.toThrow(AttachmentRejectedError);
    expect(files.files.size).toBe(0);
  });

  it('a fourth attachment is rejected', async () => {
    const created = await draft();
    for (let i = 0; i < 3; i++) {
      await addAttachment(deps, manager, created.id, { name: `${i}.pdf`, content: pdf() });
    }

    await expect(
      addAttachment(deps, manager, created.id, { name: '4.pdf', content: pdf() }),
    ).rejects.toMatchObject({ reason: 'too_many' });
    expect(files.files.size).toBe(3);
  });

  it('if rejected under lock, deletes the already uploaded file', async () => {
    const created = await draft();
    const original = store.addAttachment.bind(store);
    store.addAttachment = async (coop, id, check, attachment) => {
      // A parallel upload took the slots while this one was uploading the file.
      return original(coop, id, (current) => check(current, 3), attachment);
    };

    await expect(
      addAttachment(deps, manager, created.id, { name: 'a.pdf', content: pdf() }),
    ).rejects.toThrow(AttachmentRejectedError);
    expect(files.files.size).toBe(0);
  });
});
