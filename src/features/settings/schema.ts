import { z } from "zod";

const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .refine((value) => value === "" || /^https:\/\//.test(value), "Use a full https:// URL.")
  .default("");

export const settingsSchema = {
  store: z.object({
    name: z.string().trim().min(1).max(60).default("Zendropship"),
    tagline: z.string().trim().max(120).default("Considered essentials, delivered worldwide."),
    legalName: z.string().trim().max(120).default("Zendropship Commerce"),
    supportEmail: z.string().trim().max(254).default(""),
    supportPhone: z.string().trim().max(40).default(""),
    supportHours: z.string().trim().max(120).default("Monday–Friday, 9:00–18:00"),
    address: z.string().trim().max(300).default(""),
    currency: z.string().length(3).default("USD"),
    locale: z.string().default("en-US"),
  }),
  announcement: z.object({
    enabled: z.boolean().default(true),
    message: z.string().trim().max(140).default("Complimentary shipping on orders over $150 · 30-day returns"),
    href: z.string().trim().max(300).default("/pages/shipping"),
  }),
  commerce: z.object({
    guestCheckout: z.boolean().default(true),
    returnWindowDays: z.number().int().min(0).max(365).default(30),
    reviewsRequireApproval: z.boolean().default(true),
    reviewsVerifiedPurchaseOnly: z.boolean().default(false),
    reviewImagesEnabled: z.boolean().default(true),
    lowStockThreshold: z.number().int().min(0).max(1000).default(5),
  }),
  seo: z.object({
    titleTemplate: z.string().trim().max(80).default("%s · Zendropship"),
    defaultTitle: z.string().trim().max(80).default("Zendropship — Fashion, beauty, tech & home"),
    defaultDescription: z
      .string()
      .trim()
      .max(200)
      .default("Shop considered fashion, beauty, watches, jewellery, tech and home essentials from independent house labels. Free returns within 30 days."),
  }),
  social: z.object({
    instagram: optionalUrl,
    tiktok: optionalUrl,
    x: optionalUrl,
    youtube: optionalUrl,
    pinterest: optionalUrl,
  }),
};

export type SettingsKey = keyof typeof settingsSchema;
export type StoreSettings = { [K in SettingsKey]: z.infer<(typeof settingsSchema)[K]> };

export const SETTINGS_KEYS = Object.keys(settingsSchema) as SettingsKey[];

export function parseSettingsSection<K extends SettingsKey>(key: K, value: unknown): StoreSettings[K] {
  const result = settingsSchema[key].safeParse(value ?? {});
  return (result.success ? result.data : settingsSchema[key].parse({})) as StoreSettings[K];
}
