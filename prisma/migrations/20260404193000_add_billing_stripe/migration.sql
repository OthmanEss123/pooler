DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingPlan') THEN
    CREATE TYPE "BillingPlan" AS ENUM ('STARTER', 'GROWTH', 'SCALE');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingSubscriptionStatus') THEN
    CREATE TYPE "BillingSubscriptionStatus" AS ENUM (
      'ACTIVE',
      'TRIALING',
      'PAST_DUE',
      'INCOMPLETE',
      'CANCELED',
      'UNPAID'
    );
  END IF;
END $$;

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "plan" "BillingPlan" NOT NULL DEFAULT 'STARTER',
  ADD COLUMN IF NOT EXISTS "planStatus" "BillingSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE TABLE IF NOT EXISTS "billing_subscriptions" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "plan" "BillingPlan" NOT NULL DEFAULT 'STARTER',
  "status" "BillingSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "stripeCustomerId" TEXT,
  "stripeSubscriptionId" TEXT,
  "stripePriceId" TEXT,
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_subscriptions_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'billing_subscriptions_tenantId_fkey'
  ) THEN
    ALTER TABLE "billing_subscriptions"
      ADD CONSTRAINT "billing_subscriptions_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "billing_subscriptions_tenantId_key"
  ON "billing_subscriptions"("tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "billing_subscriptions_stripeCustomerId_key"
  ON "billing_subscriptions"("stripeCustomerId");
CREATE UNIQUE INDEX IF NOT EXISTS "billing_subscriptions_stripeSubscriptionId_key"
  ON "billing_subscriptions"("stripeSubscriptionId");
CREATE INDEX IF NOT EXISTS "billing_subscriptions_status_idx"
  ON "billing_subscriptions"("status");
