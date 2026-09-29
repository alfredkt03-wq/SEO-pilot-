-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoScan" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "productsScanned" INTEGER NOT NULL,
    "pagesScanned" INTEGER NOT NULL,
    "collectionsScanned" INTEGER NOT NULL,
    "totalIssues" INTEGER NOT NULL,
    "sitemapOk" BOOLEAN NOT NULL DEFAULT true,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoIssue" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "resourceTitle" TEXT NOT NULL,
    "resourceHandle" TEXT NOT NULL,
    "imageId" TEXT,
    "brokenLinkPath" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "suggestion" TEXT,
    "fixed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopSettings" (
    "shop" TEXT NOT NULL,
    "brandName" TEXT,
    "totalFixesApplied" INTEGER NOT NULL DEFAULT 0,
    "totalRedirectsCreated" INTEGER NOT NULL DEFAULT 0,
    "onboardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("shop")
);

-- CreateIndex
CREATE UNIQUE INDEX "SeoScan_shop_key" ON "SeoScan"("shop");

-- CreateIndex
CREATE INDEX "SeoIssue_shop_idx" ON "SeoIssue"("shop");

-- CreateIndex
CREATE INDEX "SeoIssue_shop_fixed_idx" ON "SeoIssue"("shop", "fixed");
