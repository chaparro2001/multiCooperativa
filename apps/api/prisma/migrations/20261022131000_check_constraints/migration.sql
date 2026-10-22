-- Database-level guards for rules the domain already enforces in application code.
-- Same bounds as the domain; nothing stricter (credit notes keep allowing negative amounts).

-- AssemblySettings (BR-ASM-05, BR-ASM-08, BR-ASM-09)
ALTER TABLE "AssemblySettings"
  ADD CONSTRAINT "AssemblySettings_quorum_percent_check"
    CHECK ("firstCallQuorumPercent" BETWEEN 0 AND 100 AND "secondCallQuorumPercent" BETWEEN 0 AND 100),
  ADD CONSTRAINT "AssemblySettings_reinforced_check"
    CHECK ("reinforcedDenominator" > 0 AND "reinforcedNumerator" >= 0),
  ADD CONSTRAINT "AssemblySettings_min_notice_days_check" CHECK ("minNoticeDays" >= 0);

-- Assembly: the second call is after the first
ALTER TABLE "Assembly"
  ADD CONSTRAINT "Assembly_second_call_after_first_check"
    CHECK ("secondCallAt" IS NULL OR "secondCallAt" > "firstCallAt");

-- Invoice (BR-INV-07, BR-INV-13): VAT rate 0..100; total = base + VAT within 0.01
ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_vat_rate_check" CHECK ("vatRate" BETWEEN 0 AND 100),
  ADD CONSTRAINT "Invoice_total_check"
    CHECK (abs("total" - ("base" + round("base" * "vatRate" / 100, 2))) <= 0.01);

-- Lines: quantity greater than zero
ALTER TABLE "DeliveryNoteLine" ADD CONSTRAINT "DeliveryNoteLine_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_quantity_check" CHECK ("quantity" > 0);

-- InvoicingSettings (BR-INV-08, BR-INV-15)
ALTER TABLE "InvoicingSettings"
  ADD CONSTRAINT "InvoicingSettings_tolerance_check" CHECK ("toleranceBasisPoints" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "InvoicingSettings_days_check" CHECK (
    "invoiceNoticeDays" BETWEEN 1 AND 90
    AND "noteDeadlineDays" BETWEEN 1 AND 365
    AND "noteNoticeDays" BETWEEN 1 AND 365
  ),
  ADD CONSTRAINT "InvoicingSettings_note_notice_before_deadline_check" CHECK (
    NOT ("noteDeadlineEnabled" AND "noteNoticeEnabled") OR "noteNoticeDays" < "noteDeadlineDays"
  );

-- AssistantSetting: ADR-019 sources
ALTER TABLE "AssistantSetting"
  ADD CONSTRAINT "AssistantSetting_source_check" CHECK ("source" IN ('local', 'hosted'));
