-- ADR-025: partner NIF (unique among live memberships of a cooperative) and the day a membership was removed.
-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "leftAt" DATE,
ADD COLUMN     "nif" VARCHAR(9);

-- Memberships removed before this change: the last update is the closest known date.
UPDATE "Membership" SET "leftAt" = "updatedAt"::date WHERE status = 'removed';

-- CreateIndex
CREATE UNIQUE INDEX "Membership_live_nif_key" ON "Membership"("cooperativeId", "nif") WHERE (status <> 'removed' AND nif IS NOT NULL);
