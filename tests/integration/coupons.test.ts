import { describe, expect, it } from "vitest";
import { loadCart, setCartCoupon, toPricingLines } from "@/features/cart/service";
import { validateCoupon } from "@/features/checkout/coupons";
import { placeOrder } from "@/features/orders/service";
import { CouponScope, DiscountType } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { createProduct, guestCartWith, orderContext, orderInput } from "./helpers";

async function cartLines(priceCents = 10_000, quantity = 1) {
  const { variant } = await createProduct({ priceCents, stock: 20 });
  const cart = await guestCartWith([{ variantId: variant.id, quantity }]);
  const view = await loadCart(cart.id);
  return { cart, lines: toPricingLines(view!) };
}

let sequence = 0;
const createCoupon = (data: Partial<Parameters<typeof db.coupon.create>[0]["data"]> = {}) =>
  db.coupon.create({ data: { code: `TEST${++sequence}`, type: DiscountType.PERCENTAGE, value: 10, scope: CouponScope.ORDER, ...data } });

describe("coupons", () => {
  it("accepts a valid percentage coupon regardless of the case the customer types", async () => {
    const coupon = await createCoupon();
    const { lines } = await cartLines();
    const validated = await validateCoupon(`  ${coupon.code.toLowerCase()} `, { lines, userId: null, email: null });
    expect(validated.id).toBe(coupon.id);
  });

  it.each([
    ["inactive", { isActive: false }, "COUPON_INVALID"],
    ["expired", { endsAt: new Date(Date.now() - 60_000) }, "COUPON_EXPIRED"],
    ["not yet started", { startsAt: new Date(Date.now() + 86_400_000) }, "COUPON_NOT_STARTED"],
    ["used up", { usageLimit: 2, usedCount: 2 }, "COUPON_USAGE_LIMIT"],
  ] as const)("rejects a coupon that is %s", async (_label, data, code) => {
    const coupon = await createCoupon(data);
    const { lines } = await cartLines();
    await expect(validateCoupon(coupon.code, { lines, userId: null, email: null })).rejects.toMatchObject({ code });
  });

  it("rejects unknown codes and orders below the minimum subtotal", async () => {
    const { lines } = await cartLines(2_000);
    await expect(validateCoupon("NOPE-NOT-REAL", { lines, userId: null, email: null })).rejects.toMatchObject({ code: "COUPON_INVALID" });
    const minimum = await createCoupon({ minSubtotalCents: 5_000 });
    await expect(validateCoupon(minimum.code, { lines, userId: null, email: null })).rejects.toThrow();
  });

  it("requires sign-in for customer-restricted coupons", async () => {
    const role = await db.role.findUniqueOrThrow({ where: { key: "CUSTOMER" } });
    const user = await db.user.create({ data: { email: `vip.${sequence}@example.com`, firstName: "Vip", lastName: "Customer", roleId: role.id } });
    const coupon = await createCoupon({ customers: { create: { userId: user.id } } });
    const { lines } = await cartLines();
    await expect(validateCoupon(coupon.code, { lines, userId: null, email: null })).rejects.toMatchObject({ code: "COUPON_SIGN_IN" });
    await expect(validateCoupon(coupon.code, { lines, userId: user.id, email: user.email })).resolves.toMatchObject({ id: coupon.id });
  });

  it("counts usage when an order is placed and enforces the limit on the next order", async () => {
    const coupon = await createCoupon({ usageLimit: 1 });

    const first = await cartLines();
    await setCartCoupon(first.cart.id, coupon.code);
    await placeOrder(await orderInput({ paymentProvider: "cod" }), orderContext(first.cart.id));
    expect((await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usedCount).toBe(1);

    const second = await cartLines();
    await expect(validateCoupon(coupon.code, { lines: second.lines, userId: null, email: null })).rejects.toMatchObject({ code: "COUPON_USAGE_LIMIT" });
  });
});
