/** Client-safe description of the store a request is being served for. */
import type { StorePricingRules } from "./pricing";

export type StoreContext = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  announcement: string | null;
  aboutText: string | null;
  supportEmail: string | null;
  accentColor: string;
  /** The store's own logo, with its real dimensions so it keeps its shape wherever it is shown. */
  logo: { url: string; width: number | null; height: number | null } | null;
  heroImageUrl: string | null;
  heroTitle: string | null;
  heroSubtitle: string | null;
  currency: string;
  pricing: StorePricingRules;
  /** Public URL, e.g. https://maya.zendropship.io */
  url: string;
  /** True for the platform-run demo store (no owner), whose homepage is managed from the admin CMS. */
  isPlatformStore: boolean;
};

/** The part of a store that changes what the catalogue returns — the cache key for scoped queries. */
export type StoreScope = { id: string; pricing: StorePricingRules };

export const scopeOf = (store: StoreContext): StoreScope => ({ id: store.id, pricing: store.pricing });
