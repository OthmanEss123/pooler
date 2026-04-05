ALTER TABLE "Contact"
ADD COLUMN IF NOT EXISTS "subscribed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "unsubscribedAt" TIMESTAMP(3);

UPDATE "Contact"
SET "subscribed" = false
WHERE "emailStatus" = 'UNSUBSCRIBED';