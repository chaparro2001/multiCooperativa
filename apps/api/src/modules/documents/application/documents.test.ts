import { beforeEach, describe, expect, it } from 'vitest';

import type { CooperativeContext } from '../../access';
import { InProcessEventBus } from '../../../shared/events';
import { InMemoryFileStorage } from '../../../shared/files/in-memory-file-storage';
import { DocumentFileRejectedError, InvalidDocumentTransitionError } from '../domain/errors';
import {
  addVersion,
  type DocumentDeps,
  getDocument,
  listDocuments,
  listVersions,
  uploadDocument,
  withdrawDocument,
} from './documents';
import { DocumentNotFoundError } from './errors';
import type { DocumentEvent } from './events';
import { InMemoryDocumentStore } from './testing/in-memory-document-store';

const COOP = '40000000-0000-4000-8000-000000000001';
const OTHER_COOP = '40000000-0000-4000-8000-000000000002';
const pdf = (text = 'v1') => ({
  name: 'Bylaws.pdf',
  content: new TextEncoder().encode(`%PDF-1.4 ${text}`),
});

function context(level: 'read' | 'manage' | null, cooperativeId = COOP): CooperativeContext {
  return {
    userId: 'user',
    sessionId: 'session',
    cooperativeId,
    membershipId: level === 'manage' ? 'mem-manager' : 'mem-member',
    profileName: 'x',
    isPartner: true,
    permissions: level ? [{ module: 'documents', level, scope: 'all' }] : [],
  };
}

const manager = context('manage');
const reader = context('read');

let store: InMemoryDocumentStore;
let files: InMemoryFileStorage;
let events: DocumentEvent[];
let deps: DocumentDeps;

beforeEach(() => {
  store = new InMemoryDocumentStore();
  files = new InMemoryFileStorage();
  events = [];
  const bus = new InProcessEventBus<DocumentEvent>({ onHandlerError: () => {} });
  bus.subscribe('DocumentPublished', (event) => void events.push(event));
  bus.subscribe('DocumentWithdrawn', (event) => void events.push(event));
  deps = {
    documents: store,
    files,
    events: bus,
    now: () => new Date('2026-10-10T10:00:00Z'),
    members: { displayNames: async (_c, ids) => new Map(ids.map((id) => [id, `Name ${id}`])) },
  };
});

const upload = (
  title = 'Corporate bylaws',
  category: 'bylaws' | 'minutes' = 'bylaws',
  documentDate = '2026-03-15',
) => uploadDocument(deps, manager, { title, category, documentDate }, pdf());

describe('upload (US-DOC-01)', () => {
  it('Given a valid PDF, when I upload it, then it is published and DocumentPublished is emitted', async () => {
    const document = await upload();

    expect(document).toMatchObject({ status: 'published', title: 'Corporate bylaws' });
    expect(document.current).toMatchObject({
      isCurrent: true,
      indexingStatus: 'pending',
      fileName: 'Bylaws.pdf',
    });
    expect(events).toEqual([
      expect.objectContaining({
        type: 'DocumentPublished',
        payload: { cooperativeId: COOP, documentId: document.id, versionId: document.current.id },
      }),
    ]);
    expect([...files.files.keys()]).toEqual([
      expect.stringMatching(`^cooperatives/${COOP}/documents/`),
    ]);
  });

  it('Given a file that is not a PDF, then it is rejected without storing anything', async () => {
    await expect(
      uploadDocument(
        deps,
        manager,
        { title: 'x', category: 'other', documentDate: '2026-01-01' },
        { name: 'x.pdf', content: new TextEncoder().encode('PK zip') },
      ),
    ).rejects.toMatchObject({ reason: 'not_pdf' });
    expect(files.files.size).toBe(0);
    expect(store.rows).toHaveLength(0);
    expect(events).toEqual([]);
  });

  it('if saving fails, the uploaded file is deleted', async () => {
    store.create = async () => {
      throw new Error('database down');
    };

    await expect(upload()).rejects.toThrow('database down');
    expect(files.files.size).toBe(0);
  });

  it('with read access nothing can be uploaded (US-ACC-07)', async () => {
    await expect(
      uploadDocument(
        deps,
        reader,
        { title: 'x', category: 'other', documentDate: '2026-01-01' },
        pdf(),
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('list (US-DOC-02)', () => {
  it('sorts by date descending and filters by category and by title', async () => {
    await upload('Corporate bylaws', 'bylaws', '2024-01-10');
    await upload('March minutes', 'minutes', '2026-03-31');
    await upload('June minutes', 'minutes', '2026-06-30');

    const all = await listDocuments(deps, reader, {});
    const minutes = await listDocuments(deps, reader, { category: 'minutes' });
    const found = await listDocuments(deps, reader, { search: '  MARCH ' });

    expect(all.map((d) => d.title)).toEqual(['June minutes', 'March minutes', 'Corporate bylaws']);
    expect(minutes.map((d) => d.title)).toEqual(['June minutes', 'March minutes']);
    expect(found.map((d) => d.title)).toEqual(['March minutes']);
  });
});

describe('open (US-DOC-03)', () => {
  it('Given a published document, when I open it, then I get the current version with a signed URL', async () => {
    const document = await upload();

    const detail = await getDocument(deps, reader, document.id);

    expect(detail.url).toContain(document.current.fileKey);
    expect(detail.url).toContain('expires=300');
  });

  it('Given a withdrawn document, when I open it without manage access, then it does not exist', async () => {
    const document = await upload();
    await withdrawDocument(deps, manager, document.id);

    await expect(getDocument(deps, reader, document.id)).rejects.toThrow(DocumentNotFoundError);
    await expect(getDocument(deps, manager, document.id)).resolves.toMatchObject({
      status: 'withdrawn',
    });
  });

  it('a document of another cooperative does not exist (ADR-003)', async () => {
    const document = await upload();

    await expect(getDocument(deps, context('manage', OTHER_COOP), document.id)).rejects.toThrow(
      DocumentNotFoundError,
    );
  });
});

describe('versions (US-DOC-04)', () => {
  it('Given a published document, when I upload a new version, then it becomes current, the previous one stays in the history and the new one is indexed', async () => {
    const document = await upload();
    const original = document.current;

    const updated = await addVersion(deps, manager, document.id, pdf('v2'));
    const history = await listVersions(deps, manager, document.id);

    expect(updated.current.id).not.toBe(original.id);
    expect(history.map((v) => [v.id, v.isCurrent])).toEqual([
      [updated.current.id, true],
      [original.id, false],
    ]);
    expect(history[0]?.uploadedByName).toBe('Name mem-manager');
    expect(events.at(-1)?.payload).toMatchObject({ versionId: updated.current.id });
  });

  it('the history can only be read with manage access', async () => {
    const document = await upload();

    await expect(listVersions(deps, reader, document.id)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('a withdrawn document accepts no versions and the file is not uploaded', async () => {
    const document = await upload();
    await withdrawDocument(deps, manager, document.id);
    const stored = files.files.size;

    await expect(addVersion(deps, manager, document.id, pdf('v2'))).rejects.toThrow(
      InvalidDocumentTransitionError,
    );
    expect(files.files.size).toBe(stored);
  });

  it('a version that is not a PDF is rejected', async () => {
    const document = await upload();

    await expect(
      addVersion(deps, manager, document.id, { name: 'x', content: new Uint8Array() }),
    ).rejects.toThrow(DocumentFileRejectedError);
  });
});

describe('withdraw (US-DOC-05)', () => {
  it('Given a published document, when I withdraw it, then it is no longer visible with read access and DocumentWithdrawn is emitted', async () => {
    const document = await upload();

    await withdrawDocument(deps, manager, document.id);

    expect(await listDocuments(deps, reader, {})).toEqual([]);
    expect(events.at(-1)).toMatchObject({
      type: 'DocumentWithdrawn',
      payload: { cooperativeId: COOP, documentId: document.id },
    });
  });

  it('withdrawing twice fails and emits no other event', async () => {
    const document = await upload();
    await withdrawDocument(deps, manager, document.id);

    await expect(withdrawDocument(deps, manager, document.id)).rejects.toThrow(
      InvalidDocumentTransitionError,
    );
    expect(events.filter((e) => e.type === 'DocumentWithdrawn')).toHaveLength(1);
  });
});
