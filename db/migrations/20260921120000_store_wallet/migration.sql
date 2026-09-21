-- Store wallet: an append-only ledger of what Zendropship owes each owner, plus the withdrawals and
-- deposits that settle it. The balance is always the sum of the ledger; nothing writes a balance directly.
CREATE TYPE "WalletEntryType" AS ENUM ('ORDER_EARNING', 'ORDER_REVERSAL', 'PAYOUT', 'PAYOUT_REVERSAL', 'DEPOSIT', 'ADJUSTMENT');
CREATE TYPE "PayoutStatus" AS ENUM ('REQUESTED', 'PAID', 'REJECTED');
CREATE TYPE "PayoutMethod" AS ENUM ('BANK_TRANSFER', 'PAYPAL');
CREATE TYPE "DepositStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'REQUESTED',
    "method" "PayoutMethod" NOT NULL,
    "destination" TEXT NOT NULL,
    "note" TEXT,
    "reference" TEXT,
    "requestedById" TEXT,
    "processedById" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "DepositStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WalletEntry" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" "WalletEntryType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "orderId" TEXT,
    "payoutId" TEXT,
    "depositId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Payout_storeId_createdAt_idx" ON "Payout"("storeId", "createdAt");
CREATE INDEX "Payout_status_createdAt_idx" ON "Payout"("status", "createdAt");
CREATE INDEX "Deposit_storeId_createdAt_idx" ON "Deposit"("storeId", "createdAt");
CREATE INDEX "Deposit_status_createdAt_idx" ON "Deposit"("status", "createdAt");
CREATE INDEX "WalletEntry_storeId_createdAt_idx" ON "WalletEntry"("storeId", "createdAt");
-- One earning and one reversal per order, so a replayed payment event cannot credit twice
CREATE UNIQUE INDEX "WalletEntry_orderId_type_key" ON "WalletEntry"("orderId", "type");

ALTER TABLE "Payout" ADD CONSTRAINT "Payout_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "Deposit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Earnings already made before the wallet existed: credit every order whose money has been collected
-- (card and other online payments once paid; cash on delivery once the parcel was delivered).
INSERT INTO "WalletEntry" ("id", "storeId", "type", "amountCents", "description", "orderId", "createdAt")
SELECT
    'we_' || o."id",
    o."storeId",
    'ORDER_EARNING',
    GREATEST(
        0,
        COALESCE((SELECT SUM((i."unitPriceCents" - i."unitCostCents") * i."quantity") FROM "OrderItem" i WHERE i."orderId" = o."id"), 0) - o."discountCents"
    ),
    'Earnings from order ' || o."number",
    o."id",
    COALESCE(o."paidAt", o."deliveredAt", o."placedAt")
FROM "Order" o
JOIN "Store" s ON s."id" = o."storeId"
WHERE s."ownerId" IS NOT NULL
  AND o."status" <> 'CANCELLED'
  AND (o."paymentStatus" IN ('PAID', 'PARTIALLY_REFUNDED') OR (o."paymentProvider" = 'cod' AND o."status" = 'DELIVERED'));
