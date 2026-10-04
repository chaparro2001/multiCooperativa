import type { FileStorage } from '../../../shared/files/file-storage';
import { chunkPages, hasExtractableText } from '../domain/chunking';
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
  'El PDF no contiene texto extraíble (¿es un documento escaneado?). Sigue siendo consultable, pero el asistente no lo conoce.';
const UNREADABLE = 'El fichero no se ha podido leer como PDF.';
const FAILED = 'No se ha podido indexar. Vuelve a intentarlo más tarde.';

/** Extract, chunk, embed and store one version (requisitos/03, section 4). */
export async function indexVersion(deps: IndexingDeps, job: PendingVersion): Promise<void> {
  const version = await deps.store.findVersion(job.cooperativeId, job.documentId, job.versionId);
  // A newer version or a withdrawal arrived first: this job is stale (RN-DOC-04).
  if (!version?.indexable) return;

  try {
    const pdf = await deps.files.read(version.fileKey);
    let pages;
    try {
      pages = await deps.extractor.extract(pdf);
    } catch (error) {
      if (error instanceof UnreadablePdfError) {
        await deps.store.setStatus(job.versionId, 'no_indexable', UNREADABLE);
        return;
      }
      throw error;
    }
    if (!hasExtractableText(pages)) {
      await deps.store.setStatus(job.versionId, 'no_indexable', NO_TEXT);
      return;
    }

    const chunks = chunkPages(pages);
    const embeddings = await deps.embedder.embed(chunks.map((chunk) => chunk.content));
    await deps.index.replaceDocument(
      job.cooperativeId,
      job.documentId,
      job.versionId,
      chunks.map((chunk, i) => ({
        page: chunk.page,
        position: chunk.index,
        content: chunk.content,
        embedding: embeddings[i]!,
      })),
    );
    await deps.store.setStatus(job.versionId, 'indexado', null);
  } catch (error) {
    // RN-DOC-07: the document stays available; it just is not indexed yet (HU-DOC-06: retry).
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
