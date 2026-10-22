import { randomUUID } from 'node:crypto';

import type { FileStorage } from '../../../shared/files/file-storage';
import type { PrismaClient } from '../../../shared/infrastructure/prisma';
import { retrieveFragments } from '../application/documents';
import { indexVersion } from '../application/indexing';
import type { Embedder } from '../application/ports/embedder';
import { PgVectorFragmentIndex } from '../infrastructure/pgvector-fragment-index';
import { PrismaIndexingStore } from '../infrastructure/prisma-indexing-store';
import { UnpdfTextExtractor } from '../infrastructure/unpdf-text-extractor';
import { RETRIEVAL_CASES } from './retrieval-cases';
import { RETRIEVAL_CORPUS } from './retrieval-corpus';
import type { CaseResult } from './retrieval-metrics';

export interface BenchmarkDeps {
  prisma: PrismaClient;
  cooperativeId: string;
  embedder: Embedder;
}

export type BenchmarkArm = 'hybrid' | 'vector' | 'text';

/**
 * Indexes the benchmark corpus through the production path (stored PDF, unpdf, chunking,
 * embeddings, pgvector) into the given cooperative. Returns how many fragments were stored.
 */
export async function indexBenchmarkCorpus(
  deps: BenchmarkDeps & {
    files: FileStorage;
    thresholds: { vector: number; text: number };
  },
): Promise<{ chunks: number }> {
  const { prisma, cooperativeId, files } = deps;
  const indexing = {
    store: new PrismaIndexingStore(prisma),
    index: new PgVectorFragmentIndex(prisma, {
      minVectorScore: deps.thresholds.vector,
      minTextScore: deps.thresholds.text,
    }),
    files,
    extractor: new UnpdfTextExtractor(),
    embedder: deps.embedder,
    onError: (error: unknown) => console.error('indexing failed:', error),
  };
  for (const doc of RETRIEVAL_CORPUS) {
    const fileKey = `bench/${randomUUID()}`;
    await files.put(fileKey, await doc.build(), 'application/pdf');
    const document = await prisma.document.create({
      data: {
        cooperativeId,
        title: doc.title,
        category: doc.category,
        documentDate: new Date(doc.documentDate),
      },
    });
    const version = await prisma.documentVersion.create({
      data: {
        documentId: document.id,
        fileKey,
        fileName: `${doc.title}.pdf`,
        size: 1,
        isCurrent: true,
        uploadedByMembershipId: randomUUID(),
      },
    });
    await indexVersion(indexing, { cooperativeId, documentId: document.id, versionId: version.id });
  }
  const notIndexed = await prisma.documentVersion.count({
    where: { indexingStatus: { not: 'indexed' } },
  });
  if (notIndexed > 0) throw new Error(`${notIndexed} corpus documents failed to index.`);
  return { chunks: await prisma.documentChunk.count() };
}

/** Runs every golden question through the search (one arm, given thresholds). */
export async function searchBenchmarkCases(
  deps: BenchmarkDeps,
  options: { arm: BenchmarkArm; minVector: number; minText: number },
): Promise<(CaseResult & { scores: number[] })[]> {
  const index = new PgVectorFragmentIndex(deps.prisma, {
    minVectorScore: options.minVector,
    minTextScore: options.minText,
  });
  const results: (CaseResult & { scores: number[] })[] = [];
  for (const testCase of RETRIEVAL_CASES) {
    const hits = await retrieveFragments(
      { embedder: deps.embedder, index },
      deps.cooperativeId,
      testCase.question,
      options.arm,
    );
    results.push({
      testCase,
      fragments: hits.map((hit) => ({ title: hit.title, page: hit.page, content: hit.content })),
      scores: hits.map((hit) => hit.score),
    });
  }
  return results;
}
