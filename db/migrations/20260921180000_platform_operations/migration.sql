-- Operational platform: order finance snapshot, a ledger that separates sale/cost/commission,
-- the fulfilment funding gate, invitation codes and support conversations.

-- ── Order statuses ───────────────────────────────────────────────────────────
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'AWAITING_FUNDS' BEFORE 'PROCESSING';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'ACCEPTED' BEFORE 'PROCESSING';

-- ── Withdrawal lifecycle ─────────────────────────────────────────────────────
ALTER TYPE "PayoutStatus" ADD VALUE IF NOT EXISTS 'APPROVED' BEFORE 'PAID';
ALTER TYPE "PayoutStatus" ADD VALUE IF NOT EXISTS 'PROCESSING' BEFORE 'PAID';

-- ── Ledger entry types ───────────────────────────────────────────────────────
ALTER TYPE "WalletEntryType" ADD VALUE IF NOT EXISTS 'ORDER_SALE' BEFORE 'ORDER_EARNING';
ALTER TYPE "WalletEntryType" ADD VALUE IF NOT EXISTS 'ORDER_FULFILMENT' BEFORE 'ORDER_EARNING';
ALTER TYPE "WalletEntryType" ADD VALUE IF NOT EXISTS 'ORDER_COMMISSION' BEFORE 'ORDER_EARNING';
ALTER TYPE "WalletEntryType" ADD VALUE IF NOT EXISTS 'ORDER_REFUND' BEFORE 'ORDER_EARNING';
ALTER TYPE "WalletEntryType" ADD VALUE IF NOT EXISTS 'FULFILMENT_REVERSAL' BEFORE 'ORDER_EARNING';
ALTER TYPE "WalletEntryType" ADD VALUE IF NOT EXISTS 'COMMISSION_REVERSAL' BEFORE 'ORDER_EARNING';

CREATE TYPE "WalletEntryStatus" AS ENUM ('PENDING', 'CLEARED');

-- ── Order: financial snapshot ────────────────────────────────────────────────
ALTER TABLE "Order"
  ADD COLUMN "fulfilmentCostCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "commissionRateBps" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "commissionBase" TEXT NOT NULL DEFAULT 'ORDER_REVENUE',
  ADD COLUMN "commissionCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ownerEarningCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "acceptedAt" TIMESTAMP(3);

-- Existing orders keep the rule they were placed under: no commission was charged before this release,
-- so their snapshot records 0% and the owner's earning stays exactly what the ledger already credited.
UPDATE "Order" o
SET "fulfilmentCostCents" = COALESCE(t."cost", 0),
    "ownerEarningCents" = GREATEST(0, COALESCE(t."revenue", 0) - COALESCE(t."cost", 0) - o."discountCents")
FROM (
  SELECT i."orderId",
         SUM(i."unitCostCents" * i."quantity") AS "cost",
         SUM(i."unitPriceCents" * i."quantity") AS "revenue"
  FROM "OrderItem" i GROUP BY i."orderId"
) t
WHERE t."orderId" = o."id";

CREATE INDEX "Order_storeId_status_idx" ON "Order" ("storeId", "status");

-- ── Wallet entries ───────────────────────────────────────────────────────────
ALTER TABLE "WalletEntry"
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "status" "WalletEntryStatus" NOT NULL DEFAULT 'CLEARED',
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "clearedAt" TIMESTAMP(3);

UPDATE "WalletEntry" SET "clearedAt" = "createdAt";

-- Existing rows keep their one-per-(order, type) guarantee under the new key.
UPDATE "WalletEntry"
SET "idempotencyKey" = CASE
  WHEN "orderId" IS NOT NULL THEN 'order:' || "orderId" || ':' || "type"::text
  WHEN "payoutId" IS NOT NULL THEN 'payout:' || "payoutId" || ':' || "type"::text
  WHEN "depositId" IS NOT NULL THEN 'deposit:' || "depositId" || ':' || "type"::text
  ELSE 'entry:' || "id"
END;

DROP INDEX IF EXISTS "WalletEntry_orderId_type_key";
CREATE UNIQUE INDEX "WalletEntry_idempotencyKey_key" ON "WalletEntry" ("idempotencyKey");
CREATE INDEX "WalletEntry_storeId_status_idx" ON "WalletEntry" ("storeId", "status");
CREATE INDEX "WalletEntry_orderId_idx" ON "WalletEntry" ("orderId");
CREATE INDEX "WalletEntry_type_createdAt_idx" ON "WalletEntry" ("type", "createdAt");

-- ── Invitation codes ─────────────────────────────────────────────────────────
CREATE TABLE "ReferralCode" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT,
  "note" TEXT,
  "maxUses" INTEGER DEFAULT 1,
  "usedCount" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode" ("code");
CREATE INDEX "ReferralCode_isActive_createdAt_idx" ON "ReferralCode" ("isActive", "createdAt");
CREATE INDEX "ReferralCode_createdAt_idx" ON "ReferralCode" ("createdAt");
ALTER TABLE "ReferralCode" ADD CONSTRAINT "ReferralCode_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ReferralRedemption" (
  "id" TEXT NOT NULL,
  "codeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "storeId" TEXT,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralRedemption_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReferralRedemption_codeId_userId_key" ON "ReferralRedemption" ("codeId", "userId");
CREATE INDEX "ReferralRedemption_userId_idx" ON "ReferralRedemption" ("userId");
CREATE INDEX "ReferralRedemption_storeId_idx" ON "ReferralRedemption" ("storeId");
ALTER TABLE "ReferralRedemption" ADD CONSTRAINT "ReferralRedemption_codeId_fkey"
  FOREIGN KEY ("codeId") REFERENCES "ReferralCode" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferralRedemption" ADD CONSTRAINT "ReferralRedemption_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferralRedemption" ADD CONSTRAINT "ReferralRedemption_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Support conversations ────────────────────────────────────────────────────
ALTER TABLE "ContactMessage"
  ADD COLUMN "userId" TEXT,
  ADD COLUMN "orderId" TEXT,
  ADD COLUMN "assignedToId" TEXT,
  ADD COLUMN "unreadForStaff" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "unreadForCustomer" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "ContactMessage" SET "lastMessageAt" = "updatedAt", "unreadForStaff" = ("status" = 'NEW');
UPDATE "ContactMessage" m SET "userId" = u."id" FROM "User" u WHERE lower(u."email") = lower(m."email") AND u."deletedAt" IS NULL;
UPDATE "ContactMessage" m SET "orderId" = o."id" FROM "Order" o
  WHERE m."orderNumber" IS NOT NULL AND upper(m."orderNumber") = o."number"
    AND (m."storeId" IS NULL OR m."storeId" = o."storeId");

DROP INDEX IF EXISTS "ContactMessage_status_createdAt_idx";
DROP INDEX IF EXISTS "ContactMessage_storeId_createdAt_idx";
CREATE INDEX "ContactMessage_status_lastMessageAt_idx" ON "ContactMessage" ("status", "lastMessageAt");
CREATE INDEX "ContactMessage_storeId_lastMessageAt_idx" ON "ContactMessage" ("storeId", "lastMessageAt");
CREATE INDEX "ContactMessage_userId_lastMessageAt_idx" ON "ContactMessage" ("userId", "lastMessageAt");
CREATE INDEX "ContactMessage_assignedToId_status_idx" ON "ContactMessage" ("assignedToId", "status");
ALTER TABLE "ContactMessage" ADD CONSTRAINT "ContactMessage_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContactMessage" ADD CONSTRAINT "ContactMessage_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContactMessage" ADD CONSTRAINT "ContactMessage_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ContactReply"
  ADD COLUMN "isFromCustomer" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isInternal" BOOLEAN NOT NULL DEFAULT false;
