import { toProductCsv, type ProductCsvRow } from "@/features/import/csv";
import { hasPermission } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";

/** Full catalogue export, one row per variant. Re-importable via /admin/imports. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !user.role.isStaff || !hasPermission(user.permissions, "products.export")) return new Response("Not found", { status: 404 });
  const products = await db.product.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    include: {
      brand: { select: { name: true } },
      primaryCategory: { select: { slug: true } },
      categories: { include: { category: { select: { slug: true } } } },
      collections: { include: { collection: { select: { slug: true } } } },
      tags: { include: { tag: { select: { name: true } } } },
      images: { orderBy: { position: "asc" }, include: { media: { select: { url: true } } } },
      attributeValues: { include: { attributeValue: { include: { attribute: { select: { name: true } } } } } },
      variants: { orderBy: { position: "asc" }, include: { image: { select: { url: true } }, options: { include: { attributeValue: { include: { attribute: { select: { name: true } } } } } } } },
    },
  });
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  const absolute = (url: string) => (url.startsWith("/") ? `${base}${url}` : url);
  const rows: ProductCsvRow[] = products.flatMap((product) =>
    product.variants.map((variant) => ({
      handle: product.slug,
      name: product.name,
      status: product.status,
      brand: product.brand?.name ?? "",
      category: product.primaryCategory?.slug ?? "",
      categories: product.categories.map((entry) => entry.category.slug).join("|"),
      collections: product.collections.map((entry) => entry.collection.slug).join("|"),
      tags: product.tags.map((entry) => entry.tag.name).join("|"),
      short_description: product.shortDescription ?? "",
      description: product.description ?? "",
      featured: product.isFeatured ? "true" : "false",
      specifications: ((product.specifications as Array<{ label: string; value: string }>) ?? []).map((row) => `${row.label}: ${row.value}`).join("|"),
      care: product.careInstructions ?? "",
      shipping_note: product.shippingNote ?? "",
      seo_title: product.seoTitle ?? "",
      seo_description: product.seoDescription ?? "",
      images: product.images.map((image) => absolute(image.media.url)).join("|"),
      attributes: product.attributeValues.map((entry) => `${entry.attributeValue.attribute.name}: ${entry.attributeValue.value}`).join("|"),
      variant_id: variant.id,
      variant_options: variant.options.map((option) => `${option.attributeValue.attribute.name}: ${option.attributeValue.value}`).join("|"),
      sku: variant.sku ?? "",
      barcode: variant.barcode ?? "",
      price: (variant.priceCents / 100).toFixed(2),
      sale_price: variant.salePriceCents !== null ? (variant.salePriceCents / 100).toFixed(2) : "",
      cost: variant.costCents !== null ? (variant.costCents / 100).toFixed(2) : "",
      stock: String(variant.stockQuantity),
      low_stock_threshold: String(variant.lowStockThreshold),
      track_inventory: variant.trackInventory ? "true" : "false",
      allow_backorder: variant.allowBackorder ? "true" : "false",
      weight_grams: variant.weightGrams?.toString() ?? "",
      length_mm: variant.lengthMm?.toString() ?? "",
      width_mm: variant.widthMm?.toString() ?? "",
      height_mm: variant.heightMm?.toString() ?? "",
      variant_image: variant.image ? absolute(variant.image.url) : "",
      variant_active: variant.isActive ? "true" : "false",
    })),
  );
  const csv = toProductCsv(rows);
  return new Response(`﻿${csv}`, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="veyora-products-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store" },
  });
}
