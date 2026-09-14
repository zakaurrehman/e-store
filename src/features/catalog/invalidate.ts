import { revalidateTag } from "next/cache";
import { db } from "@/server/db";
import { CATALOG_TAG, productTag } from "./queries";

/**
 * Marks storefront catalogue caches stale after stock or sales change outside the admin
 * (orders, payments, cancellations, expiry). Works from server actions, route handlers and the cron route;
 * uses stale-while-revalidate because these paths also run from webhooks where updateTag is unavailable.
 */
export async function invalidateProducts(productIds: Array<string | null | undefined>) {
  const ids = [...new Set(productIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return;
  const products = await db.product.findMany({ where: { id: { in: ids } }, select: { slug: true } });
  try {
    revalidateTag(CATALOG_TAG, "max");
    for (const product of products) revalidateTag(productTag(product.slug), "max");
  } catch (error) {
    // CLI scripts (npm run jobs:run, importer) run outside Next.js and have no cache to invalidate.
    if (!(error instanceof Error && error.message.includes("static generation store missing"))) throw error;
  }
}
