import { Prisma, type PrismaClient } from '../../../shared/infrastructure/prisma';
import type { DocumentCategory } from '../domain/document';
import type {
  FragmentHit,
  FragmentIndex,
  IndexedFragment,
  SearchQuery,
} from '../application/ports/fragment-index';
import { fuseRankings } from '../domain/rank-fusion';

/** pgvector literal: '[0.1,0.2,…]'. Numbers only, so it cannot carry SQL. */
const toVector = (embedding: number[]) => `[${embedding.map((value) => Number(value)).join(',')}]`;

/** Rows per INSERT: well below PostgreSQL's limit of bind parameters. */
const INSERT_BATCH = 100;

/** Candidates each arm contributes to the fusion; the result is cut to the caller's `limit`. */
const ARM_POOL = 20;

export interface PgVectorFragmentIndexOptions {
  /**
   * Minimum cosine similarity for the vector arm (0..1). Text-arm matches are kept regardless:
   * an exact term is evidence on its own. It depends on the embedding model (ADR-022).
   */
  minVectorScore: number;
  /**
   * Minimum cosine similarity for a text-arm hit (0..1, at most `minVectorScore`): a fragment that
   * shares terms but is unrelated in meaning is still dropped. Also depends on the model.
   */
  minTextScore: number;
}

/**
 * Fragments with their embeddings in PostgreSQL (ADR-006) and a generated Spanish tsvector
 * (ADR-022). Hybrid search: exact cosine search plus full-text search over the cooperative's
 * own rows, filtered first, so isolation does not depend on an approximate index (NFR-DOC-03).
 */
export class PgVectorFragmentIndex implements FragmentIndex {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly options: PgVectorFragmentIndexOptions,
  ) {}

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
            ${fragment.page}, ${fragment.position}, ${fragment.content}, ${fragment.section}, ${fragment.contextHeader}, ${toVector(fragment.embedding)}::vector
          )`,
        );
        await tx.$executeRaw`
          INSERT INTO "DocumentChunk"
            (id, "cooperativeId", "documentId", "versionId", page, position, content, section, "contextHeader", embedding)
          VALUES ${Prisma.join(rows)}`;
      }
    });
  }

  async deleteDocument(cooperativeId: string, documentId: string): Promise<void> {
    await this.prisma.documentChunk.deleteMany({ where: { cooperativeId, documentId } });
  }

  async search(cooperativeId: string, query: SearchQuery, limit: number): Promise<FragmentHit[]> {
    // Exact vector search on purpose (BR-AI-04): the WHERE on cooperativeId narrows the scan to
    // one cooperative's chunks first, and the order is exact cosine distance. An HNSW index would
    // be applied before that filter (post-filtering), so it could return fewer than `limit` rows.
    // Not needed at this size: if a single cooperative grows past roughly 100k chunks (an
    // order-of-magnitude estimate, not measured), consider HNSW with `vector_cosine_ops` (matches
    // `<=>`) and a higher `hnsw.ef_search`.
    //
    // The text arm ORs the query terms (plainto_tsquery ANDs them, which finds nothing for a
    // natural-language question): the tsquery is built by the database from the bound text, so any
    // user text is safe. A query of only stopwords gives an empty tsquery, which matches nothing.
    // To stop one common word from bypassing the vector threshold, a fragment must contain enough
    // distinct query lexemes (requiredTermMatches) and reach the text-arm similarity floor.
    //
    // One statement, two CTEs over the same isolation filter. Fusion (RRF) is the pure function in
    // the domain; SQL only returns each candidate with its rank in each arm.
    const vector = toVector(query.embedding);
    const rows = await this.prisma.$queryRaw<
      {
        documentId: string;
        versionId: string;
        title: string;
        category: DocumentCategory;
        page: number;
        content: string;
        score: number;
        vectorRank: number | null;
        textRank: number | null;
      }[]
    >`
      WITH vec AS (
        SELECT c.id, row_number() OVER (ORDER BY c.embedding <=> ${vector}::vector)::int AS rank
        FROM "DocumentChunk" c
        JOIN "Document" d ON d.id = c."documentId"
        WHERE c."cooperativeId" = ${cooperativeId}::uuid
          AND d."cooperativeId" = ${cooperativeId}::uuid
          AND d.status = 'published'
          AND 1 - (c.embedding <=> ${vector}::vector) >= ${this.options.minVectorScore}
        ORDER BY c.embedding <=> ${vector}::vector
        LIMIT ${ARM_POOL}
      ),
      tsq AS (
        SELECT replace(plainto_tsquery('spanish_unaccent', ${query.text})::text, '&', '|')::tsquery AS q,
               tsvector_to_array(to_tsvector('spanish_unaccent', ${query.text})) AS lexemes
      ),
      need AS (
        -- Mirrors requiredTermMatches (domain/term-coverage.ts).
        SELECT q, lexemes,
               CASE WHEN cardinality(lexemes) = 0 THEN 0
                    WHEN cardinality(lexemes) = 1 THEN 1
                    ELSE GREATEST(2, ceil(cardinality(lexemes) / 2.0)::int) END AS required
        FROM tsq
      ),
      txt AS (
        SELECT cand.id, row_number() OVER (ORDER BY cand.rank DESC, cand.title, cand.position, cand.id)::int AS rank
        FROM (
          SELECT c.id, d.title, c.position, ts_rank_cd(c."contentTsv", need.q) AS rank,
                 cardinality(ARRAY(
                   SELECT unnest(tsvector_to_array(c."contentTsv"))
                   INTERSECT SELECT unnest(need.lexemes)
                 )) AS matches,
                 need.required,
                 1 - (c.embedding <=> ${vector}::vector) AS similarity
          FROM "DocumentChunk" c
          JOIN "Document" d ON d.id = c."documentId"
          CROSS JOIN need
          WHERE c."cooperativeId" = ${cooperativeId}::uuid
            AND d."cooperativeId" = ${cooperativeId}::uuid
            AND d.status = 'published'
            AND c."contentTsv" @@ need.q
        ) cand
        WHERE cand.matches >= cand.required AND cand.similarity >= ${this.options.minTextScore}
        ORDER BY cand.rank DESC, cand.title, cand.position, cand.id
        LIMIT ${ARM_POOL}
      )
      SELECT c."documentId", c."versionId", d.title, d.category::text AS category, c.page, c.content,
             1 - (c.embedding <=> ${vector}::vector) AS score,
             vec.rank AS "vectorRank", txt.rank AS "textRank"
      FROM (SELECT id FROM vec UNION SELECT id FROM txt) hit
      JOIN "DocumentChunk" c ON c.id = hit.id
      JOIN "Document" d ON d.id = c."documentId"
      LEFT JOIN vec ON vec.id = hit.id
      LEFT JOIN txt ON txt.id = hit.id
      WHERE c."cooperativeId" = ${cooperativeId}::uuid
      ORDER BY d.title, c.position, c.id`;
    const arm = query.arm ?? 'hybrid';
    const ranked =
      arm === 'hybrid'
        ? fuseRankings(rows, limit)
        : rows
            .filter((row) => (arm === 'vector' ? row.vectorRank : row.textRank) !== null)
            .sort((a, b) =>
              arm === 'vector' ? a.vectorRank! - b.vectorRank! : a.textRank! - b.textRank!,
            )
            .slice(0, limit);
    return ranked.map(({ vectorRank: _v, textRank: _t, ...hit }) => ({
      ...hit,
      score: Number(hit.score),
    }));
  }
}
