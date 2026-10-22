-- Full-text arm of the hybrid search (ADR-022). Generated, so the raw INSERTs of the indexer
-- do not change. The 'spanish' configuration stems and drops stopwords.
ALTER TABLE "DocumentChunk"
  ADD COLUMN "contentTsv" tsvector GENERATED ALWAYS AS (to_tsvector('spanish', content)) STORED;

CREATE INDEX "DocumentChunk_contentTsv_idx" ON "DocumentChunk" USING GIN ("contentTsv");
