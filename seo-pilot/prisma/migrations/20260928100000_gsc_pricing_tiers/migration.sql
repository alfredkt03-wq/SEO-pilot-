-- AlterTable
ALTER TABLE "ShopSettings" ADD COLUMN "gscRefreshToken" TEXT,
ADD COLUMN "gscSiteUrl" TEXT,
ADD COLUMN "gscConnectedAt" TIMESTAMP(3),
ADD COLUMN "gscLastCheckedAt" TIMESTAMP(3),
ADD COLUMN "gscClicks28d" INTEGER,
ADD COLUMN "gscImpressions28d" INTEGER,
ADD COLUMN "gscTopQueries" TEXT;
