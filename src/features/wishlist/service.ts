import { ProductStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";

export async function getWishlistProductIds(userId: string) {
  const items = await db.wishlistItem.findMany({
    where: { wishlist: { userId } },
    orderBy: { createdAt: "desc" },
    select: { productId: true },
  });
  return items.map((item) => item.productId);
}

/** Adds or removes a product. Returns whether it is now in the wishlist. */
export async function toggleWishlist(userId: string, productId: string, desired?: boolean) {
  const product = await db.product.findFirst({ where: { id: productId, status: ProductStatus.ACTIVE, deletedAt: null }, select: { id: true } });
  if (!product) throw new NotFoundError("This product is no longer available.");
  const wishlist = await db.wishlist.upsert({ where: { userId }, create: { userId }, update: {} });
  const existing = await db.wishlistItem.findUnique({ where: { wishlistId_productId: { wishlistId: wishlist.id, productId } } });
  const shouldExist = desired ?? !existing;
  if (shouldExist && !existing) {
    await db.wishlistItem.create({ data: { wishlistId: wishlist.id, productId } });
  } else if (!shouldExist && existing) {
    await db.wishlistItem.delete({ where: { id: existing.id } });
  }
  return shouldExist;
}
