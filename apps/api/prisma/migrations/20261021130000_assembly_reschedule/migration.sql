-- US-ASM-09: a convened assembly can be rescheduled; the previous call is kept.
ALTER TABLE "Assembly"
  ADD COLUMN "previousFirstCallAt" TIMESTAMP(3),
  ADD COLUMN "previousSecondCallAt" TIMESTAMP(3),
  ADD COLUMN "previousPlace" VARCHAR(200),
  ADD COLUMN "rescheduledAt" TIMESTAMP(3),
  ADD COLUMN "rescheduleReason" VARCHAR(500);
