-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('estatutos', 'reglamento', 'actas', 'cuentas', 'otros');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('publicado', 'retirado');

-- CreateEnum
CREATE TYPE "IndexingStatus" AS ENUM ('pendiente', 'indexado', 'error', 'no_indexable');

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "cooperativeId" UUID NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "documentDate" DATE NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'publicado',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL,
    "indexingStatus" "IndexingStatus" NOT NULL DEFAULT 'pendiente',
    "indexingError" TEXT,
    "uploadedByMembershipId" UUID NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Document_cooperativeId_status_category_documentDate_idx" ON "Document"("cooperativeId", "status", "category", "documentDate");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_fileKey_key" ON "DocumentVersion"("fileKey");

-- CreateIndex
CREATE INDEX "DocumentVersion_documentId_uploadedAt_idx" ON "DocumentVersion"("documentId", "uploadedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_key" ON "DocumentVersion"("documentId") WHERE ("isCurrent");

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
