-- ADR-021: the per-cooperative logo is removed; the primary colour stays.
-- Objects already uploaded under cooperatives/<id>/branding/ stay orphaned in storage.
ALTER TABLE "CooperativeBranding" DROP COLUMN "logoKey",
DROP COLUMN "logoContentType";
