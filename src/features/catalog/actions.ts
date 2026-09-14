"use server";

import { z } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getProductCardsByIds, type ProductCardData } from "./queries";

const idsSchema = z.array(z.string().min(1).max(40)).max(24);

/** Card data for recently viewed products (ids come from the browser). */
export async function getProductCardsAction(ids: string[]): Promise<ProductCardData[]> {
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return [];
  return getProductCardsByIds(parsed.data);
}

/** Persists recently viewed products for signed-in customers (shown in their account on every device). */
export async function trackProductViewAction(productId: string) {
  if (typeof productId !== "string" || productId.length > 40) return;
  const user = await getCurrentUser();
  if (!user) return;
  await db.recentlyViewed
    .upsert({
      where: { userId_productId: { userId: user.id, productId } },
      create: { userId: user.id, productId },
      update: { viewedAt: new Date() },
    })
    .catch(() => undefined);
}
