-- CreateIndex
CREATE INDEX "Membership_profileId_idx" ON "Membership"("profileId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_idx" ON "AuditEvent"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditEvent_targetUserId_idx" ON "AuditEvent"("targetUserId");
