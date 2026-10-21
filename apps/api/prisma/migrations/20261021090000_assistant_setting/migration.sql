-- CreateTable
CREATE TABLE "AssistantSetting" (
    "cooperativeId" UUID NOT NULL,
    "model" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantSetting_pkey" PRIMARY KEY ("cooperativeId")
);
