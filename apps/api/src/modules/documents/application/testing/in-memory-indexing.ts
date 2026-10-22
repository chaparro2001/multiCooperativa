import type { IndexingStatus } from '../../domain/document';
import { fuseRankings } from '../../domain/rank-fusion';
import { requiredTermMatches } from '../../domain/term-coverage';
import type {
  FragmentHit,
  FragmentIndex,
  IndexedFragment,
  SearchQuery,
} from '../ports/fragment-index';
import type { IndexingStore, PendingVersion, VersionToIndex } from '../ports/indexing-store';
import type { InMemoryDocumentStore } from './in-memory-document-store';

const terms = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .match(/\p{L}{3,}/gu) ?? [],
  );

const cosine = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + value * b[i]!, 0);

/** Test doubles of the indexing ports, reading documents from the in-memory document store. */
export class InMemoryIndexing implements IndexingStore, FragmentIndex {
  readonly fragments: (IndexedFragment & {
    cooperativeId: string;
    documentId: string;
    versionId: string;
  })[] = [];

  constructor(
    private readonly documents: InMemoryDocumentStore,
    /** Mirrors the vector-arm threshold of the real index. */
    private readonly minVectorScore = 0,
    /** Mirrors the text-arm similarity floor of the real index. */
    private readonly minTextScore = 0,
  ) {}

  private version(versionId: string) {
    for (const row of this.documents.rows) {
      const version = row.versions.find((v) => v.id === versionId);
      if (version) return { row, version };
    }
    return null;
  }

  async findVersion(
    cooperativeId: string,
    documentId: string,
    versionId: string,
  ): Promise<VersionToIndex | null> {
    const found = this.version(versionId);
    if (!found || found.row.id !== documentId || found.row.cooperativeId !== cooperativeId)
      return null;
    return {
      fileKey: found.version.fileKey,
      indexable: found.version.isCurrent && found.row.status === 'published',
      title: found.row.title,
      category: found.row.category,
    };
  }

  async setStatus(versionId: string, status: IndexingStatus, error: string | null) {
    const found = this.version(versionId);
    if (found) Object.assign(found.version, { indexingStatus: status, indexingError: error });
  }

  async listPending(): Promise<PendingVersion[]> {
    return this.documents.rows.flatMap((row) =>
      row.status !== 'published'
        ? []
        : row.versions
            .filter((v) => v.isCurrent && v.indexingStatus === 'pending')
            .map((v) => ({
              cooperativeId: row.cooperativeId,
              documentId: row.id,
              versionId: v.id,
            })),
    );
  }

  async replaceDocument(
    cooperativeId: string,
    documentId: string,
    versionId: string,
    fragments: IndexedFragment[],
  ) {
    await this.deleteDocument(cooperativeId, documentId);
    this.fragments.push(...fragments.map((f) => ({ ...f, cooperativeId, documentId, versionId })));
  }

  async deleteDocument(cooperativeId: string, documentId: string) {
    for (let i = this.fragments.length - 1; i >= 0; i--) {
      const f = this.fragments[i]!;
      if (f.cooperativeId === cooperativeId && f.documentId === documentId)
        this.fragments.splice(i, 1);
    }
  }

  /** Same shape as the SQL: a vector arm above the threshold, a text arm on shared terms, RRF. */
  async search(cooperativeId: string, query: SearchQuery, limit: number): Promise<FragmentHit[]> {
    const pool = 20;
    const queryTerms = terms(query.text);
    const required = requiredTermMatches(queryTerms.size);
    const candidates = this.fragments
      .filter((f) => f.cooperativeId === cooperativeId)
      .flatMap((f) => {
        const row = this.documents.rows.find((r) => r.id === f.documentId);
        if (!row || row.status !== 'published') return [];
        const shared = [...terms(f.content)].filter((term) => queryTerms.has(term)).length;
        return [
          {
            documentId: f.documentId,
            versionId: f.versionId,
            title: row.title,
            category: row.category,
            page: f.page,
            content: f.content,
            score: cosine(f.embedding, query.embedding),
            shared,
            vectorRank: null as number | null,
            textRank: null as number | null,
          },
        ];
      });
    candidates
      .filter((c) => c.score >= this.minVectorScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, pool)
      .forEach((c, i) => (c.vectorRank = i + 1));
    candidates
      .filter((c) => c.shared >= required && c.shared > 0 && c.score >= this.minTextScore)
      .sort((a, b) => b.shared - a.shared)
      .slice(0, pool)
      .forEach((c, i) => (c.textRank = i + 1));
    return fuseRankings(
      candidates.filter((c) => c.vectorRank !== null || c.textRank !== null),
      limit,
    ).map(({ shared: _s, vectorRank: _v, textRank: _t, ...hit }) => hit);
  }
}
