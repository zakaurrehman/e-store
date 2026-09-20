"use server";

import { z } from "zod";
import { calculateTotals } from "@/features/checkout/pricing";
import { normaliseCouponCode, validateCoupon } from "@/features/checkout/coupons";
import { deliveryEstimate, getShippingOptions, getTaxRate } from "@/features/checkout/shipping";
import { getCurrentStore } from "@/features/stores/current";
import { isCountryCode } from "@/lib/countries";
import { getCurrentUser } from "@/server/auth/session";
import { isDomainError } from "@/server/errors";
import { getRequestMeta } from "@/server/request";
import { rateLimit, retryAfterMessage } from "@/server/security/rate-limit";
import { addItem, loadCart, removeItem, setCartCoupon, setItemQuantity, toPricingLines } from "./service";
import { ensureCart, getCurrentCartId } from "./session";
import { buildCartSnapshot, EMPTY_CART, type CartSnapshot } from "./snapshot";

export type CartActionResult = { ok: true; cart: CartSnapshot; message?: string } | { ok: false; error: string; cart: CartSnapshot };

/** The cart id for this visitor in the store the request was made on; null on the platform host. */
async function currentCartId(): Promise<string | null> {
  const store = await getCurrentStore();
  return store ? getCurrentCartId(store.id) : null;
}

async function snapshot(cartId: string | null): Promise<CartSnapshot> {
  const user = await getCurrentUser();
  const cart = cartId ? await loadCart(cartId) : null;
  return buildCartSnapshot(cart, { userId: user?.id ?? null, email: user?.email ?? null });
}

async function fail(error: unknown, cartId: string | null): Promise<CartActionResult> {
  const message = isDomainError(error) ? error.message : "We couldn't update your bag. Please try again.";
  if (!isDomainError(error)) console.error("[cart] action failed", error);
  return { ok: false, error: message, cart: cartId ? await snapshot(cartId).catch(() => EMPTY_CART) : EMPTY_CART };
}

const addSchema = z.object({ variantId: z.string().min(1).max(40), quantity: z.number().int().min(1).max(20) });

export async function addToCartAction(input: { variantId: string; quantity: number }): Promise<CartActionResult> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please choose an option first.", cart: await snapshot(await currentCartId()) };
  const store = await getCurrentStore();
  if (!store) return { ok: false, error: "Add products from a store.", cart: EMPTY_CART };
  let cartId: string | null = null;
  try {
    cartId = await ensureCart(store.id);
    const result = await addItem(cartId, parsed.data.variantId, parsed.data.quantity);
    return { ok: true, cart: await snapshot(cartId), message: `${result.name} added to your bag` };
  } catch (error) {
    return fail(error, cartId);
  }
}

const lineSchema = z.object({ itemId: z.string().min(1).max(40), quantity: z.number().int().min(0).max(20) });

export async function updateCartLineAction(input: { itemId: string; quantity: number }): Promise<CartActionResult> {
  const cartId = await currentCartId();
  const parsed = lineSchema.safeParse(input);
  if (!cartId || !parsed.success) return { ok: false, error: "That item is no longer in your bag.", cart: await snapshot(cartId) };
  try {
    await setItemQuantity(cartId, parsed.data.itemId, parsed.data.quantity);
    return { ok: true, cart: await snapshot(cartId) };
  } catch (error) {
    return fail(error, cartId);
  }
}

export async function removeCartLineAction(input: { itemId: string }): Promise<CartActionResult> {
  const cartId = await currentCartId();
  if (!cartId || typeof input?.itemId !== "string") return { ok: false, error: "That item is no longer in your bag.", cart: await snapshot(cartId) };
  try {
    await removeItem(cartId, input.itemId);
    return { ok: true, cart: await snapshot(cartId), message: "Removed from your bag" };
  } catch (error) {
    return fail(error, cartId);
  }
}

export async function applyCouponAction(input: { code: string }): Promise<CartActionResult> {
  const cartId = await currentCartId();
  if (!cartId) return { ok: false, error: "Add something to your bag first.", cart: EMPTY_CART };
  const meta = await getRequestMeta();
  const limit = await rateLimit("coupon", meta.ipAddress);
  if (!limit.success) return { ok: false, error: retryAfterMessage(limit.resetAt), cart: await snapshot(cartId) };
  try {
    const code = normaliseCouponCode(String(input?.code ?? "").slice(0, 40));
    const user = await getCurrentUser();
    const cart = await loadCart(cartId);
    if (!cart || cart.lines.length === 0) return { ok: false, error: "Add something to your bag first.", cart: await snapshot(cartId) };
    const coupon = await validateCoupon(code, { lines: toPricingLines(cart), userId: user?.id ?? null, email: user?.email ?? null, storeId: cart.storeId });
    await setCartCoupon(cartId, coupon.code);
    return { ok: true, cart: await snapshot(cartId), message: `Promo code ${coupon.code} applied` };
  } catch (error) {
    return fail(error, cartId);
  }
}

export async function removeCouponAction(): Promise<CartActionResult> {
  const cartId = await currentCartId();
  if (!cartId) return { ok: true, cart: EMPTY_CART };
  await setCartCoupon(cartId, null);
  return { ok: true, cart: await snapshot(cartId), message: "Promo code removed" };
}

export async function getCartAction(): Promise<CartSnapshot> {
  return snapshot(await currentCartId());
}

export type ShippingEstimate = {
  options: Array<{ id: string; name: string; estimate: string; priceCents: number; isFree: boolean }>;
  taxCents: number;
  taxRateLabel: string | null;
};

const estimateSchema = z.object({ country: z.string().length(2), region: z.string().max(40).optional() });

export async function estimateShippingAction(input: { country: string; region?: string }): Promise<{ ok: true; estimate: ShippingEstimate } | { ok: false; error: string }> {
  const parsed = estimateSchema.safeParse(input);
  if (!parsed.success || !isCountryCode(parsed.data.country)) return { ok: false, error: "Choose a destination country." };
  const cartId = await currentCartId();
  const cart = cartId ? await loadCart(cartId) : null;
  if (!cart) return { ok: false, error: "Your bag is empty." };
  const user = await getCurrentUser();
  const lines = toPricingLines(cart);
  let coupon = null;
  if (cart.couponCode) coupon = await validateCoupon(cart.couponCode, { lines, userId: user?.id ?? null, email: user?.email ?? null, storeId: cart.storeId }).catch(() => null);
  const [options, taxRate] = await Promise.all([getShippingOptions(parsed.data.country), getTaxRate(parsed.data.country, parsed.data.region)]);
  if (options.length === 0) return { ok: false, error: "We don't ship to that destination yet." };
  const priced = options.map((option) => {
    const totals = calculateTotals({ lines, coupon, shipping: option });
    return { id: option.id, name: option.name, estimate: deliveryEstimate(option), priceCents: totals.shippingCents, isFree: totals.shippingCents === 0 };
  });
  const cheapest = options[0];
  const totals = calculateTotals({ lines, coupon, shipping: cheapest, tax: taxRate });
  return {
    ok: true,
    estimate: {
      options: priced,
      taxCents: totals.taxCents,
      taxRateLabel: taxRate ? `${taxRate.name} (${(taxRate.rateBps / 100).toFixed(2).replace(/\.?0+$/, "")}%)` : null,
    },
  };
}
