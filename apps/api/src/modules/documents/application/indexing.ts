import type { FileStorage } from '../../../shared/files/file-storage';
import { chunkPages, hasExtractableText } from '../domain/chunking';
import { contextHeader, embeddedText, INDEXED_HEADER_PARTS } from '../domain/context-header';
import type { Embedder } from './ports/embedder';
import type { FragmentIndex } from './ports/fragment-index';
import type { IndexingStore, PendingVersion } from './ports/indexing-store';
import { type PdfTextExtractor, UnreadablePdfError } from './ports/text-extractor';

export interface IndexingDeps {
  store: IndexingStore;
  index: FragmentIndex;
  files: FileStorage;
  extractor: PdfTextExtractor;
  embedder: Embedder;
  /** Failures are recorded on the version; this only reports them (logs). */
  onError?: (error: unknown, job: PendingVersion) => void;
}

const NO_TEXT =
  'The PDF has no extractable text (is it a scanned document?). It can still be viewed, but the assistant does not know it.';
const UNREADABLE = 'The file could not be read as a PDF.';
const FAILED = 'Indexing failed. Try again later.';

/** Extract, chunk, embed and store one version (requirements/03, section 4). */
export async function indexVersion(deps: IndexingDeps, job: PendingVersion): Promise<void> {
  const version = await deps.store.findVersion(job.cooperativeId, job.documentId, job.versionId);
  // A newer version or a withdrawal arrived first: this job is stale (BR-DOC-04).
  if (!version?.indexable) return;

  try {
    const pdf = await deps.files.read(version.fileKey);
    let pages;
    try {
      pages = await deps.extractor.extract(pdf);
    } catch (error) {
      if (error instanceof UnreadablePdfError) {
        await deps.store.setStatus(job.versionId, 'not_indexable', UNREADABLE);
        return;
      }
      throw error;
    }
    if (!hasExtractableText(pages)) {
      await deps.store.setStatus(job.versionId, 'not_indexable', NO_TEXT);
      return;
    }

    const chunks = chunkPages(pages);
    // ADR-023: what is embedded (and searched as text) carries the document and section;
    // what is stored as `content` and cited stays the fragment's own text.
    const headers = chunks.map((chunk) =>
      contextHeader(
        { title: version.title, category: version.category, section: chunk.section },
        INDEXED_HEADER_PARTS,
      ),
    );
    const embeddings = await deps.embedder.embed(
      chunks.map((chunk, i) => embeddedText(headers[i]!, chunk.content)),
    );
    await deps.index.replaceDocument(
      job.cooperativeId,
      job.documentId,
      job.versionId,
      chunks.map((chunk, i) => ({
        page: chunk.page,
        position: chunk.index,
        content: chunk.content,
        section: chunk.section,
        contextHeader: headers[i]!,
        embedding: embeddings[i]!,
      })),
    );
    await deps.store.setStatus(job.versionId, 'indexed', null);
  } catch (error) {
    // BR-DOC-07: the document stays available; it just is not indexed yet (US-DOC-06: retry).
    await deps.store.setStatus(job.versionId, 'error', FAILED);
    deps.onError?.(error, job);
  }
}

/**
 * In-process queue (ADR-006): indexing never blocks the upload that triggered
 * it, and runs one job at a time so a big document cannot starve the API.
 */
export function createIndexer(deps: IndexingDeps) {
  let tail: Promise<void> = Promise.resolve();

  const enqueue = (job: PendingVersion) => {
    tail = tail.then(() => indexVersion(deps, job)).catch((error) => deps.onError?.(error, job));
  };

  return {
    enqueue,
    async remove(cooperativeId: string, documentId: string): Promise<void> {
      await deps.index.deleteDocument(cooperativeId, documentId);
    },
    /** After a restart: whatever was pending when the process stopped. */
    async resumePending(): Promise<number> {
      const pending = await deps.store.listPending();
      pending.forEach(enqueue);
      return pending.length;
    },
    /** Resolves when the queue is empty (tests, graceful shutdown). */
    async idle(): Promise<void> {
      let current: Promise<void>;
      do {
        current = tail;
        await current;
      } while (current !== tail);
    },
  };
}

export type Indexer = ReturnType<typeof createIndexer>;
