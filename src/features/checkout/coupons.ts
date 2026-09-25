import { OrderStatus, PaymentStatus } from "@/generated/prisma/enums";
import { db, type DbClient } from "@/server/db";
import { DomainError } from "@/server/errors";
import { formatMoney } from "@/utils/money";
import { isLineEligible, type PricingCoupon, type PricingLine } from "./pricing";

export class CouponError extends DomainError {}

export function normaliseCouponCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Validates a coupon for a cart and customer. Throws CouponError with a customer-friendly message.
 * Usage limits are re-checked atomically when the order is placed (see orders/service.ts).
 */
export async function validateCoupon(
  rawCode: string,
  /** storeId: the store the bag belongs to. Omitted only by callers outside a store (none today). */
  context: { lines: PricingLine[]; userId: string | null; email: string | null; currency?: string; storeId?: string },
  client: DbClient = db,
): Promise<PricingCoupon & { id: string; description: string | null }> {
  const code = normaliseCouponCode(rawCode);
  if (!code) throw new CouponError("COUPON_INVALID", "Enter a promo code.");
  const coupon = await client.coupon.findUnique({
    where: { code },
    include: {
      products: { select: { productId: true } },
      categories: { select: { categoryId: true } },
      customers: { select: { userId: true } },
    },
  });
  if (!coupon || coupon.deletedAt || !coupon.isActive) throw new CouponError("COUPON_INVALID", "That promo code isn't valid.");
  // A coupon belongs to one store; platform coupons (no store) work only in the platform's own stores, so they
  // never reduce an owner's margin without the owner's say.
  if (context.storeId) {
    const valid = coupon.storeId
      ? coupon.storeId === context.storeId
      : !!(await client.store.findFirst({ where: { id: context.storeId, ownerId: null, deletedAt: null }, select: { id: true } }));
    if (!valid) throw new CouponError("COUPON_INVALID", "That promo code isn't valid.");
  }

  const now = Date.now();
  if (coupon.startsAt && coupon.startsAt.getTime() > now) throw new CouponError("COUPON_NOT_STARTED", "That promo code isn't active yet.");
  if (coupon.endsAt && coupon.endsAt.getTime() < now) throw new CouponError("COUPON_EXPIRED", "That promo code has expired.");
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    throw new CouponError("COUPON_USAGE_LIMIT", "That promo code has reached its usage limit.");
  }

  if (coupon.customers.length > 0) {
    if (!context.userId) throw new CouponError("COUPON_SIGN_IN", "Sign in to use this promo code.");
    if (!coupon.customers.some((entry) => entry.userId === context.userId)) {
      throw new CouponError("COUPON_CUSTOMER", "That promo code isn't available for your account.");
    }
  }

  const identity = [
    ...(context.userId ? [{ userId: context.userId }] : []),
    ...(context.email ? [{ email: context.email.toLowerCase() }] : []),
  ];

  if (coupon.usageLimitPerCustomer !== null && identity.length > 0) {
    const used = await client.couponRedemption.count({ where: { couponId: coupon.id, OR: identity } });
    if (used >= coupon.usageLimitPerCustomer) throw new CouponError("COUPON_CUSTOMER_LIMIT", "You've already used this promo code.");
  }

  if (coupon.firstOrderOnly) {
    if (identity.length === 0) throw new CouponError("COUPON_FIRST_ORDER", "Enter your email to use this first-order code.");
    const previous = await client.order.count({
      where: {
        OR: identity,
        status: { not: OrderStatus.CANCELLED },
        paymentStatus: { in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.AUTHORIZED] },
      },
    });
    if (previous > 0) throw new CouponError("COUPON_FIRST_ORDER", "This promo code is only valid on your first order.");
  }

  const pricingCoupon: PricingCoupon = {
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    scope: coupon.scope,
    maxDiscountCents: coupon.maxDiscountCents,
    productIds: coupon.products.map((entry) => entry.productId),
    categoryIds: coupon.categories.map((entry) => entry.categoryId),
  };

  const subtotal = context.lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
  if (coupon.minSubtotalCents !== null && subtotal < coupon.minSubtotalCents) {
    throw new CouponError(
      "COUPON_MIN_SUBTOTAL",
      `Spend ${formatMoney(coupon.minSubtotalCents - subtotal, context.currency)} more to use this promo code (minimum ${formatMoney(coupon.minSubtotalCents, context.currency)}).`,
    );
  }
  if (!context.lines.some((line) => isLineEligible(line, pricingCoupon))) {
    throw new CouponError("COUPON_NOT_ELIGIBLE", "That promo code doesn't apply to the items in your bag.");
  }

  return { ...pricingCoupon, id: coupon.id, description: coupon.description };
}
