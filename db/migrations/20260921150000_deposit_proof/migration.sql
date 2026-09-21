-- Owners can say how they sent a deposit (bank transfer or crypto) and attach proof, which staff check
-- before crediting anything. Existing deposits were bank transfers.
CREATE TYPE "DepositMethod" AS ENUM ('BANK_TRANSFER', 'CRYPTO');

ALTER TABLE "Deposit" ADD COLUMN "method" "DepositMethod" NOT NULL DEFAULT 'BANK_TRANSFER';
ALTER TABLE "Deposit" ADD COLUMN "network" TEXT;
ALTER TABLE "Deposit" ADD COLUMN "proofMediaId" TEXT;

ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_proofMediaId_fkey"
  FOREIGN KEY ("proofMediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
