-- AlterTable
ALTER TABLE "ShopSettings" ADD COLUMN     "reviewEmailsMonth" TEXT,
ADD COLUMN     "reviewEmailsUsedMonth" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reviewLink" TEXT,
ADD COLUMN     "reviewReplyTo" TEXT;

-- CreateTable
CREATE TABLE "ReviewRequest" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clickedAt" TIMESTAMP(3),
    "rating" INTEGER,
    "comment" TEXT,
    "ratedAt" TIMESTAMP(3),
    "remindedAt" TIMESTAMP(3),

    CONSTRAINT "ReviewRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailOptOut" (
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailOptOut_pkey" PRIMARY KEY ("email")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewRequest_token_key" ON "ReviewRequest"("token");

-- CreateIndex
CREATE INDEX "ReviewRequest_shop_sentAt_idx" ON "ReviewRequest"("shop", "sentAt");

-- CreateIndex
CREATE INDEX "ReviewRequest_shop_email_idx" ON "ReviewRequest"("shop", "email");
