-- A support conversation can be about a deposit or a withdrawal, so staff see the money beside the question.
ALTER TABLE "ContactMessage"
  ADD COLUMN "depositId" TEXT,
  ADD COLUMN "payoutId" TEXT;

CREATE INDEX "ContactMessage_depositId_idx" ON "ContactMessage" ("depositId");
CREATE INDEX "ContactMessage_payoutId_idx" ON "ContactMessage" ("payoutId");

ALTER TABLE "ContactMessage" ADD CONSTRAINT "ContactMessage_depositId_fkey"
  FOREIGN KEY ("depositId") REFERENCES "Deposit" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContactMessage" ADD CONSTRAINT "ContactMessage_payoutId_fkey"
  FOREIGN KEY ("payoutId") REFERENCES "Payout" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
