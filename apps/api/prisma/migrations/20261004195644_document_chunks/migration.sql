-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" UUID NOT NULL,
    "cooperativeId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "page" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1024) NOT NULL,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentChunk_cooperativeId_idx" ON "DocumentChunk"("cooperativeId");

-- CreateIndex
CREATE INDEX "DocumentChunk_documentId_idx" ON "DocumentChunk"("documentId");

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
