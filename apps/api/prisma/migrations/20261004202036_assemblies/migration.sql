-- CreateEnum
CREATE TYPE "AssemblyType" AS ENUM ('ordinaria', 'extraordinaria');

-- CreateEnum
CREATE TYPE "AssemblyStatus" AS ENUM ('borrador', 'convocada', 'celebrada', 'cancelada');

-- CreateEnum
CREATE TYPE "Majority" AS ENUM ('simple', 'reforzada');

-- CreateEnum
CREATE TYPE "VotingStatus" AS ENUM ('abierta', 'cerrada');

-- CreateEnum
CREATE TYPE "VoteChoice" AS ENUM ('a_favor', 'en_contra', 'abstencion');

-- CreateEnum
CREATE TYPE "CallApplied" AS ENUM ('primera', 'segunda');

-- CreateEnum
CREATE TYPE "VotingOutcome" AS ENUM ('aprobado', 'rechazado', 'sin_quorum');

-- CreateTable
CREATE TABLE "AssemblySettings" (
    "cooperativeId" UUID NOT NULL,
    "firstCallQuorumPercent" INTEGER NOT NULL DEFAULT 50,
    "secondCallQuorumPercent" INTEGER NOT NULL DEFAULT 0,
    "reinforcedNumerator" INTEGER NOT NULL DEFAULT 2,
    "reinforcedDenominator" INTEGER NOT NULL DEFAULT 3,
    "minNoticeDays" INTEGER NOT NULL DEFAULT 15,

    CONSTRAINT "AssemblySettings_pkey" PRIMARY KEY ("cooperativeId")
);

-- CreateTable
CREATE TABLE "Assembly" (
    "id" UUID NOT NULL,
    "cooperativeId" UUID NOT NULL,
    "type" "AssemblyType" NOT NULL,
    "status" "AssemblyStatus" NOT NULL DEFAULT 'borrador',
    "firstCallAt" TIMESTAMP(3) NOT NULL,
    "secondCallAt" TIMESTAMP(3),
    "place" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assembly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssemblyPoint" (
    "id" UUID NOT NULL,
    "assemblyId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "votable" BOOLEAN NOT NULL,
    "majority" "Majority",

    CONSTRAINT "AssemblyPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointAttachment" (
    "id" UUID NOT NULL,
    "pointId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Voting" (
    "id" UUID NOT NULL,
    "pointId" UUID NOT NULL,
    "status" "VotingStatus" NOT NULL DEFAULT 'abierta',
    "majority" "Majority" NOT NULL,
    "firstCallQuorumPercent" INTEGER NOT NULL,
    "secondCallQuorumPercent" INTEGER NOT NULL,
    "reinforcedNumerator" INTEGER NOT NULL,
    "reinforcedDenominator" INTEGER NOT NULL,
    "secondCallAvailable" BOOLEAN NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "inFavor" INTEGER,
    "against" INTEGER,
    "abstentions" INTEGER,
    "callApplied" "CallApplied",
    "quorumReached" BOOLEAN,
    "outcome" "VotingOutcome",

    CONSTRAINT "Voting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VotingCensus" (
    "votingId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,

    CONSTRAINT "VotingCensus_pkey" PRIMARY KEY ("votingId","membershipId")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" UUID NOT NULL,
    "votingId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "choice" "VoteChoice" NOT NULL,
    "castAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Assembly_cooperativeId_status_firstCallAt_idx" ON "Assembly"("cooperativeId", "status", "firstCallAt");

-- CreateIndex
CREATE INDEX "AssemblyPoint_assemblyId_position_idx" ON "AssemblyPoint"("assemblyId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "PointAttachment_fileKey_key" ON "PointAttachment"("fileKey");

-- CreateIndex
CREATE INDEX "PointAttachment_pointId_idx" ON "PointAttachment"("pointId");

-- CreateIndex
CREATE UNIQUE INDEX "Voting_pointId_key" ON "Voting"("pointId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_votingId_membershipId_key" ON "Vote"("votingId", "membershipId");

-- AddForeignKey
ALTER TABLE "AssemblyPoint" ADD CONSTRAINT "AssemblyPoint_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointAttachment" ADD CONSTRAINT "PointAttachment_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "AssemblyPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voting" ADD CONSTRAINT "Voting_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "AssemblyPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VotingCensus" ADD CONSTRAINT "VotingCensus_votingId_fkey" FOREIGN KEY ("votingId") REFERENCES "Voting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_votingId_fkey" FOREIGN KEY ("votingId") REFERENCES "Voting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_votingId_membershipId_fkey" FOREIGN KEY ("votingId", "membershipId") REFERENCES "VotingCensus"("votingId", "membershipId") ON DELETE RESTRICT ON UPDATE CASCADE;
