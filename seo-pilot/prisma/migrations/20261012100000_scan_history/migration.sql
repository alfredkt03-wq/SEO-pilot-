-- CreateTable
CREATE TABLE "SeoScanHistory" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "totalIssues" INTEGER NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoScanHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeoScanHistory_shop_scannedAt_idx" ON "SeoScanHistory"("shop", "scannedAt");
