"use server";

import { z } from "zod";
import { getCurrentUser } from "@/server/auth/session";
import { isDomainError } from "@/server/errors";
import { toggleWishlist } from "./service";

export type WishlistActionResult =
  | { ok: true; inWishlist: boolean }
  | { ok: false; requiresAuth: boolean; error: string };

const schema = z.object({ productId: z.string().min(1).max(40), desired: z.boolean().optional() });

export async function toggleWishlistAction(input: { productId: string; desired?: boolean }): Promise<WishlistActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, requiresAuth: true, error: "Sign in to save favourites." };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, requiresAuth: false, error: "Something went wrong." };
  try {
    const inWishlist = await toggleWishlist(user.id, parsed.data.productId, parsed.data.desired);
    return { ok: true, inWishlist };
  } catch (error) {
    if (!isDomainError(error)) console.error("[wishlist] toggle failed", error);
    return { ok: false, requiresAuth: false, error: isDomainError(error) ? error.message : "We couldn't update your wishlist." };
  }
}
