-- Multi-store platform: stores (tenants) with their own product selection, pricing and orders.
-- Existing orders and carts belong to the platform-owned "demo" store created below.

-- CreateEnum
CREATE TYPE "StoreStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "StorePricingMode" AS ENUM ('SUGGESTED', 'MARKUP');

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT,
    "status" "StoreStatus" NOT NULL DEFAULT 'ACTIVE',
    "pricingMode" "StorePricingMode" NOT NULL DEFAULT 'SUGGESTED',
    "markupBps" INTEGER NOT NULL DEFAULT 4000,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "tagline" TEXT,
    "aboutText" TEXT,
    "supportEmail" TEXT,
    "announcement" TEXT,
    "logoId" TEXT,
    "heroImageId" TEXT,
    "heroTitle" TEXT,
    "heroSubtitle" TEXT,
    "accentColor" TEXT NOT NULL DEFAULT '#5446ff',
    "customDomain" TEXT,
    "stripeAccountId" TEXT,
    "stripeOnboardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreProduct" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "markupBps" INTEGER,
    "fixedPriceCents" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreProduct_pkey" PRIMARY KEY ("id")
);

-- The showcase store keeps everything the single-store site had. Platform-owned (no owner).
INSERT INTO "Store" ("id", "slug", "name", "status", "pricingMode", "tagline", "updatedAt")
SELECT
    'store_demo',
    'demo',
    COALESCE((SELECT "value"->>'name' FROM "Setting" WHERE "key" = 'store'), 'Demo store'),
    'ACTIVE',
    'SUGGESTED',
    (SELECT "value"->>'tagline' FROM "Setting" WHERE "key" = 'store'),
    CURRENT_TIMESTAMP;

-- Every existing product is listed in the demo store at the supplier's suggested price.
INSERT INTO "StoreProduct" ("id", "storeId", "productId", "isActive", "position", "updatedAt")
SELECT 'sp_demo_' || "id", 'store_demo', "id", "status" = 'ACTIVE', 0, CURRENT_TIMESTAMP
FROM "Product"
WHERE "deletedAt" IS NULL;

-- Wholesale cost is now required for pricing. Variants imported without one get a placeholder
-- (55% of their selling price) that a supplier feed or the admin can overwrite.
UPDATE "ProductVariant"
SET "costCents" = ROUND(COALESCE("salePriceCents", "priceCents") * 0.55)
WHERE "costCents" IS NULL;

-- AlterTable: carts and orders belong to a store (existing rows → demo store)
ALTER TABLE "Cart" ADD COLUMN     "storeId" TEXT;
UPDATE "Cart" SET "storeId" = 'store_demo' WHERE "storeId" IS NULL;
ALTER TABLE "Cart" ALTER COLUMN   "storeId" SET NOT NULL;

ALTER TABLE "Order" ADD COLUMN    "storeId" TEXT;
UPDATE "Order" SET "storeId" = 'store_demo' WHERE "storeId" IS NULL;
ALTER TABLE "Order" ALTER COLUMN  "storeId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "storeId" TEXT;

-- AlterTable: order lines snapshot the wholesale cost charged to the store owner
ALTER TABLE "OrderItem" ADD COLUMN     "unitCostCents" INTEGER NOT NULL DEFAULT 0;
UPDATE "OrderItem" oi
SET "unitCostCents" = COALESCE((SELECT v."costCents" FROM "ProductVariant" v WHERE v."id" = oi."variantId"), 0);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "registeredStoreId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Store_slug_key" ON "Store"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Store_ownerId_key" ON "Store"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Store_customDomain_key" ON "Store"("customDomain");

-- CreateIndex
CREATE UNIQUE INDEX "Store_stripeAccountId_key" ON "Store"("stripeAccountId");

-- CreateIndex
CREATE INDEX "Store_status_idx" ON "Store"("status");

-- CreateIndex
CREATE INDEX "Store_createdAt_idx" ON "Store"("createdAt");

-- CreateIndex
CREATE INDEX "StoreProduct_productId_idx" ON "StoreProduct"("productId");

-- CreateIndex
CREATE INDEX "StoreProduct_storeId_isActive_position_idx" ON "StoreProduct"("storeId", "isActive", "position");

-- CreateIndex
CREATE UNIQUE INDEX "StoreProduct_storeId_productId_key" ON "StoreProduct"("storeId", "productId");

-- CreateIndex
CREATE INDEX "Cart_storeId_idx" ON "Cart"("storeId");

-- One cart per customer per store (was one per customer)
DROP INDEX "Cart_userId_key";
CREATE UNIQUE INDEX "Cart_userId_storeId_key" ON "Cart"("userId", "storeId");

-- CreateIndex
CREATE INDEX "Coupon_storeId_idx" ON "Coupon"("storeId");

-- CreateIndex
CREATE INDEX "Order_storeId_createdAt_idx" ON "Order"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "User_registeredStoreId_idx" ON "User"("registeredStoreId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_registeredStoreId_fkey" FOREIGN KEY ("registeredStoreId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_logoId_fkey" FOREIGN KEY ("logoId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_heroImageId_fkey" FOREIGN KEY ("heroImageId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreProduct" ADD CONSTRAINT "StoreProduct_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreProduct" ADD CONSTRAINT "StoreProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Store owners and the permissions to oversee their stores. The seed keeps these in sync afterwards; they are
-- created here so a deployed database works before the seed is re-run.
INSERT INTO "Role" ("id", "key", "name", "description", "rank", "isSystem", "isStaff", "createdAt", "updatedAt")
VALUES ('role_store_owner', 'STORE_OWNER', 'Store owner', 'Runs their own Zendropship store from the owner dashboard', 10, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Permission" ("id", "key", "group", "description")
VALUES ('perm_stores_view', 'stores.view', 'Stores', 'View owners'' stores, their products and sales'),
       ('perm_stores_manage', 'stores.manage', 'Stores', 'Suspend and reopen stores')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r CROSS JOIN "Permission" p
WHERE r."key" IN ('SUPER_ADMIN', 'ADMIN') AND p."key" IN ('stores.view', 'stores.manage')
ON CONFLICT DO NOTHING;
