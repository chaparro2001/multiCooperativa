import { Prisma, type PrismaClient } from '../../../shared/infrastructure/prisma';
import type { DocumentCategory } from '../domain/document';
import type {
  FragmentHit,
  FragmentIndex,
  IndexedFragment,
} from '../application/ports/fragment-index';

/** pgvector literal: '[0.1,0.2,…]'. Numbers only, so it cannot carry SQL. */
const toVector = (embedding: number[]) => `[${embedding.map((value) => Number(value)).join(',')}]`;

/** Rows per INSERT: well below PostgreSQL's limit of bind parameters. */
const INSERT_BATCH = 100;

/**
 * Fragments with their embeddings in PostgreSQL (ADR-006). Exact cosine search
 * over the cooperative's own rows: filtered first, so isolation does not depend
 * on an approximate index (NFR-DOC-03).
 */
export class PgVectorFragmentIndex implements FragmentIndex {
  constructor(private readonly prisma: PrismaClient) {}

  async replaceDocument(
    cooperativeId: string,
    documentId: string,
    versionId: string,
    fragments: IndexedFragment[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.documentChunk.deleteMany({ where: { cooperativeId, documentId } });
      for (let start = 0; start < fragments.length; start += INSERT_BATCH) {
        const rows = fragments.slice(start, start + INSERT_BATCH).map(
          (fragment) => Prisma.sql`(
            gen_random_uuid(), ${cooperativeId}::uuid, ${documentId}::uuid, ${versionId}::uuid,
            ${fragment.page}, ${fragment.position}, ${fragment.content}, ${toVector(fragment.embedding)}::vector
          )`,
        );
        await tx.$executeRaw`
          INSERT INTO "DocumentChunk"
            (id, "cooperativeId", "documentId", "versionId", page, position, content, embedding)
          VALUES ${Prisma.join(rows)}`;
      }
    });
  }

  async deleteDocument(cooperativeId: string, documentId: string): Promise<void> {
    await this.prisma.documentChunk.deleteMany({ where: { cooperativeId, documentId } });
  }

  async search(cooperativeId: string, embedding: number[], limit: number): Promise<FragmentHit[]> {
    // Exact search on purpose (BR-AI-04): the WHERE on cooperativeId narrows the scan to one
    // cooperative's chunks first, and the order is exact cosine distance. An HNSW index would be
    // applied before that filter (post-filtering), so it could return fewer than `limit` rows.
    // If a single cooperative grows past roughly 100k chunks (an order-of-magnitude estimate, not
    // measured), consider HNSW with `vector_cosine_ops` (matches `<=>`) and a higher `hnsw.ef_search`.
    const vector = toVector(embedding);
    const rows = await this.prisma.$queryRaw<
      {
        documentId: string;
        versionId: string;
        title: string;
        category: DocumentCategory;
        page: number;
        content: string;
        score: number;
      }[]
    >`
      SELECT c."documentId", c."versionId", d.title, d.category::text AS category, c.page, c.content,
             1 - (c.embedding <=> ${vector}::vector) AS score
      FROM "DocumentChunk" c
      JOIN "Document" d ON d.id = c."documentId"
      WHERE c."cooperativeId" = ${cooperativeId}::uuid
        AND d."cooperativeId" = ${cooperativeId}::uuid
        AND d.status = 'published'
      ORDER BY c.embedding <=> ${vector}::vector
      LIMIT ${limit}`;
    return rows.map((row) => ({ ...row, score: Number(row.score) }));
  }
}
