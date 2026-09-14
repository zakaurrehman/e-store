import "server-only";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/server/auth/session";
import { createGuestCart, findGuestCart, GUEST_CART_TTL_MS, getOrCreateUserCart, loadCart, mergeGuestCartIntoUser } from "./service";

const isProduction = process.env.NODE_ENV === "production";
export const CART_COOKIE = isProduction ? "__Host-veyora_cart" : "veyora_cart";

/** Read-only: the current visitor's cart id, without creating one. Safe during rendering. */
export async function getCurrentCartId(): Promise<string | null> {
  const user = await getCurrentUser();
  const jar = await cookies();
  if (user) {
    const { db } = await import("@/server/db");
    const cart = await db.cart.findUnique({ where: { userId: user.id }, select: { id: true } });
    return cart?.id ?? null;
  }
  const guest = await findGuestCart(jar.get(CART_COOKIE)?.value);
  return guest?.id ?? null;
}

export async function getCurrentCart() {
  const cartId = await getCurrentCartId();
  return cartId ? loadCart(cartId) : null;
}

/** Actions only (sets cookies): returns the visitor's cart, creating it on first use. */
export async function ensureCart(): Promise<string> {
  const user = await getCurrentUser();
  if (user) return (await getOrCreateUserCart(user.id)).id;
  const jar = await cookies();
  const existing = await findGuestCart(jar.get(CART_COOKIE)?.value);
  if (existing) return existing.id;
  const { cart, token } = await createGuestCart();
  jar.set(CART_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + GUEST_CART_TTL_MS),
  });
  return cart.id;
}

/** Called right after sign-in / registration. */
export async function mergeGuestCartAfterLogin(userId: string) {
  const jar = await cookies();
  const guest = await findGuestCart(jar.get(CART_COOKIE)?.value);
  if (guest) await mergeGuestCartIntoUser(guest.id, userId);
  jar.delete(CART_COOKIE);
}

export async function forgetGuestCartCookie() {
  (await cookies()).delete(CART_COOKIE);
}
