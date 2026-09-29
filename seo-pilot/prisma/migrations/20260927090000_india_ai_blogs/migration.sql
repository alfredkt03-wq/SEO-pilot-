-- AlterTable
ALTER TABLE "ShopSettings" ADD COLUMN "billingCurrency" TEXT,
ADD COLUMN "storeCurrency" TEXT,
ADD COLUMN "aiCreditsUsedTotal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "aiCreditsMonth" TEXT,
ADD COLUMN "aiCreditsUsedMonth" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "speedScore" INTEGER,
ADD COLUMN "speedLcp" TEXT,
ADD COLUMN "speedCls" TEXT,
ADD COLUMN "speedTbt" TEXT,
ADD COLUMN "speedCheckedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SeoScan" ADD COLUMN "previousScore" INTEGER;

-- AlterTable
ALTER TABLE "SeoIssue" ADD COLUMN "aiGenerated" BOOLEAN NOT NULL DEFAULT false;
