import "server-only";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/server/auth/session";
import { createGuestCart, findGuestCart, GUEST_CART_TTL_MS, getOrCreateUserCart, loadCart, mergeGuestCartIntoUser } from "./service";

const isProduction = process.env.NODE_ENV === "production";
export const CART_COOKIE = isProduction ? "__Host-zendropship_cart" : "zendropship_cart";

/**
 * Carts belong to a store. Cookies are scoped to the store's host, so a shopper naturally has one bag per store;
 * the store id is still checked on every read so a cookie can never reach another store's cart.
 */

/** Read-only: the current visitor's cart id in this store, without creating one. Safe during rendering. */
export async function getCurrentCartId(storeId: string): Promise<string | null> {
  const user = await getCurrentUser();
  const jar = await cookies();
  if (user) {
    const { db } = await import("@/server/db");
    const cart = await db.cart.findUnique({ where: { userId_storeId: { userId: user.id, storeId } }, select: { id: true } });
    return cart?.id ?? null;
  }
  const guest = await findGuestCart(jar.get(CART_COOKIE)?.value, storeId);
  return guest?.id ?? null;
}

export async function getCurrentCart(storeId: string) {
  const cartId = await getCurrentCartId(storeId);
  return cartId ? loadCart(cartId) : null;
}

/** Actions only (sets cookies): returns the visitor's cart in this store, creating it on first use. */
export async function ensureCart(storeId: string): Promise<string> {
  const user = await getCurrentUser();
  if (user) return (await getOrCreateUserCart(user.id, storeId)).id;
  const jar = await cookies();
  const existing = await findGuestCart(jar.get(CART_COOKIE)?.value, storeId);
  if (existing) return existing.id;
  const { cart, token } = await createGuestCart(storeId);
  jar.set(CART_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + GUEST_CART_TTL_MS),
  });
  return cart.id;
}

/** Called right after sign-in / registration on a store. */
export async function mergeGuestCartAfterLogin(userId: string, storeId: string) {
  const jar = await cookies();
  const guest = await findGuestCart(jar.get(CART_COOKIE)?.value, storeId);
  if (guest) await mergeGuestCartIntoUser(guest.id, userId);
  jar.delete(CART_COOKIE);
}

export async function forgetGuestCartCookie() {
  (await cookies()).delete(CART_COOKIE);
}
