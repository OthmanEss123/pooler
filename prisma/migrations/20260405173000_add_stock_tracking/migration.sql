ALTER TABLE "products"
ADD COLUMN IF NOT EXISTS "stockQuantity" INTEGER,
ADD COLUMN IF NOT EXISTS "lowStockAlert" INTEGER,
ADD COLUMN IF NOT EXISTS "trackStock" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "OrderItem"
ADD COLUMN IF NOT EXISTS "productId" TEXT;

DO $$
BEGIN
  ALTER TABLE "OrderItem"
    ADD CONSTRAINT "OrderItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "OrderItem_productId_idx" ON "OrderItem"("productId");
CREATE INDEX IF NOT EXISTS "products_tenantId_trackStock_idx" ON "products"("tenantId", "trackStock");
