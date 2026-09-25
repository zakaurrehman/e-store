-- A deleted store keeps a record of who owned it; its ownerId is released so the owner can open another store.
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "formerOwnerId" TEXT;
