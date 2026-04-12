ALTER TYPE "IntegrationType" ADD VALUE IF NOT EXISTS 'WORDPRESS';

CREATE TABLE IF NOT EXISTS "wordpress_posts" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "category" TEXT,
  "rawPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "wordpress_posts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "wordpress_posts_tenantId_externalId_key"
  ON "wordpress_posts"("tenantId", "externalId");

CREATE INDEX IF NOT EXISTS "wordpress_posts_tenantId_idx"
  ON "wordpress_posts"("tenantId");

CREATE INDEX IF NOT EXISTS "wordpress_posts_publishedAt_idx"
  ON "wordpress_posts"("publishedAt");

DO $$
BEGIN
  ALTER TABLE "wordpress_posts"
    ADD CONSTRAINT "wordpress_posts_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
