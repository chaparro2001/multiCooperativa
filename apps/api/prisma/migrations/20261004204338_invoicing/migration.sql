-- CreateEnum
CREATE TYPE "Operation" AS ENUM ('compra', 'venta');

-- CreateEnum
CREATE TYPE "DeliveryNoteStatus" AS ENUM ('pendiente_facturar', 'facturado', 'anulado');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pendiente', 'vencida', 'liquidada', 'anulada');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('sin_albaranes', 'conciliada', 'con_discrepancia');

-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('proxima_a_vencer', 'vencida');

-- CreateTable
CREATE TABLE "InvoicingSettings" (
    "cooperativeId" UUID NOT NULL,
    "toleranceBasisPoints" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "InvoicingSettings_pkey" PRIMARY KEY ("cooperativeId")
);

-- CreateTable
CREATE TABLE "ThirdParty" (
    "id" UUID NOT NULL,
    "cooperativeId" UUID NOT NULL,
    "nif" VARCHAR(9) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "isSupplier" BOOLEAN NOT NULL,
    "isCustomer" BOOLEAN NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThirdParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryNote" (
    "id" UUID NOT NULL,
    "cooperativeId" UUID NOT NULL,
    "thirdPartyId" UUID NOT NULL,
    "operation" "Operation" NOT NULL,
    "number" VARCHAR(50) NOT NULL,
    "date" DATE NOT NULL,
    "status" "DeliveryNoteStatus" NOT NULL DEFAULT 'pendiente_facturar',
    "invoiceId" UUID,
    "fileKey" TEXT,
    "fileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryNoteLine" (
    "id" UUID NOT NULL,
    "deliveryNoteId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "concept" VARCHAR(200) NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,

    CONSTRAINT "DeliveryNoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "cooperativeId" UUID NOT NULL,
    "thirdPartyId" UUID NOT NULL,
    "operation" "Operation" NOT NULL,
    "number" VARCHAR(50) NOT NULL,
    "issueDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "base" DECIMAL(12,2) NOT NULL,
    "vatRate" DECIMAL(5,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'pendiente',
    "reconciliationStatus" "ReconciliationStatus" NOT NULL,
    "settledAt" DATE,
    "fileKey" TEXT,
    "fileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "concept" VARCHAR(200) NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Discrepancy" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "concept" VARCHAR(200) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "deliveredQuantity" DECIMAL(14,3) NOT NULL,
    "invoicedQuantity" DECIMAL(14,3) NOT NULL,
    "explanation" TEXT,

    CONSTRAINT "Discrepancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceReminder" (
    "invoiceId" UUID NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "sentOn" DATE NOT NULL,

    CONSTRAINT "InvoiceReminder_pkey" PRIMARY KEY ("invoiceId","kind")
);

-- CreateIndex
CREATE INDEX "ThirdParty_cooperativeId_name_idx" ON "ThirdParty"("cooperativeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ThirdParty_cooperativeId_nif_key" ON "ThirdParty"("cooperativeId", "nif");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryNote_fileKey_key" ON "DeliveryNote"("fileKey");

-- CreateIndex
CREATE INDEX "DeliveryNote_cooperativeId_operation_status_idx" ON "DeliveryNote"("cooperativeId", "operation", "status");

-- CreateIndex
CREATE INDEX "DeliveryNote_invoiceId_idx" ON "DeliveryNote"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryNote_thirdPartyId_number_key" ON "DeliveryNote"("thirdPartyId", "number");

-- CreateIndex
CREATE INDEX "DeliveryNoteLine_deliveryNoteId_idx" ON "DeliveryNoteLine"("deliveryNoteId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_fileKey_key" ON "Invoice"("fileKey");

-- CreateIndex
CREATE INDEX "Invoice_cooperativeId_operation_paymentStatus_dueDate_idx" ON "Invoice"("cooperativeId", "operation", "paymentStatus", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_received_number_key" ON "Invoice"("thirdPartyId", "number") WHERE (operation = 'compra');

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_issued_number_key" ON "Invoice"("cooperativeId", "number") WHERE (operation = 'venta');

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "Discrepancy_invoiceId_idx" ON "Discrepancy"("invoiceId");

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_thirdPartyId_fkey" FOREIGN KEY ("thirdPartyId") REFERENCES "ThirdParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteLine" ADD CONSTRAINT "DeliveryNoteLine_deliveryNoteId_fkey" FOREIGN KEY ("deliveryNoteId") REFERENCES "DeliveryNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_thirdPartyId_fkey" FOREIGN KEY ("thirdPartyId") REFERENCES "ThirdParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discrepancy" ADD CONSTRAINT "Discrepancy_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceReminder" ADD CONSTRAINT "InvoiceReminder_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
