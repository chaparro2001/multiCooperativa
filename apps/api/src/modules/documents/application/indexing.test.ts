import { beforeEach, describe, expect, it } from 'vitest';

import type { CooperativeContext } from '../../access';
import { InProcessEventBus } from '../../../shared/events';
import { InMemoryFileStorage } from '../../../shared/files/in-memory-file-storage';
import { InvalidDocumentTransitionError } from '../domain/errors';
import type { PageText } from '../domain/chunking';
import {
  addVersion,
  type DocumentDeps,
  reindexDocument,
  searchDocuments,
  uploadDocument,
  withdrawDocument,
} from './documents';
import type { DocumentEvent } from './events';
import { createIndexer, type Indexer } from './indexing';
import { UnreadablePdfError } from './ports/text-extractor';
import { HashingEmbedder } from './testing/hashing-embedder';
import { InMemoryDocumentStore } from './testing/in-memory-document-store';
import { InMemoryIndexing } from './testing/in-memory-indexing';

const COOP = '40000000-0000-4000-8000-000000000001';
const OTHER = '40000000-0000-4000-8000-000000000002';

function context(level: 'read' | 'manage', cooperativeId = COOP): CooperativeContext {
  return {
    userId: 'u',
    sessionId: 's',
    cooperativeId,
    membershipId: 'm',
    profileName: 'x',
    isPartner: true,
    permissions: [{ module: 'documents', level, scope: 'all' }],
  };
}

/** The "PDF" content is the page texts separated by \f; the fake extractor splits them back. */
const pdfWith = (...pages: string[]) => ({
  name: 'doc.pdf',
  content: new TextEncoder().encode(`%PDF-1.4\n${pages.join('\f')}`),
});
const fakeExtractor = {
  async extract(pdf: Uint8Array): Promise<PageText[]> {
    const text = new TextDecoder().decode(pdf).replace('%PDF-1.4\n', '');
    if (text.startsWith('ROTO')) throw new UnreadablePdfError(null);
    return text.split('\f').map((pageText, i) => ({ page: i + 1, text: pageText }));
  },
};

let store: InMemoryDocumentStore;
let indexing: InMemoryIndexing;
let embedder: HashingEmbedder;
let indexer: Indexer;
let deps: DocumentDeps;
let errors: unknown[];

beforeEach(() => {
  store = new InMemoryDocumentStore();
  indexing = new InMemoryIndexing(store);
  embedder = new HashingEmbedder();
  errors = [];
  const files = new InMemoryFileStorage();
  indexer = createIndexer({
    store: indexing,
    index: indexing,
    files,
    extractor: fakeExtractor,
    embedder,
    onError: (error) => void errors.push(error),
  });
  const bus = new InProcessEventBus<DocumentEvent>({ onHandlerError: (e) => void errors.push(e) });
  bus.subscribe('DocumentPublished', (event) => indexer.enqueue(event.payload));
  bus.subscribe('DocumentWithdrawn', (event) =>
    indexer.remove(event.payload.cooperativeId, event.payload.documentId),
  );
  deps = {
    documents: store,
    files,
    events: bus,
    now: () => new Date(),
    members: { displayNames: async () => new Map() },
  };
});

const upload = (
  file = pdfWith('The ordinary general assembly is held every year in June.'),
  ctx = context('manage'),
) =>
  uploadDocument(
    deps,
    ctx,
    { title: 'Bylaws', category: 'bylaws', documentDate: '2026-01-01' },
    file,
  );

const search = (query: string, ctx = context('read')) =>
  searchDocuments({ embedder, index: indexing }, ctx, query);

describe('indexing (requirements/03, section 4)', () => {
  it('Given a freshly uploaded document, when indexing finishes, then it is indexed with its fragments per page', async () => {
    const document = await upload(
      pdfWith('First page about the assembly.', 'Second page about the share capital.'),
    );
    expect(document.current.indexingStatus).toBe('pending');

    await indexer.idle();

    expect(store.rows[0]?.versions[0]?.indexingStatus).toBe('indexed');
    expect(indexing.fragments.map((f) => [f.cooperativeId, f.documentId, f.page])).toEqual([
      [COOP, document.id, 1],
      [COOP, document.id, 2],
    ]);
  });

  it('the upload does not wait for indexing', async () => {
    const document = await upload();

    expect(document.current.indexingStatus).toBe('pending');
    expect(indexing.fragments).toHaveLength(0);
  });

  it('Given a PDF without extractable text, then it is marked as not indexable with the reason', async () => {
    await upload(pdfWith('   ', ''));
    await indexer.idle();

    const version = store.rows[0]!.versions[0]!;
    expect(version.indexingStatus).toBe('not_indexable');
    expect(version.indexingError).toMatch(/scanned/);
  });

  it('an unreadable PDF is also not indexable', async () => {
    await upload(pdfWith('ROTO'));
    await indexer.idle();

    expect(store.rows[0]!.versions[0]!.indexingStatus).toBe('not_indexable');
  });

  it('if the embeddings service fails, it is left with an error and the document stays available (BR-DOC-07)', async () => {
    embedder.embed = async () => {
      throw new Error('Ollama down');
    };

    const document = await upload();
    await indexer.idle();

    expect(store.rows[0]!.versions[0]).toMatchObject({ indexingStatus: 'error' });
    expect(store.rows[0]!.status).toBe('published');
    expect(errors).toHaveLength(1);
    expect(document.id).toBeDefined();
  });

  it('US-DOC-06: Given an indexing error, when I press retry, then it is launched again', async () => {
    const original = embedder.embed.bind(embedder);
    embedder.embed = async () => {
      throw new Error('Ollama down');
    };
    const document = await upload();
    await indexer.idle();
    embedder.embed = original;

    await reindexDocument(
      { ...deps, indexingStore: indexing, indexer },
      context('manage'),
      document.id,
    );
    expect(store.rows[0]!.versions[0]!.indexingStatus).toBe('pending');
    await indexer.idle();

    expect(store.rows[0]!.versions[0]!.indexingStatus).toBe('indexed');
  });

  it('reindexing requires manage access and a published document', async () => {
    const document = await upload();
    await withdrawDocument(deps, context('manage'), document.id);

    await expect(
      reindexDocument({ ...deps, indexingStore: indexing, indexer }, context('read'), document.id),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      reindexDocument(
        { ...deps, indexingStore: indexing, indexer },
        context('manage'),
        document.id,
      ),
    ).rejects.toThrow(InvalidDocumentTransitionError);
  });

  it('BR-DOC-05: a new version replaces the fragments of the previous one', async () => {
    const document = await upload(pdfWith('Old text about tractors.'));
    await indexer.idle();

    await addVersion(deps, context('manage'), document.id, pdfWith('New text about harvesters.'));
    await indexer.idle();

    expect(indexing.fragments.map((f) => f.content)).toEqual(['New text about harvesters.']);
  });

  it('BR-DOC-05: withdrawing a document deletes its fragments', async () => {
    const document = await upload();
    await indexer.idle();

    await withdrawDocument(deps, context('manage'), document.id);

    expect(indexing.fragments).toEqual([]);
  });

  it('a job for a version that is no longer current is discarded', async () => {
    const document = await upload(pdfWith('version one'));
    await addVersion(deps, context('manage'), document.id, pdfWith('version two'));
    await indexer.idle();

    expect(indexing.fragments.map((f) => f.content)).toEqual(['version two']);
  });

  it('on startup, it recovers the versions left pending', async () => {
    const document = await upload();
    // Simulates a restart: the queued job was lost and the version is still pending.
    indexing.fragments.length = 0;
    store.rows[0]!.versions[0]!.indexingStatus = 'pending';

    expect(await indexer.resumePending()).toBe(1);
    await indexer.idle();

    expect(indexing.fragments[0]?.documentId).toBe(document.id);
  });
});

describe('content search (US-DOC-07)', () => {
  it('returns the most relevant fragments with their page', async () => {
    const document = await upload(
      pdfWith(
        'The minimum share capital is three thousand euros.',
        'The ordinary general assembly is held in June.',
      ),
    );
    await indexer.idle();

    const [best] = await search('When is the general assembly held?');

    expect(best).toMatchObject({ documentId: document.id, page: 2, title: 'Bylaws' });
  });

  it('never returns fragments of another cooperative, even if the text matches exactly (ADR-003)', async () => {
    const text = 'The ordinary general assembly is held in June.';
    await upload(pdfWith(text), context('manage', OTHER));
    await indexer.idle();

    expect(await search(text)).toEqual([]);
  });

  it('does not return withdrawn documents', async () => {
    const document = await upload();
    await indexer.idle();
    await withdrawDocument(deps, context('manage'), document.id);

    expect(await search('assembly june')).toEqual([]);
  });
});
