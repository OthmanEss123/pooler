/*
  Warnings:

  - You are about to drop the column `healthScore` on the `Contact` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "InsightType" AS ENUM ('ANOMALY', 'AD_WASTE', 'REVENUE_FORECAST', 'SEGMENT_OPPORTUNITY', 'EMAIL_PERFORMANCE', 'PRODUCT_INTELLIGENCE');

-- CreateEnum
CREATE TYPE "RfmSegment" AS ENUM ('CHAMPION', 'LOYAL', 'POTENTIAL', 'NEW', 'AT_RISK', 'CANT_LOSE', 'LOST');

-- AlterTable
ALTER TABLE "Contact" DROP COLUMN "healthScore";

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "imageUrl" TEXT,
    "category" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Insight" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "InsightType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "data" JSONB,
    "impact" DECIMAL(12,2),
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Insight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerHealthScore" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "segment" "RfmSegment" NOT NULL,
    "rfmScore" INTEGER NOT NULL,
    "recencyScore" INTEGER NOT NULL,
    "frequencyScore" INTEGER NOT NULL,
    "monetaryScore" INTEGER NOT NULL,
    "churnRisk" DOUBLE PRECISION NOT NULL,
    "predictedLtv" DOUBLE PRECISION,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerHealthScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_tenantId_idx" ON "products"("tenantId");

-- CreateIndex
CREATE INDEX "products_tenantId_category_idx" ON "products"("tenantId", "category");

-- CreateIndex
CREATE INDEX "products_tenantId_isActive_idx" ON "products"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenantId_externalId_key" ON "products"("tenantId", "externalId");

-- CreateIndex
CREATE INDEX "Insight_tenantId_idx" ON "Insight"("tenantId");

-- CreateIndex
CREATE INDEX "Insight_tenantId_type_idx" ON "Insight"("tenantId", "type");

-- CreateIndex
CREATE INDEX "Insight_createdAt_idx" ON "Insight"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerHealthScore_contactId_key" ON "CustomerHealthScore"("contactId");

-- CreateIndex
CREATE INDEX "CustomerHealthScore_tenantId_idx" ON "CustomerHealthScore"("tenantId");

-- CreateIndex
CREATE INDEX "CustomerHealthScore_tenantId_segment_idx" ON "CustomerHealthScore"("tenantId", "segment");

-- CreateIndex
CREATE INDEX "CustomerHealthScore_calculatedAt_idx" ON "CustomerHealthScore"("calculatedAt");

-- AddForeignKey
ALTER TABLE "Insight" ADD CONSTRAINT "Insight_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerHealthScore" ADD CONSTRAINT "CustomerHealthScore_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerHealthScore" ADD CONSTRAINT "CustomerHealthScore_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
