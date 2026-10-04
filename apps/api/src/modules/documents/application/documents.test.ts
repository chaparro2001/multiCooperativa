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
  name: 'Estatutos.pdf',
  content: new TextEncoder().encode(`%PDF-1.4 ${text}`),
});

function context(level: 'consulta' | 'gestion' | null, cooperativeId = COOP): CooperativeContext {
  return {
    userId: 'user',
    sessionId: 'session',
    cooperativeId,
    membershipId: level === 'gestion' ? 'mem-gestor' : 'mem-socio',
    profileName: 'x',
    isPartner: true,
    permissions: level ? [{ module: 'documentos', level, scope: 'todas' }] : [],
  };
}

const manager = context('gestion');
const reader = context('consulta');

let store: InMemoryDocumentStore;
let files: InMemoryFileStorage;
let events: DocumentEvent[];
let deps: DocumentDeps;

beforeEach(() => {
  store = new InMemoryDocumentStore();
  files = new InMemoryFileStorage();
  events = [];
  const bus = new InProcessEventBus<DocumentEvent>({ onHandlerError: () => {} });
  bus.subscribe('DocumentoPublicado', (event) => void events.push(event));
  bus.subscribe('DocumentoRetirado', (event) => void events.push(event));
  deps = {
    documents: store,
    files,
    events: bus,
    now: () => new Date('2026-10-10T10:00:00Z'),
    members: { displayNames: async (_c, ids) => new Map(ids.map((id) => [id, `Nombre ${id}`])) },
  };
});

const upload = (
  title = 'Estatutos sociales',
  category: 'estatutos' | 'actas' = 'estatutos',
  documentDate = '2026-03-15',
) => uploadDocument(deps, manager, { title, category, documentDate }, pdf());

describe('subir (HU-DOC-01)', () => {
  it('Dado un PDF válido, cuando lo subo, entonces queda publicado y se emite DocumentoPublicado', async () => {
    const document = await upload();

    expect(document).toMatchObject({ status: 'publicado', title: 'Estatutos sociales' });
    expect(document.current).toMatchObject({
      isCurrent: true,
      indexingStatus: 'pendiente',
      fileName: 'Estatutos.pdf',
    });
    expect(events).toEqual([
      expect.objectContaining({
        type: 'DocumentoPublicado',
        payload: { cooperativeId: COOP, documentId: document.id, versionId: document.current.id },
      }),
    ]);
    expect([...files.files.keys()]).toEqual([
      expect.stringMatching(`^cooperativas/${COOP}/documentos/`),
    ]);
  });

  it('Dado un fichero que no es PDF, entonces se rechaza sin guardar nada', async () => {
    await expect(
      uploadDocument(
        deps,
        manager,
        { title: 'x', category: 'otros', documentDate: '2026-01-01' },
        { name: 'x.pdf', content: new TextEncoder().encode('PK zip') },
      ),
    ).rejects.toMatchObject({ reason: 'not_pdf' });
    expect(files.files.size).toBe(0);
    expect(store.rows).toHaveLength(0);
    expect(events).toEqual([]);
  });

  it('si guardar falla, el fichero subido se borra', async () => {
    store.create = async () => {
      throw new Error('base de datos caída');
    };

    await expect(upload()).rejects.toThrow('base de datos caída');
    expect(files.files.size).toBe(0);
  });

  it('con consulta no se sube (HU-ACC-07)', async () => {
    await expect(
      uploadDocument(
        deps,
        reader,
        { title: 'x', category: 'otros', documentDate: '2026-01-01' },
        pdf(),
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('consultar (HU-DOC-02)', () => {
  it('ordena por fecha descendente y filtra por categoría y por título', async () => {
    await upload('Estatutos sociales', 'estatutos', '2024-01-10');
    await upload('Acta de marzo', 'actas', '2026-03-31');
    await upload('Acta de junio', 'actas', '2026-06-30');

    const all = await listDocuments(deps, reader, {});
    const actas = await listDocuments(deps, reader, { category: 'actas' });
    const search = await listDocuments(deps, reader, { search: '  MARZO ' });

    expect(all.map((d) => d.title)).toEqual([
      'Acta de junio',
      'Acta de marzo',
      'Estatutos sociales',
    ]);
    expect(actas.map((d) => d.title)).toEqual(['Acta de junio', 'Acta de marzo']);
    expect(search.map((d) => d.title)).toEqual(['Acta de marzo']);
  });
});

describe('abrir (HU-DOC-03)', () => {
  it('Dado un documento publicado, cuando lo abro, entonces recibo la versión vigente con URL firmada', async () => {
    const document = await upload();

    const detail = await getDocument(deps, reader, document.id);

    expect(detail.url).toContain(document.current.fileKey);
    expect(detail.url).toContain('expires=300');
  });

  it('Dado un documento retirado, cuando lo abro sin gestión, entonces no existe', async () => {
    const document = await upload();
    await withdrawDocument(deps, manager, document.id);

    await expect(getDocument(deps, reader, document.id)).rejects.toThrow(DocumentNotFoundError);
    await expect(getDocument(deps, manager, document.id)).resolves.toMatchObject({
      status: 'retirado',
    });
  });

  it('un documento de otra cooperativa no existe (ADR-003)', async () => {
    const document = await upload();

    await expect(getDocument(deps, context('gestion', OTHER_COOP), document.id)).rejects.toThrow(
      DocumentNotFoundError,
    );
  });
});

describe('versiones (HU-DOC-04)', () => {
  it('Dado un documento publicado, cuando subo una versión nueva, entonces pasa a vigente, la anterior queda en el historial y se indexa la nueva', async () => {
    const document = await upload();
    const original = document.current;

    const updated = await addVersion(deps, manager, document.id, pdf('v2'));
    const history = await listVersions(deps, manager, document.id);

    expect(updated.current.id).not.toBe(original.id);
    expect(history.map((v) => [v.id, v.isCurrent])).toEqual([
      [updated.current.id, true],
      [original.id, false],
    ]);
    expect(history[0]?.uploadedByName).toBe('Nombre mem-gestor');
    expect(events.at(-1)?.payload).toMatchObject({ versionId: updated.current.id });
  });

  it('el historial solo se consulta con gestión', async () => {
    const document = await upload();

    await expect(listVersions(deps, reader, document.id)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('un documento retirado no admite versiones y no sube el fichero', async () => {
    const document = await upload();
    await withdrawDocument(deps, manager, document.id);
    const stored = files.files.size;

    await expect(addVersion(deps, manager, document.id, pdf('v2'))).rejects.toThrow(
      InvalidDocumentTransitionError,
    );
    expect(files.files.size).toBe(stored);
  });

  it('una versión que no es PDF se rechaza', async () => {
    const document = await upload();

    await expect(
      addVersion(deps, manager, document.id, { name: 'x', content: new Uint8Array() }),
    ).rejects.toThrow(DocumentFileRejectedError);
  });
});

describe('retirar (HU-DOC-05)', () => {
  it('Dado un documento publicado, cuando lo retiro, entonces deja de verse con consulta y se emite DocumentoRetirado', async () => {
    const document = await upload();

    await withdrawDocument(deps, manager, document.id);

    expect(await listDocuments(deps, reader, {})).toEqual([]);
    expect(events.at(-1)).toMatchObject({
      type: 'DocumentoRetirado',
      payload: { cooperativeId: COOP, documentId: document.id },
    });
  });

  it('retirar dos veces falla y no emite otro evento', async () => {
    const document = await upload();
    await withdrawDocument(deps, manager, document.id);

    await expect(withdrawDocument(deps, manager, document.id)).rejects.toThrow(
      InvalidDocumentTransitionError,
    );
    expect(events.filter((e) => e.type === 'DocumentoRetirado')).toHaveLength(1);
  });
});
