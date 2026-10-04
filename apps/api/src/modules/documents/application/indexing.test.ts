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

function context(level: 'consulta' | 'gestion', cooperativeId = COOP): CooperativeContext {
  return {
    userId: 'u',
    sessionId: 's',
    cooperativeId,
    membershipId: 'm',
    profileName: 'x',
    isPartner: true,
    permissions: [{ module: 'documentos', level, scope: 'todas' }],
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
  bus.subscribe('DocumentoPublicado', (event) => indexer.enqueue(event.payload));
  bus.subscribe('DocumentoRetirado', (event) =>
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
  file = pdfWith('La asamblea general ordinaria se celebra cada año en junio.'),
  ctx = context('gestion'),
) =>
  uploadDocument(
    deps,
    ctx,
    { title: 'Estatutos', category: 'estatutos', documentDate: '2026-01-01' },
    file,
  );

const search = (query: string, ctx = context('consulta')) =>
  searchDocuments({ embedder, index: indexing }, ctx, query);

describe('indexación (requisitos/03, apartado 4)', () => {
  it('Dado un documento recién subido, cuando termina la indexación, entonces queda indexado con sus fragmentos por página', async () => {
    const document = await upload(
      pdfWith('Primera página sobre la asamblea.', 'Segunda página sobre el capital social.'),
    );
    expect(document.current.indexingStatus).toBe('pendiente');

    await indexer.idle();

    expect(store.rows[0]?.versions[0]?.indexingStatus).toBe('indexado');
    expect(indexing.fragments.map((f) => [f.cooperativeId, f.documentId, f.page])).toEqual([
      [COOP, document.id, 1],
      [COOP, document.id, 2],
    ]);
  });

  it('la subida no espera a la indexación', async () => {
    const document = await upload();

    expect(document.current.indexingStatus).toBe('pendiente');
    expect(indexing.fragments).toHaveLength(0);
  });

  it('Dado un PDF sin texto extraíble, entonces queda como no indexable con el motivo', async () => {
    await upload(pdfWith('   ', ''));
    await indexer.idle();

    const version = store.rows[0]!.versions[0]!;
    expect(version.indexingStatus).toBe('no_indexable');
    expect(version.indexingError).toMatch(/escaneado/);
  });

  it('un PDF ilegible también es no indexable', async () => {
    await upload(pdfWith('ROTO'));
    await indexer.idle();

    expect(store.rows[0]!.versions[0]!.indexingStatus).toBe('no_indexable');
  });

  it('si el servicio de embeddings falla, queda con error y el documento sigue disponible (RN-DOC-07)', async () => {
    embedder.embed = async () => {
      throw new Error('Ollama caído');
    };

    const document = await upload();
    await indexer.idle();

    expect(store.rows[0]!.versions[0]).toMatchObject({ indexingStatus: 'error' });
    expect(store.rows[0]!.status).toBe('publicado');
    expect(errors).toHaveLength(1);
    expect(document.id).toBeDefined();
  });

  it('HU-DOC-06: Dado un error de indexación, cuando pulso reintentar, entonces se lanza de nuevo', async () => {
    const original = embedder.embed.bind(embedder);
    embedder.embed = async () => {
      throw new Error('Ollama caído');
    };
    const document = await upload();
    await indexer.idle();
    embedder.embed = original;

    await reindexDocument(
      { ...deps, indexingStore: indexing, indexer },
      context('gestion'),
      document.id,
    );
    expect(store.rows[0]!.versions[0]!.indexingStatus).toBe('pendiente');
    await indexer.idle();

    expect(store.rows[0]!.versions[0]!.indexingStatus).toBe('indexado');
  });

  it('reindexar exige gestión y un documento publicado', async () => {
    const document = await upload();
    await withdrawDocument(deps, context('gestion'), document.id);

    await expect(
      reindexDocument(
        { ...deps, indexingStore: indexing, indexer },
        context('consulta'),
        document.id,
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      reindexDocument(
        { ...deps, indexingStore: indexing, indexer },
        context('gestion'),
        document.id,
      ),
    ).rejects.toThrow(InvalidDocumentTransitionError);
  });

  it('RN-DOC-05: una versión nueva sustituye los fragmentos de la anterior', async () => {
    const document = await upload(pdfWith('Texto antiguo sobre tractores.'));
    await indexer.idle();

    await addVersion(
      deps,
      context('gestion'),
      document.id,
      pdfWith('Texto nuevo sobre cosechadoras.'),
    );
    await indexer.idle();

    expect(indexing.fragments.map((f) => f.content)).toEqual(['Texto nuevo sobre cosechadoras.']);
  });

  it('RN-DOC-05: retirar un documento borra sus fragmentos', async () => {
    const document = await upload();
    await indexer.idle();

    await withdrawDocument(deps, context('gestion'), document.id);

    expect(indexing.fragments).toEqual([]);
  });

  it('un trabajo de una versión que ya no es la vigente se descarta', async () => {
    const document = await upload(pdfWith('versión uno'));
    await addVersion(deps, context('gestion'), document.id, pdfWith('versión dos'));
    await indexer.idle();

    expect(indexing.fragments.map((f) => f.content)).toEqual(['versión dos']);
  });

  it('al arrancar, recupera las versiones que quedaron pendientes', async () => {
    const document = await upload();
    // Simula un reinicio: el trabajo en cola se perdió y la versión sigue pendiente.
    indexing.fragments.length = 0;
    store.rows[0]!.versions[0]!.indexingStatus = 'pendiente';

    expect(await indexer.resumePending()).toBe(1);
    await indexer.idle();

    expect(indexing.fragments[0]?.documentId).toBe(document.id);
  });
});

describe('búsqueda por contenido (HU-DOC-07)', () => {
  it('devuelve los fragmentos más relevantes con su página', async () => {
    const document = await upload(
      pdfWith(
        'El capital social mínimo es de tres mil euros.',
        'La asamblea general ordinaria se celebra en junio.',
      ),
    );
    await indexer.idle();

    const [best] = await search('¿Cuándo se celebra la asamblea general?');

    expect(best).toMatchObject({ documentId: document.id, page: 2, title: 'Estatutos' });
  });

  it('nunca devuelve fragmentos de otra cooperativa, aunque el texto coincida exactamente (ADR-003)', async () => {
    const text = 'La asamblea general ordinaria se celebra en junio.';
    await upload(pdfWith(text), context('gestion', OTHER));
    await indexer.idle();

    expect(await search(text)).toEqual([]);
  });

  it('no devuelve documentos retirados', async () => {
    const document = await upload();
    await indexer.idle();
    await withdrawDocument(deps, context('gestion'), document.id);

    expect(await search('asamblea junio')).toEqual([]);
  });
});
