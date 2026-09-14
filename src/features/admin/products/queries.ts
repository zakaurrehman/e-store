import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { ProductStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";

export const PRODUCT_PAGE_SIZE = 25;

export type ProductListFilters = { q?: string; status?: string; category?: string; brand?: string; stock?: string; page?: number; sort?: string };

export async function listAdminProducts(filters: ProductListFilters) {
  const where: Prisma.ProductWhereInput = { deletedAt: null };
  if (filters.q) {
    const q = filters.q.trim();
    where.OR = [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }, { variants: { some: { sku: { contains: q, mode: "insensitive" } } } }, { brand: { name: { contains: q, mode: "insensitive" } } }];
  }
  if (filters.status && filters.status in ProductStatus) where.status = filters.status as ProductStatus;
  if (filters.category) where.categories = { some: { category: { slug: filters.category } } };
  if (filters.brand) where.brand = { slug: filters.brand };
  if (filters.stock === "low") where.variants = { some: { isActive: true, trackInventory: true, stockQuantity: { lte: db.productVariant.fields.lowStockThreshold } } };
  if (filters.stock === "out") where.inStock = false;
  const orderBy: Prisma.ProductOrderByWithRelationInput =
    filters.sort === "name" ? { name: "asc" } : filters.sort === "price" ? { priceCents: "desc" } : filters.sort === "stock" ? { totalStock: "asc" } : filters.sort === "sales" ? { salesCount: "desc" } : { updatedAt: "desc" };
  const page = Math.max(1, filters.page ?? 1);
  const [total, products, statusCounts] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy,
      skip: (page - 1) * PRODUCT_PAGE_SIZE,
      take: PRODUCT_PAGE_SIZE,
      include: {
        brand: { select: { name: true } },
        primaryCategory: { select: { name: true } },
        images: { orderBy: { position: "asc" }, take: 1, select: { media: { select: { url: true } } } },
        _count: { select: { variants: true } },
      },
    }),
    db.product.groupBy({ by: ["status"], where: { deletedAt: null }, _count: { _all: true } }),
  ]);
  return { total, page, pageCount: Math.max(1, Math.ceil(total / PRODUCT_PAGE_SIZE)), products, statusCounts: Object.fromEntries(statusCounts.map((row) => [row.status, row._count._all])) as Record<string, number> };
}

export async function getEditorOptions() {
  const [categories, brands, collections, attributes] = await Promise.all([
    db.category.findMany({ where: { deletedAt: null }, orderBy: [{ position: "asc" }, { name: "asc" }], select: { id: true, name: true, slug: true, parentId: true } }),
    db.brand.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.collection.findMany({ where: { deletedAt: null, rule: "MANUAL" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.attribute.findMany({ orderBy: { position: "asc" }, include: { values: { orderBy: { position: "asc" }, select: { id: true, value: true, slug: true, colorHex: true } } } }),
  ]);
  return {
    categories: categories.map((category) => ({ ...category, parentName: categories.find((parent) => parent.id === category.parentId)?.name ?? null })),
    brands,
    collections,
    attributes: attributes.map((attribute) => ({ id: attribute.id, name: attribute.name, slug: attribute.slug, type: attribute.type, isVariantOption: attribute.isVariantOption, values: attribute.values })),
  };
}

export type EditorOptions = Awaited<ReturnType<typeof getEditorOptions>>;

export async function getProductForEditor(id: string) {
  const product = await db.product.findUnique({
    where: { id },
    include: {
      categories: { select: { categoryId: true } },
      collections: { select: { collectionId: true } },
      tags: { include: { tag: { select: { name: true } } } },
      images: { orderBy: { position: "asc" }, include: { media: { select: { id: true, url: true, alt: true, width: true, height: true } } } },
      attributeValues: { select: { attributeValueId: true } },
      variants: { orderBy: { position: "asc" }, include: { options: { select: { attributeValueId: true } }, image: { select: { id: true, url: true } } } },
    },
  });
  if (!product) return null;
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    status: product.status,
    brandId: product.brandId,
    primaryCategoryId: product.primaryCategoryId,
    categoryIds: product.categories.map((entry) => entry.categoryId),
    collectionIds: product.collections.map((entry) => entry.collectionId),
    tags: product.tags.map((entry) => entry.tag.name),
    shortDescription: product.shortDescription ?? "",
    description: product.description ?? "",
    isFeatured: product.isFeatured,
    specifications: (product.specifications as Array<{ label: string; value: string }>) ?? [],
    careInstructions: product.careInstructions ?? "",
    shippingNote: product.shippingNote ?? "",
    seoTitle: product.seoTitle ?? "",
    seoDescription: product.seoDescription ?? "",
    images: product.images.map((image) => ({ mediaId: image.media.id, url: image.media.url, alt: image.alt ?? "", width: image.media.width, height: image.media.height })),
    attributeValueIds: product.attributeValues.map((entry) => entry.attributeValueId),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku ?? "",
      barcode: variant.barcode ?? "",
      price: (variant.priceCents / 100).toFixed(2),
      salePrice: variant.salePriceCents !== null ? (variant.salePriceCents / 100).toFixed(2) : "",
      cost: variant.costCents !== null ? (variant.costCents / 100).toFixed(2) : "",
      stockQuantity: variant.stockQuantity,
      lowStockThreshold: variant.lowStockThreshold,
      trackInventory: variant.trackInventory,
      allowBackorder: variant.allowBackorder,
      weightGrams: variant.weightGrams ?? "",
      lengthMm: variant.lengthMm ?? "",
      widthMm: variant.widthMm ?? "",
      heightMm: variant.heightMm ?? "",
      imageMediaId: variant.image?.id ?? null,
      optionValueIds: variant.options.map((option) => option.attributeValueId),
      isActive: variant.isActive,
    })),
    salesCount: product.salesCount,
    ratingAverage: product.ratingAverage,
    ratingCount: product.ratingCount,
  };
}

export type EditorProduct = NonNullable<Awaited<ReturnType<typeof getProductForEditor>>>;
export type EditorVariant = EditorProduct["variants"][number];

export async function listInventory(filters: { q?: string; filter?: string; page?: number }) {
  const where: Prisma.ProductVariantWhereInput = { product: { deletedAt: null } };
  if (filters.q) where.OR = [{ sku: { contains: filters.q, mode: "insensitive" } }, { product: { name: { contains: filters.q, mode: "insensitive" } } }];
  if (filters.filter === "low") where.AND = [{ trackInventory: true }, { stockQuantity: { lte: db.productVariant.fields.lowStockThreshold } }];
  if (filters.filter === "out") where.AND = [{ trackInventory: true }, { stockQuantity: { lte: 0 } }];
  const page = Math.max(1, filters.page ?? 1);
  const [total, variants] = await Promise.all([
    db.productVariant.count({ where }),
    db.productVariant.findMany({
      where,
      orderBy: [{ stockQuantity: "asc" }, { product: { name: "asc" } }],
      skip: (page - 1) * 50,
      take: 50,
      include: { product: { select: { id: true, name: true, status: true, images: { orderBy: { position: "asc" }, take: 1, select: { media: { select: { url: true } } } } } } },
    }),
  ]);
  return { total, page, pageCount: Math.max(1, Math.ceil(total / 50)), variants };
}

export async function getInventoryLedger(variantId: string) {
  return db.inventoryMovement.findMany({ where: { variantId }, orderBy: { createdAt: "desc" }, take: 50, include: { actor: { select: { firstName: true, lastName: true } }, order: { select: { number: true, id: true } } } });
}
