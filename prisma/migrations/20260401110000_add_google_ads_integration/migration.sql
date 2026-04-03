-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('SHOPIFY', 'WOOCOMMERCE', 'GOOGLE_ANALYTICS', 'GOOGLE_ADS');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('ACTIVE', 'DISCONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "AdCampaignType" AS ENUM ('SEARCH', 'SHOPPING', 'PERFORMANCE_MAX', 'DISPLAY', 'VIDEO');

-- CreateEnum
CREATE TYPE "AdCampaignStatus" AS ENUM ('ENABLED', 'PAUSED', 'REMOVED');

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "IntegrationType" NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "credentials" TEXT,
    "metadata" JSONB,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCampaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AdCampaignType" NOT NULL,
    "status" "AdCampaignStatus" NOT NULL,
    "budgetDaily" DECIMAL(18,2),
    "spend" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "conversionValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "roas" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdAudience" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "adCampaignId" TEXT,
    "segmentId" TEXT,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdAudience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdAudienceMember" (
    "audienceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdAudienceMember_pkey" PRIMARY KEY ("audienceId", "contactId")
);

-- CreateIndex
CREATE INDEX "integrations_tenantId_idx" ON "integrations"("tenantId");

-- CreateIndex
CREATE INDEX "integrations_status_idx" ON "integrations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_tenantId_type_key" ON "integrations"("tenantId", "type");

-- CreateIndex
CREATE INDEX "AdCampaign_tenantId_idx" ON "AdCampaign"("tenantId");

-- CreateIndex
CREATE INDEX "AdCampaign_status_idx" ON "AdCampaign"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AdCampaign_tenantId_externalId_key" ON "AdCampaign"("tenantId", "externalId");

-- CreateIndex
CREATE INDEX "AdAudience_tenantId_idx" ON "AdAudience"("tenantId");

-- CreateIndex
CREATE INDEX "AdAudience_adCampaignId_idx" ON "AdAudience"("adCampaignId");

-- CreateIndex
CREATE INDEX "AdAudience_segmentId_idx" ON "AdAudience"("segmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AdAudience_tenantId_name_key" ON "AdAudience"("tenantId", "name");

-- CreateIndex
CREATE INDEX "AdAudienceMember_contactId_idx" ON "AdAudienceMember"("contactId");

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAudience" ADD CONSTRAINT "AdAudience_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAudience" ADD CONSTRAINT "AdAudience_adCampaignId_fkey" FOREIGN KEY ("adCampaignId") REFERENCES "AdCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAudience" ADD CONSTRAINT "AdAudience_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAudienceMember" ADD CONSTRAINT "AdAudienceMember_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "AdAudience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAudienceMember" ADD CONSTRAINT "AdAudienceMember_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
