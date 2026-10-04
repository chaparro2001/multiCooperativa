import type { DocumentCategory, DocumentState } from '../../domain/document';
import type {
  DocumentRecord,
  DocumentStore,
  DocumentWithCurrent,
  NewVersion,
  VersionRecord,
} from '../ports/document-store';

/** Test double with the same ordering and scoping rules as the Prisma store. */
export class InMemoryDocumentStore implements DocumentStore {
  readonly rows: (DocumentRecord & { versions: VersionRecord[] })[] = [];
  private nextId = 1;

  private id() {
    return `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, '0')}`;
  }

  private withCurrent(row: DocumentRecord & { versions: VersionRecord[] }): DocumentWithCurrent {
    const { versions, ...document } = row;
    return { ...document, current: { ...versions.find((version) => version.isCurrent)! } };
  }

  private version(data: NewVersion): VersionRecord {
    return {
      id: this.id(),
      ...data,
      isCurrent: true,
      indexingStatus: 'pendiente',
      indexingError: null,
      uploadedAt: new Date(Date.UTC(2026, 9, 1, 0, 0, this.nextId)),
    };
  }

  private row(cooperativeId: string, id: string) {
    return this.rows.find((r) => r.id === id && r.cooperativeId === cooperativeId);
  }

  async list(
    cooperativeId: string,
    query: { onlyPublished: boolean; category?: DocumentCategory; search?: string },
  ) {
    return this.rows
      .filter((row) => row.cooperativeId === cooperativeId)
      .filter((row) => !query.onlyPublished || row.status === 'publicado')
      .filter((row) => !query.category || row.category === query.category)
      .filter(
        (row) => !query.search || row.title.toLowerCase().includes(query.search.toLowerCase()),
      )
      .sort(
        (a, b) => b.documentDate.localeCompare(a.documentDate) || a.title.localeCompare(b.title),
      )
      .map((row) => this.withCurrent(row));
  }

  async find(cooperativeId: string, id: string) {
    const row = this.row(cooperativeId, id);
    return row ? this.withCurrent(row) : null;
  }

  async create(cooperativeId: string, data: { state: DocumentState; version: NewVersion }) {
    const row = {
      id: this.id(),
      cooperativeId,
      createdAt: new Date(),
      ...data.state,
      versions: [this.version(data.version)],
    };
    this.rows.push(row);
    return this.withCurrent(row);
  }

  async addVersion(
    cooperativeId: string,
    id: string,
    check: (document: DocumentRecord) => void,
    version: NewVersion,
  ) {
    const row = this.row(cooperativeId, id);
    if (!row) return null;
    const { versions, ...document } = row;
    check(document);
    for (const existing of versions) existing.isCurrent = false;
    versions.push(this.version(version));
    return this.withCurrent(row);
  }

  async update(
    cooperativeId: string,
    id: string,
    decide: (current: DocumentRecord) => DocumentState,
  ) {
    const row = this.row(cooperativeId, id);
    if (!row) return null;
    const { versions: _versions, ...current } = row;
    Object.assign(row, decide(current));
    const { versions: _after, ...record } = row;
    return record;
  }

  async listVersions(cooperativeId: string, id: string) {
    const row = this.row(cooperativeId, id);
    return row ? [...row.versions].reverse() : null;
  }
}
