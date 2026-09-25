-- Store reviews: a customer's rating of a store, one per delivered order; demo reviews are flagged and have no order.
-- CreateTable
CREATE TABLE "StoreReview" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT,
    "userId" TEXT,
    "rating" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "ownerReply" TEXT,
    "ownerRepliedAt" TIMESTAMP(3),
    "reportedAt" TIMESTAMP(3),
    "reportReason" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StoreReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreReview_orderId_key" ON "StoreReview"("orderId");

-- CreateIndex
CREATE INDEX "StoreReview_storeId_status_createdAt_idx" ON "StoreReview"("storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "StoreReview_status_createdAt_idx" ON "StoreReview"("status", "createdAt");

-- CreateIndex
CREATE INDEX "StoreReview_reportedAt_idx" ON "StoreReview"("reportedAt");

-- AddForeignKey
ALTER TABLE "StoreReview" ADD CONSTRAINT "StoreReview_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreReview" ADD CONSTRAINT "StoreReview_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreReview" ADD CONSTRAINT "StoreReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Ratings are whole stars from 1 to 5, whatever writes them.
ALTER TABLE "StoreReview" ADD CONSTRAINT "StoreReview_rating_check" CHECK ("rating" BETWEEN 1 AND 5);
