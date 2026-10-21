-- AlterTable
ALTER TABLE "InvoicingSettings" ADD COLUMN "dueSoonDays" INTEGER NOT NULL DEFAULT 15;

-- BR-INV-15: between 1 and 90 days.
ALTER TABLE "InvoicingSettings"
  ADD CONSTRAINT "InvoicingSettings_dueSoonDays_range" CHECK ("dueSoonDays" BETWEEN 1 AND 90);
