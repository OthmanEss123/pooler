CREATE EXTENSION IF NOT EXISTS vector;

ALTER TYPE "SegmentType" ADD VALUE IF NOT EXISTS 'SEMANTIC';

ALTER TABLE "Contact"
  ADD COLUMN IF NOT EXISTS "sourceChannel" TEXT,
  ADD COLUMN IF NOT EXISTS "properties" JSONB,
  ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "tenantId" TEXT,
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "rawPayload" JSONB;

UPDATE "Order" AS o
SET "tenantId" = c."tenantId"
FROM "Contact" AS c
WHERE o."contactId" = c.id
  AND o."tenantId" IS NULL;

UPDATE "Order"
SET "externalId" = CONCAT('legacy-order-', id)
WHERE "externalId" IS NULL;

ALTER TABLE "Order"
  ALTER COLUMN "tenantId" SET NOT NULL,
  ALTER COLUMN "externalId" SET NOT NULL;

DROP INDEX IF EXISTS "Order_externalId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Order_tenantId_externalId_key"
  ON "Order"("tenantId", "externalId");
CREATE INDEX IF NOT EXISTS "Order_tenantId_idx"
  ON "Order"("tenantId");

ALTER TABLE "OrderItem"
  ADD COLUMN IF NOT EXISTS "tenantId" TEXT,
  ADD COLUMN IF NOT EXISTS "externalId" TEXT,
  ADD COLUMN IF NOT EXISTS "productExternalId" TEXT,
  ADD COLUMN IF NOT EXISTS "sku" TEXT;

UPDATE "OrderItem" AS oi
SET
  "tenantId" = o."tenantId",
  "externalId" = CONCAT('legacy-order-item-', oi.id)
FROM "Order" AS o
WHERE oi."orderId" = o.id
  AND (oi."tenantId" IS NULL OR oi."externalId" IS NULL);

ALTER TABLE "OrderItem"
  ALTER COLUMN "tenantId" SET NOT NULL,
  ALTER COLUMN "externalId" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "OrderItem_tenantId_externalId_key"
  ON "OrderItem"("tenantId", "externalId");
CREATE INDEX IF NOT EXISTS "OrderItem_tenantId_idx"
  ON "OrderItem"("tenantId");

ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "rawPayload" JSONB;

CREATE INDEX IF NOT EXISTS "Contact_embedding_idx"
ON "Contact"
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
