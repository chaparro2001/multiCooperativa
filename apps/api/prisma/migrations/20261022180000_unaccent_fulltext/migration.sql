-- Accent-insensitive full-text arm (ADR-023). `unaccent` ships with PostgreSQL contrib (it is a
-- trusted extension, so the database owner can create it) and is in the pgvector image.
-- 'spanish_unaccent' = the Spanish configuration with every word first stripped of its accents
-- and then stemmed, so "quorum" finds "quórum" and "articulo" finds "artículo", whichever side
-- carries the accents. Note: stopwords are matched after unaccenting, so a few accented
-- stopwords ("más", "sí") are no longer dropped; they are harmless noise.
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TEXT SEARCH CONFIGURATION spanish_unaccent (COPY = spanish);
ALTER TEXT SEARCH CONFIGURATION spanish_unaccent
  ALTER MAPPING FOR hword, hword_part, word WITH unaccent, spanish_stem;

-- Rebuild the generated column (and its GIN index) with the new configuration; PostgreSQL fills
-- the existing rows while rewriting the table.
ALTER TABLE "DocumentChunk" DROP COLUMN "contentTsv";
ALTER TABLE "DocumentChunk"
  ADD COLUMN "contentTsv" tsvector GENERATED ALWAYS AS (to_tsvector('spanish_unaccent', content)) STORED;

CREATE INDEX "DocumentChunk_contentTsv_idx" ON "DocumentChunk" USING GIN ("contentTsv");
