-- CreateTable
CREATE TABLE "CooperativeBranding" (
    "cooperativeId" UUID NOT NULL,
    "primaryColor" TEXT,
    "logoKey" TEXT,
    "logoContentType" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CooperativeBranding_pkey" PRIMARY KEY ("cooperativeId")
);
