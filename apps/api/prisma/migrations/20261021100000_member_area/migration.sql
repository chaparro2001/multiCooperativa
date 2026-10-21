-- CreateEnum
CREATE TYPE "CapitalMovementType" AS ENUM ('mandatory_contribution', 'voluntary_contribution', 'refund', 'correction');

-- CreateTable
CREATE TABLE "CapitalMovement" (
    "id" UUID NOT NULL,
    "cooperativeId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" "CapitalMovementType" NOT NULL,
    "concept" VARCHAR(200) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "recordedByMembershipId" UUID NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CapitalMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CapitalMovement_cooperativeId_membershipId_date_idx" ON "CapitalMovement"("cooperativeId", "membershipId", "date");

-- Contributions and refunds are positive; only a correction may be negative, never zero (BR-MEM-03).
ALTER TABLE "CapitalMovement" ADD CONSTRAINT "CapitalMovement_amount_check"
    CHECK ("amount" <> 0 AND ("type" = 'correction' OR "amount" > 0));

-- BR-MEM-01: movements are immutable; a mistake is corrected with a movement of opposite sign.
CREATE FUNCTION "capital_movement_immutable"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Capital movements are immutable (BR-MEM-01)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CapitalMovement_immutable"
    BEFORE UPDATE OR DELETE ON "CapitalMovement"
    FOR EACH ROW EXECUTE FUNCTION "capital_movement_immutable"();
