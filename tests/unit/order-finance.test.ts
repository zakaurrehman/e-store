import { describe, expect, it } from "vitest";
import { calculateOrderFinance, commissionCentsFor, refundShareCents, storedOrderFinance } from "@/features/finance/order-finance";

const order = (overrides: Partial<Parameters<typeof calculateOrderFinance>[0]> = {}) => ({
  subtotalCents: 29900,
  discountCents: 0,
  shippingCents: 0,
  taxCents: 0,
  totalCents: 29900,
  items: [{ unitCostCents: 13445, quantity: 1 }],
  ...overrides,
});

describe("order finance", () => {
  it("works the brief's example: $299 paid, $134.45 fulfilment, 10% commission, $134.65 to the owner", () => {
    const finance = calculateOrderFinance(order(), { rateBps: 1000, base: "ORDER_REVENUE" });
    expect(finance.customerPaidCents).toBe(29900);
    expect(finance.fulfilmentCostCents).toBe(13445);
    expect(finance.commissionCents).toBe(2990);
    expect(finance.ownerEarningCents).toBe(13465);
    expect(finance.revenueCents - finance.fulfilmentCostCents - finance.commissionCents).toBe(finance.ownerEarningCents);
  });

  it("charges commission on the goods after discount, never on shipping or tax", () => {
    const finance = calculateOrderFinance(order({ subtotalCents: 10000, discountCents: 1000, shippingCents: 800, taxCents: 700, totalCents: 10500, items: [{ unitCostCents: 3000, quantity: 2 }] }), { rateBps: 1000, base: "ORDER_REVENUE" });
    expect(finance.revenueCents).toBe(9000);
    expect(finance.commissionCents).toBe(900);
    expect(finance.fulfilmentCostCents).toBe(6000);
    expect(finance.ownerEarningCents).toBe(2100);
    expect(finance.customerPaidCents).toBe(10500);
  });

  it("can charge on the owner's margin instead", () => {
    const finance = calculateOrderFinance(order({ subtotalCents: 5000, totalCents: 5000, items: [{ unitCostCents: 3000, quantity: 1 }] }), { rateBps: 1000, base: "OWNER_MARGIN" });
    expect(finance.marginCents).toBe(2000);
    expect(finance.commissionCents).toBe(200);
    expect(finance.ownerEarningCents).toBe(1800);
  });

  it("owes no commission on a loss or at 0%, and rounds to the nearest cent", () => {
    expect(commissionCentsFor({ rateBps: 1000, base: "OWNER_MARGIN" }, { revenueCents: 2000, marginCents: -1000 })).toBe(0);
    expect(commissionCentsFor({ rateBps: 0, base: "ORDER_REVENUE" }, { revenueCents: 2000, marginCents: 1000 })).toBe(0);
    expect(commissionCentsFor({ rateBps: 1000, base: "ORDER_REVENUE" }, { revenueCents: 1995, marginCents: 0 })).toBe(200);
    expect(commissionCentsFor({ rateBps: 1250, base: "ORDER_REVENUE" }, { revenueCents: 1999, marginCents: 0 })).toBe(250);
  });

  it("reads an order's stored figures instead of recalculating them", () => {
    const stored = storedOrderFinance({ subtotalCents: 5000, discountCents: 0, shippingCents: 500, taxCents: 0, totalCents: 5500, fulfilmentCostCents: 3000, commissionRateBps: 1000, commissionBase: "ORDER_REVENUE", commissionCents: 500, ownerEarningCents: 1500 });
    expect(stored).toMatchObject({ customerPaidCents: 5500, revenueCents: 5000, fulfilmentCostCents: 3000, commissionCents: 500, ownerEarningCents: 1500, marginCents: 2000 });
  });

  it("shares a refund across the order's parts in proportion", () => {
    expect(refundShareCents(6000, 5000, 10000)).toBe(3000);
    expect(refundShareCents(6000, 10000, 10000)).toBe(6000);
    expect(refundShareCents(6000, 12000, 10000)).toBe(6000);
    expect(refundShareCents(0, 5000, 10000)).toBe(0);
    expect(refundShareCents(6000, 0, 10000)).toBe(0);
  });
});
