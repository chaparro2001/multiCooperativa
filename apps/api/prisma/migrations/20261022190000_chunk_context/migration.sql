-- Structure-aware chunks with a contextual header (ADR-023).
-- `section`: heading path of the fragment. `contextHeader`: "<title> · <category> · <section>",
-- indexed (embedded and full-text) with the content but never shown. Both nullable: fragments
-- indexed before this migration have neither until they are reindexed.
ALTER TABLE "DocumentChunk" ADD COLUMN "section" TEXT, ADD COLUMN "contextHeader" TEXT;

-- The generated tsvector now covers the header too (the title is a very good search term).
ALTER TABLE "DocumentChunk" DROP COLUMN "contentTsv";
ALTER TABLE "DocumentChunk"
  ADD COLUMN "contentTsv" tsvector GENERATED ALWAYS AS (
    to_tsvector('spanish_unaccent', COALESCE("contextHeader", '') || ' ' || content)
  ) STORED;
CREATE INDEX "DocumentChunk_contentTsv_idx" ON "DocumentChunk" USING GIN ("contentTsv");

-- Reindex on deploy: the chunking and what is embedded changed, so every indexed current version
-- of a published document goes back to `pending`. The API resumes pending versions at startup
-- (resumePending, one at a time); `replaceDocument` swaps a document's fragments in one
-- transaction, so until each one is reindexed its old fragments stay searchable and a failure
-- (for example the embeddings service being down) leaves them in place with status `error`,
-- from where the existing retry (US-DOC-06) reindexes it.
UPDATE "DocumentVersion" v
SET "indexingStatus" = 'pending', "indexingError" = NULL
FROM "Document" d
WHERE d.id = v."documentId"
  AND v."isCurrent"
  AND v."indexingStatus" = 'indexed'
  AND d.status = 'published';
