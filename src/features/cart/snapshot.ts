import { calculateTotals } from "@/features/checkout/pricing";
import { validateCoupon } from "@/features/checkout/coupons";
import { getShippingOptions } from "@/features/checkout/shipping";
import { isDomainError } from "@/server/errors";
import { setCartCoupon, toPricingLines, type CartView } from "./service";
import { EMPTY_CART, type CartSnapshot } from "./types";

export { EMPTY_CART, type CartSnapshot };

/** Cart + coupon + pre-shipping totals. Invalid coupons are removed from the cart and reported. */
export async function buildCartSnapshot(cart: CartView | null, customer: { userId: string | null; email: string | null }, defaultCountry = "US"): Promise<CartSnapshot> {
  const standard = (await getShippingOptions(defaultCountry)).find((option) => option.freeOverCents !== null);
  if (!cart) return { ...EMPTY_CART, freeShippingThresholdCents: standard?.freeOverCents ?? null };

  const lines = toPricingLines(cart);
  let couponError: string | null = null;
  let coupon: Awaited<ReturnType<typeof validateCoupon>> | null = null;
  if (cart.couponCode) {
    try {
      coupon = await validateCoupon(cart.couponCode, { lines, userId: customer.userId, email: customer.email, storeId: cart.storeId });
    } catch (error) {
      if (!isDomainError(error)) throw error;
      couponError = error.message;
      // Keep the code while the bag is empty-ish (min spend) so it re-applies once eligible; drop hard failures.
      if (error.code !== "COUPON_MIN_SUBTOTAL" && error.code !== "COUPON_NOT_ELIGIBLE") await setCartCoupon(cart.id, null);
    }
  }
  const totals = calculateTotals({ lines, coupon });
  return {
    id: cart.id,
    lines: cart.lines,
    itemCount: cart.itemCount,
    subtotalCents: totals.subtotalCents,
    discountCents: totals.discountCents,
    estimatedTotalCents: totals.totalCents,
    couponCode: coupon?.code ?? (couponError ? cart.couponCode : null),
    couponDescription: coupon?.description ?? null,
    couponError,
    freeShippingThresholdCents: standard?.freeOverCents ?? null,
    hasUnavailableItems: cart.hasUnavailableItems,
  };
}
