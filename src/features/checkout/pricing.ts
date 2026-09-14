/**
 * Pure pricing engine shared by the cart, checkout and order creation. No I/O — fully unit tested.
 * All amounts are integer cents. Prices are tax-exclusive; tax is applied after discounts.
 */

export type DiscountKind = "PERCENTAGE" | "FIXED_AMOUNT" | "FREE_SHIPPING";
export type DiscountScope = "ORDER" | "PRODUCTS" | "CATEGORIES";

export type PricingLine = {
  key: string;
  productId: string;
  categoryIds: string[];
  unitPriceCents: number;
  quantity: number;
};

export type PricingCoupon = {
  code: string;
  type: DiscountKind;
  value: number;
  scope: DiscountScope;
  maxDiscountCents: number | null;
  productIds: string[];
  categoryIds: string[];
};

export type PricingShipping = { priceCents: number; freeOverCents: number | null } | null;

export type PricingTax = { rateBps: number; appliesToShipping: boolean } | null;

export type PricedLine = PricingLine & { lineSubtotalCents: number; discountCents: number; taxCents: number; totalCents: number };

export type PricingResult = {
  lines: PricedLine[];
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  shippingDiscounted: boolean;
  taxCents: number;
  totalCents: number;
  couponApplied: boolean;
};

/** Distributes `amount` across `weights` proportionally using the largest-remainder method (sums exactly). */
export function allocate(amount: number, weights: number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (amount <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((weight) => (amount * weight) / total);
  const floored = raw.map(Math.floor);
  let remainder = amount - floored.reduce((sum, value) => sum + value, 0);
  const order = raw.map((value, index) => ({ index, fraction: value - Math.floor(value) })).sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of order) {
    if (remainder <= 0) break;
    floored[index] += 1;
    remainder -= 1;
  }
  return floored;
}

export function isLineEligible(line: PricingLine, coupon: Pick<PricingCoupon, "scope" | "productIds" | "categoryIds">) {
  if (coupon.scope === "ORDER") return true;
  if (coupon.scope === "PRODUCTS") return coupon.productIds.includes(line.productId);
  return line.categoryIds.some((id) => coupon.categoryIds.includes(id));
}

export function calculateCouponDiscount(lines: PricingLine[], coupon: PricingCoupon) {
  const eligibleSubtotal = lines.filter((line) => isLineEligible(line, coupon)).reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
  let discount = 0;
  if (coupon.type === "PERCENTAGE") discount = Math.floor((eligibleSubtotal * Math.min(100, Math.max(0, coupon.value))) / 100);
  else if (coupon.type === "FIXED_AMOUNT") discount = Math.min(Math.max(0, coupon.value), eligibleSubtotal);
  if (coupon.maxDiscountCents !== null && coupon.maxDiscountCents >= 0) discount = Math.min(discount, coupon.maxDiscountCents);
  return { discount, eligibleSubtotal };
}

export function calculateTotals(input: { lines: PricingLine[]; coupon?: PricingCoupon | null; shipping?: PricingShipping; tax?: PricingTax }): PricingResult {
  const lines = input.lines.filter((line) => line.quantity > 0);
  const lineSubtotals = lines.map((line) => line.unitPriceCents * line.quantity);
  const subtotalCents = lineSubtotals.reduce((sum, value) => sum + value, 0);

  let discountCents = 0;
  let lineDiscounts = lines.map(() => 0);
  let freeShippingCoupon = false;
  let couponApplied = false;

  if (input.coupon) {
    const eligibility = lines.map((line) => isLineEligible(line, input.coupon!));
    if (input.coupon.type === "FREE_SHIPPING") {
      freeShippingCoupon = eligibility.some(Boolean);
      couponApplied = freeShippingCoupon;
    } else {
      const { discount } = calculateCouponDiscount(lines, input.coupon);
      discountCents = discount;
      lineDiscounts = allocate(discount, lineSubtotals.map((value, index) => (eligibility[index] ? value : 0)));
      couponApplied = discount > 0;
    }
  }

  const merchandiseAfterDiscount = subtotalCents - discountCents;
  let shippingCents = 0;
  let shippingDiscounted = false;
  if (input.shipping) {
    const qualifiesForFree = input.shipping.freeOverCents !== null && merchandiseAfterDiscount >= input.shipping.freeOverCents;
    shippingDiscounted = (qualifiesForFree || freeShippingCoupon) && input.shipping.priceCents > 0;
    shippingCents = qualifiesForFree || freeShippingCoupon ? 0 : input.shipping.priceCents;
  }

  let taxCents = 0;
  let lineTaxes = lines.map(() => 0);
  if (input.tax && input.tax.rateBps > 0) {
    const taxableLines = lineSubtotals.map((value, index) => value - lineDiscounts[index]);
    const merchandiseTax = Math.round((merchandiseAfterDiscount * input.tax.rateBps) / 10_000);
    const shippingTax = input.tax.appliesToShipping ? Math.round((shippingCents * input.tax.rateBps) / 10_000) : 0;
    lineTaxes = allocate(merchandiseTax, taxableLines);
    taxCents = merchandiseTax + shippingTax;
  }

  return {
    lines: lines.map((line, index) => ({
      ...line,
      lineSubtotalCents: lineSubtotals[index],
      discountCents: lineDiscounts[index],
      taxCents: lineTaxes[index],
      totalCents: lineSubtotals[index] - lineDiscounts[index],
    })),
    subtotalCents,
    discountCents,
    shippingCents,
    shippingDiscounted,
    taxCents,
    totalCents: merchandiseAfterDiscount + shippingCents + taxCents,
    couponApplied,
  };
}
