-- BR-INV-15: three independent alerts, each with its own switch and number of days.

-- Invoices: the former shared "dueSoonDays" becomes the invoice notice (1 to 90 days).
ALTER TABLE "InvoicingSettings" RENAME COLUMN "dueSoonDays" TO "invoiceNoticeDays";
ALTER TABLE "InvoicingSettings"
  RENAME CONSTRAINT "InvoicingSettings_dueSoonDays_range" TO "InvoicingSettings_invoiceNoticeDays_range";
ALTER TABLE "InvoicingSettings" ADD COLUMN "invoiceNoticeEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Delivery notes: deadline to invoice them (30 days, as before) and notice before it.
ALTER TABLE "InvoicingSettings" ADD COLUMN "noteDeadlineEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "InvoicingSettings" ADD COLUMN "noteDeadlineDays" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "InvoicingSettings" ADD COLUMN "noteNoticeEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "InvoicingSettings" ADD COLUMN "noteNoticeDays" INTEGER NOT NULL DEFAULT 15;

-- Existing rows keep their behaviour: the note notice was the same shared number of days.
UPDATE "InvoicingSettings" SET "noteNoticeDays" = "invoiceNoticeDays";

ALTER TABLE "InvoicingSettings"
  ADD CONSTRAINT "InvoicingSettings_noteDeadlineDays_range" CHECK ("noteDeadlineDays" BETWEEN 1 AND 365),
  ADD CONSTRAINT "InvoicingSettings_noteNoticeDays_range" CHECK ("noteNoticeDays" BETWEEN 1 AND 365);
