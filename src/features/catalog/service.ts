import { Prisma } from "@/generated/prisma/client";
import { InventoryReason, OrderStatus, PaymentStatus, ProductStatus, ReviewStatus } from "@/generated/prisma/enums";
import { getSearchProvider } from "@/features/search/provider";
import { db, type DbClient, type Tx } from "@/server/db";
import { DomainError, NotFoundError } from "@/server/errors";
import { slugify, uniqueSlug } from "@/utils/slug";

export type VariantInput = {
  id?: string;
  sku?: string | null;
  barcode?: string | null;
  priceCents: number;
  salePriceCents?: number | null;
  costCents?: number | null;
  stockQuantity: number;
  lowStockThreshold?: number;
  trackInventory?: boolean;
  allowBackorder?: boolean;
  weightGrams?: number | null;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  imageMediaId?: string | null;
  optionValueIds?: string[];
  isActive?: boolean;
};

export type ProductInput = {
  name: string;
  slug?: string | null;
  status: ProductStatus;
  brandId?: string | null;
  primaryCategoryId?: string | null;
  categoryIds?: string[];
  collectionIds?: string[];
  tags?: string[];
  shortDescription?: string | null;
  description?: string | null;
  isFeatured?: boolean;
  specifications?: Array<{ label: string; value: string }>;
  careInstructions?: string | null;
  shippingNote?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  images?: Array<{ mediaId: string; alt?: string | null }>;
  attributeValueIds?: string[];
  variants: VariantInput[];
};

import { effectivePrice } from "@/features/stores/effective-price";

export { effectivePrice };

/** Recalculates the denormalised price/stock read model on Product from its active variants. */
export async function recomputeProductAggregates(productId: string, client: DbClient = db) {
  const variants = await client.productVariant.findMany({ where: { productId, isActive: true } });
  if (variants.length === 0) {
    await client.product.update({
      where: { id: productId },
      data: { priceCents: 0, maxPriceCents: 0, compareAtPriceCents: null, onSale: false, inStock: false, totalStock: 0 },
    });
    return;
  }
  const cheapest = variants.reduce((best, variant) => (effectivePrice(variant) < effectivePrice(best) ? variant : best));
  const prices = variants.map(effectivePrice);
  const onSaleVariant = (variant: (typeof variants)[number]) => variant.salePriceCents !== null && variant.salePriceCents < variant.priceCents;
  await client.product.update({
    where: { id: productId },
    data: {
      priceCents: Math.min(...prices),
      maxPriceCents: Math.max(...prices),
      compareAtPriceCents: onSaleVariant(cheapest) ? cheapest.priceCents : null,
      onSale: variants.some(onSaleVariant),
      totalStock: variants.filter((variant) => variant.trackInventory).reduce((sum, variant) => sum + Math.max(0, variant.stockQuantity), 0),
      inStock: variants.some((variant) => !variant.trackInventory || variant.allowBackorder || variant.stockQuantity > 0),
    },
  });
}

export async function recomputeProductRating(productId: string, client: DbClient = db) {
  const aggregate = await client.review.aggregate({
    where: { productId, status: ReviewStatus.APPROVED, deletedAt: null },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await client.product.update({
    where: { id: productId },
    data: { ratingAverage: Math.round((aggregate._avg.rating ?? 0) * 10) / 10, ratingCount: aggregate._count._all },
  });
}

/** Units sold across paid, non-cancelled orders. */
export async function recomputeProductSales(productIds: string[], client: DbClient = db) {
  for (const productId of new Set(productIds)) {
    const sold = await client.orderItem.aggregate({
      where: {
        productId,
        order: {
          status: { not: OrderStatus.CANCELLED },
          paymentStatus: { in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED] },
        },
      },
      _sum: { quantity: true },
    });
    await client.product.update({ where: { id: productId }, data: { salesCount: sold._sum.quantity ?? 0 } });
  }
}

/**
 * Applies a stock change and records it in the inventory ledger. Uses an atomic increment so concurrent
 * orders cannot oversell when `guardNegative` is set.
 */
export async function adjustInventory(
  client: Tx,
  input: { variantId: string; delta: number; reason: InventoryReason; note?: string | null; orderId?: string | null; actorId?: string | null; guardNegative?: boolean },
) {
  if (input.delta === 0) return null;
  if (input.guardNegative && input.delta < 0) {
    const updated = await client.productVariant.updateMany({
      where: {
        id: input.variantId,
        OR: [{ trackInventory: false }, { allowBackorder: true }, { stockQuantity: { gte: -input.delta } }],
      },
      data: { stockQuantity: { increment: input.delta } },
    });
    if (updated.count === 0) {
      throw new DomainError("OUT_OF_STOCK", "Some items in your bag just sold out. Please review your bag.");
    }
  } else {
    await client.productVariant.update({ where: { id: input.variantId }, data: { stockQuantity: { increment: input.delta } } });
  }
  const variant = await client.productVariant.findUniqueOrThrow({ where: { id: input.variantId }, select: { stockQuantity: true } });
  return client.inventoryMovement.create({
    data: {
      variantId: input.variantId,
      delta: input.delta,
      balanceAfter: variant.stockQuantity,
      reason: input.reason,
      note: input.note ?? null,
      orderId: input.orderId ?? null,
      actorId: input.actorId ?? null,
    },
  });
}

export async function setVariantStock(client: Tx, variantId: string, quantity: number, meta: { reason?: InventoryReason; note?: string; actorId?: string | null }) {
  const variant = await client.productVariant.findUniqueOrThrow({ where: { id: variantId }, select: { stockQuantity: true, productId: true } });
  const delta = quantity - variant.stockQuantity;
  if (delta !== 0) {
    await adjustInventory(client, { variantId, delta, reason: meta.reason ?? InventoryReason.ADJUSTMENT, note: meta.note, actorId: meta.actorId });
  }
  return { productId: variant.productId, delta };
}

async function variantTitle(client: Tx, optionValueIds: string[]) {
  if (optionValueIds.length === 0) return "Default";
  const values = await client.attributeValue.findMany({
    where: { id: { in: optionValueIds } },
    include: { attribute: { select: { position: true } } },
  });
  return values
    .sort((a, b) => a.attribute.position - b.attribute.position || a.position - b.position)
    .map((value) => value.value)
    .join(" / ");
}

function validateProductInput(input: ProductInput) {
  const fieldErrors: Record<string, string[]> = {};
  if (!input.name.trim()) fieldErrors.name = ["Enter a product name."];
  if (input.variants.length === 0) fieldErrors.variants = ["Add at least one variant."];
  input.variants.forEach((variant, index) => {
    if (!Number.isInteger(variant.priceCents) || variant.priceCents < 0) fieldErrors[`variants.${index}.priceCents`] = ["Enter a valid price."];
    if (variant.salePriceCents !== null && variant.salePriceCents !== undefined && variant.salePriceCents >= variant.priceCents) {
      fieldErrors[`variants.${index}.salePriceCents`] = ["Sale price must be lower than the regular price."];
    }
    if (!Number.isInteger(variant.stockQuantity)) fieldErrors[`variants.${index}.stockQuantity`] = ["Enter a whole number."];
  });
  const skus = input.variants.map((variant) => variant.sku?.trim()).filter(Boolean) as string[];
  if (new Set(skus).size !== skus.length) fieldErrors.variants = ["Each variant needs a unique SKU."];
  const optionSets = input.variants.map((variant) => [...(variant.optionValueIds ?? [])].sort().join("|"));
  if (input.variants.length > 1 && new Set(optionSets).size !== optionSets.length) {
    fieldErrors.variants = ["Two variants have the same option combination."];
  }
  if (Object.keys(fieldErrors).length > 0) {
    throw new DomainError("INVALID_PRODUCT", "Please fix the highlighted fields.", { fieldErrors });
  }
}

/**
 * Creates or updates a product with its variants, media, taxonomy and inventory ledger in one transaction.
 * Used by the admin, the CSV/WooCommerce importers and the seed.
 */
export async function saveProduct(
  input: ProductInput,
  options: { productId?: string; actorId?: string | null; inventoryReason?: InventoryReason } = {},
) {
  validateProductInput(input);
  const existing = options.productId
    ? await db.product.findUnique({ where: { id: options.productId }, include: { variants: { select: { id: true } } } })
    : null;
  if (options.productId && !existing) throw new NotFoundError("Product not found.");

  const desiredSlug = input.slug?.trim() ? slugify(input.slug) : slugify(input.name);
  const slug = await uniqueSlug(desiredSlug, async (candidate) => {
    const clash = await db.product.findUnique({ where: { slug: candidate }, select: { id: true } });
    return !!clash && clash.id !== existing?.id;
  });

  const categoryIds = Array.from(new Set([...(input.categoryIds ?? []), ...(input.primaryCategoryId ? [input.primaryCategoryId] : [])]));
  const data = {
    name: input.name.trim(),
    slug,
    status: input.status,
    brandId: input.brandId || null,
    primaryCategoryId: input.primaryCategoryId || categoryIds[0] || null,
    shortDescription: input.shortDescription?.trim() || null,
    description: input.description?.trim() || null,
    isFeatured: input.isFeatured ?? false,
    specifications: (input.specifications ?? []).filter((row) => row.label.trim() && row.value.trim()) as Prisma.InputJsonValue,
    careInstructions: input.careInstructions?.trim() || null,
    shippingNote: input.shippingNote?.trim() || null,
    seoTitle: input.seoTitle?.trim() || null,
    seoDescription: input.seoDescription?.trim() || null,
  };

  try {
    const productId = await db.$transaction(
      async (tx) => {
        const product = existing
          ? await tx.product.update({
              where: { id: existing.id },
              data: { ...data, publishedAt: input.status === ProductStatus.ACTIVE ? (existing.publishedAt ?? new Date()) : existing.publishedAt },
            })
          : await tx.product.create({
              data: { ...data, publishedAt: input.status === ProductStatus.ACTIVE ? new Date() : null },
            });

        // New catalogue products appear in the platform-run demo store, which showcases the whole catalogue.
        if (!existing) {
          const platformStores = await tx.store.findMany({ where: { ownerId: null, deletedAt: null }, select: { id: true } });
          if (platformStores.length) await tx.storeProduct.createMany({ data: platformStores.map((store) => ({ storeId: store.id, productId: product.id })), skipDuplicates: true });
        }

        await tx.productCategory.deleteMany({ where: { productId: product.id } });
        if (categoryIds.length) await tx.productCategory.createMany({ data: categoryIds.map((categoryId) => ({ productId: product.id, categoryId })) });

        if (input.collectionIds) {
          await tx.collectionProduct.deleteMany({ where: { productId: product.id, collectionId: { notIn: input.collectionIds } } });
          for (const collectionId of input.collectionIds) {
            await tx.collectionProduct.upsert({
              where: { collectionId_productId: { collectionId, productId: product.id } },
              create: { collectionId, productId: product.id },
              update: {},
            });
          }
        }

        if (input.tags) {
          const tagIds: string[] = [];
          for (const name of new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))) {
            const tag = await tx.tag.upsert({ where: { slug: slugify(name) }, create: { name, slug: slugify(name) }, update: {} });
            tagIds.push(tag.id);
          }
          await tx.productTag.deleteMany({ where: { productId: product.id } });
          if (tagIds.length) await tx.productTag.createMany({ data: tagIds.map((tagId) => ({ productId: product.id, tagId })) });
        }

        if (input.images) {
          await tx.productImage.deleteMany({ where: { productId: product.id } });
          const unique = input.images.filter((image, index, all) => all.findIndex((other) => other.mediaId === image.mediaId) === index);
          if (unique.length) {
            await tx.productImage.createMany({
              data: unique.map((image, position) => ({ productId: product.id, mediaId: image.mediaId, position, alt: image.alt?.trim() || null })),
            });
          }
        }

        if (input.attributeValueIds) {
          await tx.productAttributeValue.deleteMany({ where: { productId: product.id } });
          if (input.attributeValueIds.length) {
            await tx.productAttributeValue.createMany({
              data: [...new Set(input.attributeValueIds)].map((attributeValueId) => ({ productId: product.id, attributeValueId })),
            });
          }
        }

        // Variants: update matched, create new, remove missing.
        const keepIds = new Set(input.variants.map((variant) => variant.id).filter(Boolean) as string[]);
        const removed = (existing?.variants ?? []).filter((variant) => !keepIds.has(variant.id)).map((variant) => variant.id);
        if (removed.length) await tx.productVariant.deleteMany({ where: { id: { in: removed }, productId: product.id } });

        for (const [position, variant] of input.variants.entries()) {
          const optionValueIds = [...new Set(variant.optionValueIds ?? [])];
          const variantData = {
            sku: variant.sku?.trim() || null,
            barcode: variant.barcode?.trim() || null,
            title: await variantTitle(tx, optionValueIds),
            priceCents: variant.priceCents,
            salePriceCents: variant.salePriceCents ?? null,
            costCents: variant.costCents ?? null,
            lowStockThreshold: variant.lowStockThreshold ?? 5,
            trackInventory: variant.trackInventory ?? true,
            allowBackorder: variant.allowBackorder ?? false,
            weightGrams: variant.weightGrams ?? null,
            lengthMm: variant.lengthMm ?? null,
            widthMm: variant.widthMm ?? null,
            heightMm: variant.heightMm ?? null,
            imageId: variant.imageMediaId ?? null,
            position,
            isDefault: position === 0,
            isActive: variant.isActive ?? true,
          };
          const current = variant.id ? await tx.productVariant.findFirst({ where: { id: variant.id, productId: product.id } }) : null;
          if (current) {
            await tx.productVariant.update({ where: { id: current.id }, data: variantData });
            await tx.variantOptionValue.deleteMany({ where: { variantId: current.id } });
            if (optionValueIds.length) await tx.variantOptionValue.createMany({ data: optionValueIds.map((attributeValueId) => ({ variantId: current.id, attributeValueId })) });
            if (current.stockQuantity !== variant.stockQuantity) {
              await adjustInventory(tx, {
                variantId: current.id,
                delta: variant.stockQuantity - current.stockQuantity,
                reason: options.inventoryReason ?? InventoryReason.ADJUSTMENT,
                note: "Updated from product editor",
                actorId: options.actorId,
              });
            }
          } else {
            const created = await tx.productVariant.create({ data: { ...variantData, productId: product.id, stockQuantity: 0 } });
            if (optionValueIds.length) await tx.variantOptionValue.createMany({ data: optionValueIds.map((attributeValueId) => ({ variantId: created.id, attributeValueId })) });
            if (variant.stockQuantity !== 0) {
              await adjustInventory(tx, {
                variantId: created.id,
                delta: variant.stockQuantity,
                reason: options.inventoryReason ?? InventoryReason.INITIAL,
                actorId: options.actorId,
              });
            }
          }
        }

        await recomputeProductAggregates(product.id, tx);
        return product.id;
      },
      { timeout: 30_000 },
    );

    await getSearchProvider().indexProduct(productId);
    return db.product.findUniqueOrThrow({ where: { id: productId } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = String((error.meta as { target?: unknown } | undefined)?.target ?? "");
      if (target.includes("sku")) {
        throw new DomainError("DUPLICATE_SKU", "One of these SKUs is already used by another product.", { fieldErrors: { variants: ["SKU already in use."] } });
      }
    }
    throw error;
  }
}

export async function duplicateProduct(productId: string, actorId?: string | null) {
  const source = await db.product.findUniqueOrThrow({
    where: { id: productId },
    include: {
      categories: true,
      collections: true,
      tags: { include: { tag: true } },
      images: { orderBy: { position: "asc" } },
      attributeValues: true,
      variants: { orderBy: { position: "asc" }, include: { options: true } },
    },
  });
  return saveProduct(
    {
      name: `${source.name} (copy)`,
      slug: `${source.slug}-copy`,
      status: ProductStatus.DRAFT,
      brandId: source.brandId,
      primaryCategoryId: source.primaryCategoryId,
      categoryIds: source.categories.map((entry) => entry.categoryId),
      collectionIds: source.collections.map((entry) => entry.collectionId),
      tags: source.tags.map((entry) => entry.tag.name),
      shortDescription: source.shortDescription,
      description: source.description,
      isFeatured: false,
      specifications: source.specifications as Array<{ label: string; value: string }>,
      careInstructions: source.careInstructions,
      shippingNote: source.shippingNote,
      seoTitle: source.seoTitle,
      seoDescription: source.seoDescription,
      images: source.images.map((image) => ({ mediaId: image.mediaId, alt: image.alt })),
      attributeValueIds: source.attributeValues.map((entry) => entry.attributeValueId),
      variants: source.variants.map((variant) => ({
        sku: null,
        barcode: null,
        priceCents: variant.priceCents,
        salePriceCents: variant.salePriceCents,
        costCents: variant.costCents,
        stockQuantity: 0,
        lowStockThreshold: variant.lowStockThreshold,
        trackInventory: variant.trackInventory,
        allowBackorder: variant.allowBackorder,
        weightGrams: variant.weightGrams,
        lengthMm: variant.lengthMm,
        widthMm: variant.widthMm,
        heightMm: variant.heightMm,
        imageMediaId: variant.imageId,
        optionValueIds: variant.options.map((option) => option.attributeValueId),
        isActive: variant.isActive,
      })),
    },
    { actorId },
  );
}

/** Products referenced by orders are archived (history keeps working); unused drafts are deleted. */
export async function removeProduct(productId: string) {
  const orderCount = await db.orderItem.count({ where: { productId } });
  if (orderCount > 0) {
    await db.product.update({ where: { id: productId }, data: { status: ProductStatus.ARCHIVED, deletedAt: new Date() } });
    await getSearchProvider().removeProduct(productId);
    return { archived: true };
  }
  await db.product.delete({ where: { id: productId } });
  return { archived: false };
}
