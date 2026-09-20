import { describe, expect, it } from "vitest";
import { markupPrice, marginPercent, ownerMarginCents, platformFeeCents, roundToRetail, storePriceFor, summarisePrices } from "@/features/stores/pricing";

const variant = { priceCents: 8000, salePriceCents: 7200, costCents: 4000 };

describe("store pricing", () => {
  it("rounds markup prices to shopper-friendly endings", () => {
    expect(roundToRetail(5600)).toBe(5599);
    expect(roundToRetail(5699)).toBe(5699);
    expect(roundToRetail(5650)).toBe(5699);
    expect(roundToRetail(320)).toBe(299);
    expect(roundToRetail(10)).toBe(49);
    expect(roundToRetail(0)).toBe(0);
    expect(markupPrice(4000, 4000)).toBe(5599);
  });

  it("sells at the supplier's suggested price by default, keeping the strike-through", () => {
    expect(storePriceFor(variant, { mode: "SUGGESTED", markupBps: 0 })).toEqual({ priceCents: 7200, compareAtCents: 8000, costCents: 4000 });
  });

  it("applies the store markup over wholesale, with no strike-through", () => {
    expect(storePriceFor(variant, { mode: "MARKUP", markupBps: 5000 })).toEqual({ priceCents: 5999, compareAtCents: null, costCents: 4000 });
  });

  it("lets a product override the store rules with its own markup or a fixed price", () => {
    expect(storePriceFor(variant, { mode: "SUGGESTED", markupBps: 0 }, { markupBps: 10000, fixedPriceCents: null }).priceCents).toBe(7999);
    expect(storePriceFor(variant, { mode: "MARKUP", markupBps: 5000 }, { markupBps: null, fixedPriceCents: 6500 })).toEqual({ priceCents: 6500, compareAtCents: null, costCents: 4000 });
  });

  it("falls back to the selling price as cost when the supplier gave none", () => {
    expect(storePriceFor({ priceCents: 3000, salePriceCents: null, costCents: null }, { mode: "MARKUP", markupBps: 2000 })).toEqual({ priceCents: 3599, compareAtCents: null, costCents: 3000 });
  });

  it("summarises a product from its cheapest variant", () => {
    const summary = summarisePrices([
      { priceCents: 5999, compareAtCents: null, costCents: 4000 },
      { priceCents: 4499, compareAtCents: 5000, costCents: 3000 },
    ]);
    expect(summary).toEqual({ priceCents: 4499, maxPriceCents: 5999, compareAtPriceCents: 5000, onSale: true, costCents: 3000 });
  });

  it("computes the owner's margin after the platform fee", () => {
    expect(platformFeeCents(10000, 500)).toBe(500);
    expect(ownerMarginCents(10000, 5500, 500)).toBe(4000);
    expect(marginPercent(10000, 5500, 500)).toBe(40);
  });
});
