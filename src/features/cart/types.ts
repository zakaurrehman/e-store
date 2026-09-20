/** Client-safe cart types. Must not import server modules (this file is bundled for the browser). */

export type CartLine = {
  id: string;
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  brandName: string | null;
  variantTitle: string | null;
  sku: string | null;
  imageUrl: string | null;
  imageAlt: string;
  unitPriceCents: number;
  /** Wholesale the store owner pays the platform for one unit; never shown to shoppers. */
  unitCostCents: number;
  compareAtCents: number | null;
  quantity: number;
  lineTotalCents: number;
  /** Maximum purchasable quantity right now (null = unlimited). */
  maxQuantity: number | null;
  available: boolean;
  categoryIds: string[];
  weightGrams: number;
};

export type CartSnapshot = {
  id: string | null;
  lines: CartLine[];
  itemCount: number;
  subtotalCents: number;
  discountCents: number;
  estimatedTotalCents: number;
  couponCode: string | null;
  couponDescription: string | null;
  couponError: string | null;
  freeShippingThresholdCents: number | null;
  hasUnavailableItems: boolean;
};

export const EMPTY_CART: CartSnapshot = {
  id: null,
  lines: [],
  itemCount: 0,
  subtotalCents: 0,
  discountCents: 0,
  estimatedTotalCents: 0,
  couponCode: null,
  couponDescription: null,
  couponError: null,
  freeShippingThresholdCents: null,
  hasUnavailableItems: false,
};
