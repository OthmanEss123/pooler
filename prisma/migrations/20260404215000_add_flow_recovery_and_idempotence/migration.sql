ALTER TABLE "FlowExecution"
ADD COLUMN "triggerRef" TEXT NOT NULL DEFAULT 'legacy',
ADD COLUMN "timeoutAt" TIMESTAMP(3),
ADD COLUMN "lastHeartbeat" TIMESTAMP(3);

UPDATE "FlowExecution"
SET "triggerRef" = md5("flowId" || ':' || "contactId" || ':' || to_char(date_trunc('day', COALESCE("startedAt", CURRENT_TIMESTAMP)), 'YYYY-MM-DD'))
WHERE "triggerRef" = 'legacy';

ALTER TABLE "FlowExecution"
ALTER COLUMN "triggerRef" DROP DEFAULT;

CREATE UNIQUE INDEX IF NOT EXISTS "FlowExecution_flowId_contactId_triggerRef_key"
ON "FlowExecution"("flowId", "contactId", "triggerRef");

CREATE INDEX IF NOT EXISTS "FlowExecution_status_lastHeartbeat_idx"
ON "FlowExecution"("status", "lastHeartbeat");
