import { ProductStatus, StoreStatus } from "@/generated/prisma/enums";
import { DEMO_STORE_SLUG } from "@/lib/tenancy";
import { db } from "@/server/db";

export const PLATFORM_STORE_SLUG = DEMO_STORE_SLUG;

/**
 * The platform-run demo store (no owner): shows visitors what a store looks like and serves demo QA orders.
 * Created once with every active catalogue product; after that the admin decides what it sells.
 */
export async function seedPlatformStore() {
  const settings = await db.setting.findUnique({ where: { key: "store" } });
  const value = (settings?.value ?? {}) as { name?: string; tagline?: string };
  let store = await db.store.findFirst({ where: { ownerId: null, deletedAt: null }, orderBy: { createdAt: "asc" } });
  // On a fresh database the stores migration runs before settings exist and names the store "Demo store".
  if (store && store.name === "Demo store" && value.name) store = await db.store.update({ where: { id: store.id }, data: { name: value.name, tagline: store.tagline ?? value.tagline ?? null } });
  if (!store) {
    store = await db.store.create({
      data: { slug: PLATFORM_STORE_SLUG, name: value.name ?? "Zendropship demo store", tagline: value.tagline ?? null, status: StoreStatus.ACTIVE },
    });
  }
  if ((await db.storeProduct.count({ where: { storeId: store.id } })) === 0) {
    const products = await db.product.findMany({ where: { status: ProductStatus.ACTIVE, deletedAt: null }, select: { id: true }, orderBy: { createdAt: "asc" } });
    await db.storeProduct.createMany({ data: products.map((product, index) => ({ storeId: store.id, productId: product.id, position: index + 1 })), skipDuplicates: true });
    console.log(`✓ stores: platform store "${store.slug}" stocked with ${products.length} products`);
  } else {
    console.log(`✓ stores: platform store "${store.slug}" already set up`);
  }
  return store;
}
