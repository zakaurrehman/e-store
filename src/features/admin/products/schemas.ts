import { z } from "zod";
import { ProductStatus } from "@/generated/prisma/enums";

const optionalMoney = z.union([z.string(), z.number(), z.null()]).transform((value) => {
  if (value === null || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(number) ? Math.round(number * 100) : null;
});
const optionalInt = z.union([z.string(), z.number(), z.null()]).transform((value) => {
  if (value === null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
});

export const variantPayloadSchema = z.object({
  id: z.string().optional(),
  sku: z.string().trim().max(60).optional(),
  barcode: z.string().trim().max(60).optional(),
  price: z.union([z.string(), z.number()]).transform((value) => {
    const number = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(number) ? Math.round(number * 100) : NaN;
  }),
  salePrice: optionalMoney.optional(),
  cost: optionalMoney.optional(),
  stockQuantity: z.coerce.number().int().min(-1_000_000).max(1_000_000),
  lowStockThreshold: z.coerce.number().int().min(0).max(100_000).default(5),
  trackInventory: z.boolean().default(true),
  allowBackorder: z.boolean().default(false),
  weightGrams: optionalInt.optional(),
  lengthMm: optionalInt.optional(),
  widthMm: optionalInt.optional(),
  heightMm: optionalInt.optional(),
  imageMediaId: z.string().nullable().optional(),
  optionValueIds: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

export const productPayloadSchema = z.object({
  name: z.string().trim().min(1, "Enter a product name.").max(200),
  slug: z.string().trim().max(120).optional(),
  status: z.enum(ProductStatus),
  brandId: z.string().nullable().optional(),
  primaryCategoryId: z.string().nullable().optional(),
  categoryIds: z.array(z.string()).default([]),
  collectionIds: z.array(z.string()).default([]),
  tags: z.array(z.string().trim().max(40)).default([]),
  shortDescription: z.string().trim().max(300).optional(),
  description: z.string().trim().max(20_000).optional(),
  isFeatured: z.boolean().default(false),
  specifications: z.array(z.object({ label: z.string().trim().max(80), value: z.string().trim().max(300) })).default([]),
  careInstructions: z.string().trim().max(1000).optional(),
  shippingNote: z.string().trim().max(500).optional(),
  seoTitle: z.string().trim().max(120).optional(),
  seoDescription: z.string().trim().max(320).optional(),
  images: z.array(z.object({ mediaId: z.string(), alt: z.string().max(300).optional() })).default([]),
  attributeValueIds: z.array(z.string()).default([]),
  variants: z.array(variantPayloadSchema).min(1, "Add at least one variant."),
});

export type ProductPayload = z.input<typeof productPayloadSchema>;
