-- Customer service per store: contact messages belong to the store they were sent to, and replies are kept
-- as the conversation history so owners and staff can see what the customer was told.
ALTER TABLE "ContactMessage" ADD COLUMN "storeId" TEXT;

-- Messages received before stores existed were sent to the platform's own storefront.
UPDATE "ContactMessage"
SET "storeId" = (SELECT "id" FROM "Store" WHERE "ownerId" IS NULL AND "deletedAt" IS NULL ORDER BY "createdAt" ASC LIMIT 1)
WHERE "storeId" IS NULL;

CREATE INDEX "ContactMessage_storeId_createdAt_idx" ON "ContactMessage"("storeId", "createdAt");

ALTER TABLE "ContactMessage" ADD CONSTRAINT "ContactMessage_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ContactReply" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactReply_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContactReply_messageId_createdAt_idx" ON "ContactReply"("messageId", "createdAt");

ALTER TABLE "ContactReply" ADD CONSTRAINT "ContactReply_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "ContactMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContactReply" ADD CONSTRAINT "ContactReply_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
