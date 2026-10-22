-- Keyset pagination of the lists (docs/requirements): each sort ends in the id so it is unique,
-- and starts with the cooperative (ADR-003) so a page reads only its own rows.

-- GET /documents: newest date first, then title, then id.
CREATE INDEX "Document_list_idx" ON "Document"("cooperativeId", "documentDate" DESC, "title", "id");

-- GET /delivery-notes and GET /invoices: newest first by (date, number, id), per operation.
CREATE INDEX "DeliveryNote_list_idx" ON "DeliveryNote"("cooperativeId", "operation", "date" DESC, "number" DESC, "id" DESC);
CREATE INDEX "Invoice_list_idx" ON "Invoice"("cooperativeId", "operation", "issueDate" DESC, "number" DESC, "id" DESC);

-- GET /member-area/.../movements: statement of a member, newest first.
CREATE INDEX "CapitalMovement_statement_idx" ON "CapitalMovement"("cooperativeId", "membershipId", "date" DESC, "recordedAt" DESC, "id" DESC);
