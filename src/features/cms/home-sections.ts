import { z } from "zod";

export const RAIL_SOURCES = ["new", "featured", "best-sellers", "sale", "top-rated", "trending"] as const;
export const TRUST_ICONS = ["truck", "returns", "secure", "support", "gift", "leaf"] as const;

/** Per-type configuration for CMS homepage sections. Unknown or invalid config falls back to defaults. */
export const homeSectionConfigSchemas = {
  HERO: z.object({ bannerId: z.string().optional() }),
  CATEGORY_GRID: z.object({ categorySlugs: z.array(z.string()).max(12).default([]) }),
  PRODUCT_RAIL: z.object({
    source: z.enum(RAIL_SOURCES).default("new"),
    categorySlug: z.string().optional(),
    limit: z.number().int().min(4).max(16).default(8),
    ctaLabel: z.string().max(40).optional(),
    ctaHref: z.string().max(200).optional(),
  }),
  PROMO_BANNERS: z.object({ bannerIds: z.array(z.string()).max(3).default([]) }),
  EDITORIAL: z.object({ bannerId: z.string().optional(), align: z.enum(["left", "right"]).default("left") }),
  BRAND_STRIP: z.object({ brandSlugs: z.array(z.string()).max(12).default([]) }),
  TRUST_BAR: z.object({
    items: z
      .array(z.object({ icon: z.enum(TRUST_ICONS), title: z.string().max(40), text: z.string().max(80) }))
      .max(4)
      .default([]),
  }),
  REVIEWS: z.object({ limit: z.number().int().min(3).max(12).default(6) }),
  NEWSLETTER: z.object({ text: z.string().max(200).optional() }),
} as const;

export type HomeSectionType = keyof typeof homeSectionConfigSchemas;
export type HomeSectionConfig<T extends HomeSectionType> = z.infer<(typeof homeSectionConfigSchemas)[T]>;

export function parseHomeSectionConfig<T extends HomeSectionType>(type: T, value: unknown): HomeSectionConfig<T> {
  const schema = homeSectionConfigSchemas[type];
  const parsed = schema.safeParse(value ?? {});
  return (parsed.success ? parsed.data : schema.parse({})) as HomeSectionConfig<T>;
}

export const HOME_SECTION_LABELS: Record<HomeSectionType, string> = {
  HERO: "Hero banner",
  CATEGORY_GRID: "Category grid",
  PRODUCT_RAIL: "Product rail",
  PROMO_BANNERS: "Promotional banners",
  EDITORIAL: "Editorial split",
  BRAND_STRIP: "Brand strip",
  TRUST_BAR: "Trust indicators",
  REVIEWS: "Customer reviews",
  NEWSLETTER: "Newsletter",
};
