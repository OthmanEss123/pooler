/*
  Warnings:

  - The values [SHOPIFY,FACEBOOK_ADS] on the enum `IntegrationType` will be removed. If these variants are still used in the database, this will fail.
  - The values [SEMANTIC] on the enum `SegmentType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `embedding` on the `Contact` table. All the data in the column will be lost.
  - You are about to drop the `AbTest` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Campaign` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `EmailEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Flow` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `FlowExecution` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `FlowExecutionStep` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[verifyToken]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "IntegrationType_new" AS ENUM ('WOOCOMMERCE', 'GOOGLE_ANALYTICS', 'GOOGLE_ADS', 'WORDPRESS');
ALTER TABLE "integrations" ALTER COLUMN "type" TYPE "IntegrationType_new" USING ("type"::text::"IntegrationType_new");
ALTER TYPE "IntegrationType" RENAME TO "IntegrationType_old";
ALTER TYPE "IntegrationType_new" RENAME TO "IntegrationType";
DROP TYPE "public"."IntegrationType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "SegmentType_new" AS ENUM ('DYNAMIC', 'STATIC', 'GA4');
ALTER TABLE "Segment" ALTER COLUMN "type" TYPE "SegmentType_new" USING ("type"::text::"SegmentType_new");
ALTER TYPE "SegmentType" RENAME TO "SegmentType_old";
ALTER TYPE "SegmentType_new" RENAME TO "SegmentType";
DROP TYPE "public"."SegmentType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "AbTest" DROP CONSTRAINT "AbTest_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "Campaign" DROP CONSTRAINT "Campaign_segmentId_fkey";

-- DropForeignKey
ALTER TABLE "EmailEvent" DROP CONSTRAINT "EmailEvent_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "EmailEvent" DROP CONSTRAINT "EmailEvent_contactId_fkey";

-- DropForeignKey
ALTER TABLE "Flow" DROP CONSTRAINT "Flow_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "FlowExecution" DROP CONSTRAINT "FlowExecution_contactId_fkey";

-- DropForeignKey
ALTER TABLE "FlowExecution" DROP CONSTRAINT "FlowExecution_flowId_fkey";

-- DropForeignKey
ALTER TABLE "FlowExecution" DROP CONSTRAINT "FlowExecution_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "FlowExecutionStep" DROP CONSTRAINT "FlowExecutionStep_executionId_fkey";

-- DropIndex
DROP INDEX "Contact_embedding_idx";

-- AlterTable
ALTER TABLE "Contact" DROP COLUMN "embedding";

-- AlterTable
ALTER TABLE "billing_subscriptions" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verifyToken" TEXT,
ADD COLUMN     "verifyTokenExpiry" TIMESTAMP(3);

-- DropTable
DROP TABLE "AbTest";

-- DropTable
DROP TABLE "Campaign";

-- DropTable
DROP TABLE "EmailEvent";

-- DropTable
DROP TABLE "Flow";

-- DropTable
DROP TABLE "FlowExecution";

-- DropTable
DROP TABLE "FlowExecutionStep";

-- DropEnum
DROP TYPE "CampaignStatus";

-- DropEnum
DROP TYPE "CampaignType";

-- DropEnum
DROP TYPE "EmailEventType";

-- DropEnum
DROP TYPE "FlowExecutionStatus";

-- DropEnum
DROP TYPE "FlowStatus";

-- DropEnum
DROP TYPE "StepStatus";

-- CreateTable
CREATE TABLE "invitation_tokens" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitation_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitation_tokens_token_key" ON "invitation_tokens"("token");

-- CreateIndex
CREATE INDEX "invitation_tokens_tenantId_idx" ON "invitation_tokens"("tenantId");

-- CreateIndex
CREATE INDEX "invitation_tokens_expiresAt_idx" ON "invitation_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_verifyToken_key" ON "users"("verifyToken");

-- AddForeignKey
ALTER TABLE "invitation_tokens" ADD CONSTRAINT "invitation_tokens_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
