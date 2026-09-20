/** The supplier's selling price for a variant: the sale price while a promotion is on, else the regular price. Client-safe. */
export const effectivePrice = (variant: { priceCents: number; salePriceCents: number | null }) =>
  variant.salePriceCents !== null && variant.salePriceCents < variant.priceCents ? variant.salePriceCents : variant.priceCents;
