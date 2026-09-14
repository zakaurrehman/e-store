import { describe, expect, it } from "vitest";
import { allocate, calculateCouponDiscount, calculateTotals, type PricingCoupon, type PricingLine } from "@/features/checkout/pricing";

const line = (overrides: Partial<PricingLine> = {}): PricingLine => ({
  key: "v1",
  productId: "p1",
  categoryIds: ["c1"],
  unitPriceCents: 5000,
  quantity: 1,
  ...overrides,
});

const coupon = (overrides: Partial<PricingCoupon> = {}): PricingCoupon => ({
  code: "SAVE",
  type: "PERCENTAGE",
  value: 10,
  scope: "ORDER",
  maxDiscountCents: null,
  productIds: [],
  categoryIds: [],
  ...overrides,
});

describe("allocate", () => {
  it("distributes exactly the requested amount", () => {
    const parts = allocate(100, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(parts).toEqual([34, 33, 33]);
  });

  it("returns zeros when there is nothing to allocate", () => {
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
    expect(allocate(10, [0, 0])).toEqual([0, 0]);
  });
});

describe("calculateTotals", () => {
  it("sums subtotal without discounts, shipping or tax", () => {
    const result = calculateTotals({ lines: [line({ quantity: 2 }), line({ key: "v2", unitPriceCents: 1999 })] });
    expect(result.subtotalCents).toBe(11999);
    expect(result.totalCents).toBe(11999);
    expect(result.discountCents).toBe(0);
  });

  it("applies a percentage coupon to the whole order", () => {
    const result = calculateTotals({ lines: [line({ unitPriceCents: 12345 })], coupon: coupon({ value: 20 }) });
    expect(result.discountCents).toBe(2469);
    expect(result.totalCents).toBe(9876);
    expect(result.couponApplied).toBe(true);
  });

  it("caps percentage discounts at maxDiscountCents", () => {
    const result = calculateTotals({ lines: [line({ unitPriceCents: 100000 })], coupon: coupon({ value: 50, maxDiscountCents: 5000 }) });
    expect(result.discountCents).toBe(5000);
  });

  it("never discounts more than the eligible subtotal for fixed coupons", () => {
    const result = calculateTotals({ lines: [line({ unitPriceCents: 1500 })], coupon: coupon({ type: "FIXED_AMOUNT", value: 5000 }) });
    expect(result.discountCents).toBe(1500);
    expect(result.totalCents).toBe(0);
  });

  it("only discounts eligible lines for category-scoped coupons", () => {
    const lines = [line({ key: "a", categoryIds: ["shoes"], unitPriceCents: 10000 }), line({ key: "b", productId: "p2", categoryIds: ["bags"], unitPriceCents: 10000 })];
    const result = calculateTotals({ lines, coupon: coupon({ scope: "CATEGORIES", categoryIds: ["shoes"], value: 10 }) });
    expect(result.discountCents).toBe(1000);
    expect(result.lines[0].discountCents).toBe(1000);
    expect(result.lines[1].discountCents).toBe(0);
  });

  it("only discounts listed products for product-scoped coupons", () => {
    const { discount } = calculateCouponDiscount([line({ productId: "x", unitPriceCents: 4000 }), line({ productId: "y", unitPriceCents: 6000 })], coupon({ scope: "PRODUCTS", productIds: ["y"], value: 50 }));
    expect(discount).toBe(3000);
  });

  it("makes shipping free when the discounted subtotal reaches the threshold", () => {
    const shipping = { priceCents: 695, freeOverCents: 15000 };
    expect(calculateTotals({ lines: [line({ unitPriceCents: 15000 })], shipping }).shippingCents).toBe(0);
    // A coupon that takes the subtotal below the threshold re-introduces the shipping fee.
    const discounted = calculateTotals({ lines: [line({ unitPriceCents: 15000 })], shipping, coupon: coupon({ value: 10 }) });
    expect(discounted.shippingCents).toBe(695);
  });

  it("applies free-shipping coupons without changing merchandise totals", () => {
    const result = calculateTotals({ lines: [line()], shipping: { priceCents: 1495, freeOverCents: null }, coupon: coupon({ type: "FREE_SHIPPING", value: 0 }) });
    expect(result.shippingCents).toBe(0);
    expect(result.discountCents).toBe(0);
    expect(result.shippingDiscounted).toBe(true);
    expect(result.totalCents).toBe(5000);
  });

  it("taxes the discounted merchandise and optionally shipping", () => {
    const base = { lines: [line({ unitPriceCents: 10000 })], coupon: coupon({ value: 10 }), shipping: { priceCents: 1000, freeOverCents: null } };
    const noShippingTax = calculateTotals({ ...base, tax: { rateBps: 825, appliesToShipping: false } });
    expect(noShippingTax.taxCents).toBe(743); // 9000 × 8.25% = 742.5 → 743
    expect(noShippingTax.totalCents).toBe(9000 + 1000 + 743);
    const withShippingTax = calculateTotals({ ...base, tax: { rateBps: 2000, appliesToShipping: true } });
    expect(withShippingTax.taxCents).toBe(1800 + 200);
  });

  it("allocates tax to lines so order items sum to the merchandise tax", () => {
    const result = calculateTotals({
      lines: [line({ key: "a", unitPriceCents: 3333 }), line({ key: "b", unitPriceCents: 3333 }), line({ key: "c", unitPriceCents: 3334 })],
      tax: { rateBps: 725, appliesToShipping: false },
    });
    expect(result.lines.reduce((sum, item) => sum + item.taxCents, 0)).toBe(result.taxCents);
  });

  it("ignores zero-quantity lines", () => {
    expect(calculateTotals({ lines: [line({ quantity: 0 })] }).subtotalCents).toBe(0);
  });
});
