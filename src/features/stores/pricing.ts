/**
 * How a store prices a platform product. Client-safe: pure functions only.
 *
 * The platform catalogue holds two prices per variant:
 *   costCents   — wholesale, what the store owner pays Zendropship when the item sells
 *   priceCents  — the supplier's suggested retail (salePriceCents when on promotion)
 *
 * A store sells at the suggested price (SUGGESTED), at wholesale plus its markup (MARKUP), or at a
 * fixed price set per product. Owner margin = retail − wholesale − platform fee.
 */
import { effectivePrice } from "./effective-price";

export type StorePricingRules = { mode: "SUGGESTED" | "MARKUP"; markupBps: number };
export type StoreProductOverride = { markupBps: number | null; fixedPriceCents: number | null } | null | undefined;
export type PriceableVariant = { priceCents: number; salePriceCents: number | null; costCents: number | null };
export type PricedVariant = { priceCents: number; compareAtCents: number | null; costCents: number };

/** The platform's own catalogue pages show the suggested retail price. */
export const SUGGESTED_PRICING: StorePricingRules = { mode: "SUGGESTED", markupBps: 0 };

/** Wholesale cost; falls back to the selling price when a supplier feed provided none, so margin is never negative by accident. */
export function wholesaleCents(variant: PriceableVariant): number {
  return variant.costCents ?? effectivePrice(variant);
}

/** Nearest price ending in .99 (.49/.99 steps under $5) — what shoppers expect to see. */
export function roundToRetail(cents: number): number {
  if (cents <= 0) return 0;
  if (cents < 500) return Math.max(49, Math.round(cents / 50) * 50 - 1);
  return Math.round(cents / 100) * 100 - 1;
}

export function markupPrice(costCents: number, markupBps: number): number {
  return roundToRetail(Math.round(costCents * (1 + markupBps / 10_000)));
}

export function storePriceFor(variant: PriceableVariant, rules: StorePricingRules, override?: StoreProductOverride): PricedVariant {
  const costCents = wholesaleCents(variant);
  if (override?.fixedPriceCents != null) return { priceCents: override.fixedPriceCents, compareAtCents: null, costCents };
  if (override?.markupBps != null) return { priceCents: markupPrice(costCents, override.markupBps), compareAtCents: null, costCents };
  if (rules.mode === "MARKUP") return { priceCents: markupPrice(costCents, rules.markupBps), compareAtCents: null, costCents };
  const priceCents = effectivePrice(variant);
  return { priceCents, compareAtCents: priceCents < variant.priceCents ? variant.priceCents : null, costCents };
}

export type PriceSummary = { priceCents: number; maxPriceCents: number; compareAtPriceCents: number | null; onSale: boolean; costCents: number };

/** Product-level figures from its variants: the cheapest variant leads, as on the catalogue cards. */
export function summarisePrices(variants: PricedVariant[]): PriceSummary {
  if (variants.length === 0) return { priceCents: 0, maxPriceCents: 0, compareAtPriceCents: null, onSale: false, costCents: 0 };
  const cheapest = variants.reduce((best, variant) => (variant.priceCents < best.priceCents ? variant : best));
  return {
    priceCents: cheapest.priceCents,
    maxPriceCents: Math.max(...variants.map((variant) => variant.priceCents)),
    compareAtPriceCents: cheapest.compareAtCents,
    onSale: variants.some((variant) => variant.compareAtCents !== null && variant.compareAtCents > variant.priceCents),
    costCents: cheapest.costCents,
  };
}

/** Platform service fee on a retail amount (basis points of the sale price). */
export function platformFeeCents(retailCents: number, feeBps: number): number {
  return Math.round((retailCents * feeBps) / 10_000);
}

/** What the store owner keeps on one unit. */
export function ownerMarginCents(retailCents: number, costCents: number, feeBps: number): number {
  return retailCents - costCents - platformFeeCents(retailCents, feeBps);
}

export function marginPercent(retailCents: number, costCents: number, feeBps: number): number {
  if (retailCents <= 0) return 0;
  return Math.round((ownerMarginCents(retailCents, costCents, feeBps) / retailCents) * 1000) / 10;
}
