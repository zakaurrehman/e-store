import { z } from "zod";
import { emailSchema } from "@/features/auth/schemas";
import { PASSWORD_MAX_LENGTH } from "@/server/auth/password";

const nameSchema = (label: string) => z.string().trim().min(1, `Enter your ${label}.`).max(60, `${label[0].toUpperCase()}${label.slice(1)} is too long.`);

export const storeNameSchema = z.string().trim().min(2, "Store names are at least 2 characters.").max(60, "Store names are at most 60 characters.");

/** Blank means "derive it from the store name". */
export const storeSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(30, "Store addresses are at most 30 characters.")
  .optional()
  .transform((value) => value || undefined);

/** Opening a store as a new visitor: account details plus the store name. */
export const openStoreSchema = z.object({
  storeName: storeNameSchema,
  slug: storeSlugSchema,
  firstName: nameSchema("first name"),
  lastName: nameSchema("last name"),
  email: emailSchema,
  password: z.string().max(PASSWORD_MAX_LENGTH),
});

/** Opening a store while already signed in. */
export const openStoreSignedInSchema = openStoreSchema.pick({ storeName: true, slug: true });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .optional()
    .transform((value) => value || null);

export const storeSettingsSchema = z.object({
  name: storeNameSchema,
  tagline: optionalText(120),
  aboutText: optionalText(2000),
  supportEmail: z
    .string()
    .trim()
    .max(254)
    .optional()
    .transform((value) => value || null)
    .pipe(z.email("Enter a valid email address.").nullable()),
  announcement: optionalText(160),
  heroTitle: optionalText(80),
  heroSubtitle: optionalText(200),
  accentColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #5446ff."),
});

export const storePricingSchema = z.object({
  pricingMode: z.enum(["SUGGESTED", "MARKUP"]),
  markupPercent: z.coerce.number({ error: "Enter a markup percentage." }).min(0, "Markup can't be negative.").max(1000, "Markup is at most 1000%."),
});

/** Per-product pricing in the dashboard: blank fields mean "use the store's rule". */
export const storeProductPricingSchema = z.object({
  productId: z.string().min(1).max(40),
  markupPercent: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? Number(value) : null))
    .pipe(z.number().min(0, "Markup can't be negative.").max(1000, "Markup is at most 1000%.").nullable()),
  fixedPrice: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? Math.round(Number(value) * 100) : null))
    .pipe(z.number().int().min(1, "Enter a price above zero.").max(100_000_000, "That price is too high.").nullable()),
});
