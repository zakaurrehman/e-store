import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolveSiteUrl } from "@/lib/site-url";
import type { Prisma } from "@/generated/prisma/client";
import { AttributeType, InventoryReason, ProductStatus } from "@/generated/prisma/enums";
import { saveProduct, type VariantInput } from "@/features/catalog/service";
import { ingestImage } from "@/features/media/service";
import { db } from "@/server/db";
import { slugify } from "@/utils/slug";
import type { ImportSource, SourceProduct } from "./sources";

export type ImportEntity = "categories" | "products" | "images" | "all";

export type ImportOptions = {
  source: ImportSource;
  entity: ImportEntity;
  dryRun?: boolean;
  /** Import products as drafts so they can be reviewed before going live. */
  asDraft?: boolean;
  /** Skip image downloads (faster; images can be imported later with entity "images"). */
  skipImages?: boolean;
  actorId?: string | null;
  log?: (message: string) => void;
};

export type ImportStats = { categories: { created: number; updated: number; skipped: number }; products: { created: number; updated: number; skipped: number; failed: number }; images: { downloaded: number; reused: number; failed: number }; brands: { created: number } };

const checksum = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function fetchImage(url: string): Promise<{ buffer: Buffer; filename: string }> {
  if (url.startsWith("file:")) {
    const path = url.slice(5);
    return { buffer: await readFile(path), filename: path.split(/[\\/]/).pop() ?? "image" };
  }
  const response = await fetch(url, { headers: { "User-Agent": "Zendropship-Importer/1.0" }, signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = response.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) throw new Error(`Not an image (${type})`);
  return { buffer: Buffer.from(await response.arrayBuffer()), filename: new URL(url).pathname.split("/").pop() ?? "image" };
}

/**
 * Idempotent import runner. Every external record is mapped to a Zendropship entity through ImportRecord,
 * so re-running never duplicates products, categories or images; unchanged records are skipped by checksum.
 */
export async function runImport(options: ImportOptions): Promise<{ runId: string | null; stats: ImportStats }> {
  const { source, entity, dryRun = false, log = () => {} } = options;
  const stats: ImportStats = { categories: { created: 0, updated: 0, skipped: 0 }, products: { created: 0, updated: 0, skipped: 0, failed: 0 }, images: { downloaded: 0, reused: 0, failed: 0 }, brands: { created: 0 } };
  const run = dryRun ? null : await db.importRun.create({ data: { source: source.key, entity, dryRun } });
  const runId = run?.id ?? null;

  const record = async (externalType: string, externalId: string, entityId: string, sum: string) => {
    if (dryRun) return;
    await db.importRecord.upsert({
      where: { source_externalType_externalId: { source: source.key, externalType, externalId } },
      create: { source: source.key, externalType, externalId, entityId, checksum: sum, lastRunId: runId },
      update: { entityId, checksum: sum, lastRunId: runId },
    });
  };
  const lookup = async (externalType: string, externalId: string) => db.importRecord.findUnique({ where: { source_externalType_externalId: { source: source.key, externalType, externalId } } });

  const imageCache = new Map<string, string | null>();
  const importImage = async (url: string, alt: string, folder: string): Promise<string | null> => {
    if (imageCache.has(url)) return imageCache.get(url)!;
    // Our own media (e.g. from a Zendropship CSV export) maps straight back to the existing asset.
    const appUrl = resolveSiteUrl();
    const ownUrls = [url, ...(appUrl && url.startsWith(appUrl + "/") ? [url.slice(appUrl.length)] : [])];
    const own = await db.mediaAsset.findFirst({ where: { url: { in: ownUrls }, deletedAt: null }, select: { id: true } });
    if (own) {
      stats.images.reused++;
      imageCache.set(url, own.id);
      return own.id;
    }
    const existing = await lookup("image", url);
    if (existing) {
      const asset = await db.mediaAsset.findUnique({ where: { id: existing.entityId }, select: { id: true, deletedAt: true } });
      if (asset && !asset.deletedAt) {
        stats.images.reused++;
        imageCache.set(url, asset.id);
        return asset.id;
      }
    }
    if (dryRun) {
      stats.images.downloaded++;
      return null;
    }
    try {
      const { buffer, filename } = await fetchImage(url);
      const asset = await ingestImage({ buffer, filename, folder, alt, credit: `Imported from ${source.key}`, uploadedById: options.actorId ?? null });
      await record("image", url, asset.id, checksum(url));
      stats.images.downloaded++;
      imageCache.set(url, asset.id);
      return asset.id;
    } catch (error) {
      stats.images.failed++;
      log(`  ! image failed ${url}: ${error instanceof Error ? error.message : String(error)}`);
      imageCache.set(url, null);
      return null;
    }
  };

  try {
    // ── Categories ────────────────────────────────────────────────────────
    const categoryIdByExternal = new Map<string, string>();
    const sourceCategories = await source.categories();
    if (entity === "categories" || entity === "all" || entity === "products") {
      log(`Categories: ${sourceCategories.length} in source`);
      // Parents first so children can link to them.
      const ordered = [...sourceCategories].sort((a, b) => Number(!!a.parentExternalId) - Number(!!b.parentExternalId));
      for (const category of ordered) {
        const existing = await lookup("category", category.externalId);
        const sum = checksum(category);
        const parentId = category.parentExternalId ? (categoryIdByExternal.get(category.parentExternalId) ?? null) : null;
        if (existing) {
          const current = await db.category.findUnique({ where: { id: existing.entityId } });
          if (current) {
            categoryIdByExternal.set(category.externalId, current.id);
            if (existing.checksum === sum) {
              stats.categories.skipped++;
              continue;
            }
            if (!dryRun) {
              await db.category.update({ where: { id: current.id }, data: { name: category.name, description: category.description || current.description, parentId: parentId ?? current.parentId, deletedAt: null } });
              await record("category", category.externalId, current.id, sum);
            }
            stats.categories.updated++;
            continue;
          }
        }
        // Match an existing category by slug/name before creating (e.g. hand-made taxonomy).
        const slug = slugify(category.slug ?? category.name);
        const match = await db.category.findFirst({ where: { OR: [{ slug }, { name: { equals: category.name, mode: "insensitive" } }], deletedAt: null } });
        if (match) {
          categoryIdByExternal.set(category.externalId, match.id);
          await record("category", category.externalId, match.id, sum);
          stats.categories.skipped++;
          continue;
        }
        if (dryRun) {
          stats.categories.created++;
          continue;
        }
        const imageId = category.imageUrl && entity === "all" && !options.skipImages ? await importImage(category.imageUrl, category.name, "categories") : null;
        const created = await db.category.create({ data: { name: category.name, slug: await uniqueCategorySlug(slug), description: category.description || null, parentId, imageId, position: await db.category.count({ where: { parentId } }) } });
        categoryIdByExternal.set(category.externalId, created.id);
        await record("category", category.externalId, created.id, sum);
        stats.categories.created++;
        log(`  + category ${category.name}`);
      }
    }

    // ── Products ──────────────────────────────────────────────────────────
    if (entity === "products" || entity === "all" || entity === "images") {
      const products = await source.products();
      log(`Products: ${products.length} in source`);
      for (const product of products) {
        try {
          await importProduct(product);
        } catch (error) {
          stats.products.failed++;
          log(`  ! ${product.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    async function uniqueCategorySlug(base: string) {
      let candidate = base;
      let suffix = 2;
      while (await db.category.findUnique({ where: { slug: candidate } })) candidate = `${base}-${suffix++}`;
      return candidate;
    }

    async function brandId(name: string | null | undefined) {
      if (!name) return null;
      const slug = slugify(name);
      const existing = await db.brand.findFirst({ where: { OR: [{ slug }, { name: { equals: name, mode: "insensitive" } }] } });
      if (existing) return existing.id;
      if (dryRun) {
        stats.brands.created++;
        return null;
      }
      const created = await db.brand.create({ data: { name, slug, position: await db.brand.count() } });
      stats.brands.created++;
      return created.id;
    }

    async function attributeValueId(attributeName: string, value: string, isVariantOption: boolean) {
      const attributeSlug = slugify(attributeName);
      const valueSlug = slugify(value);
      if (dryRun) return null;
      const attribute = await db.attribute.upsert({ where: { slug: attributeSlug }, create: { name: attributeName, slug: attributeSlug, type: /colou?r/i.test(attributeName) ? AttributeType.COLOR : AttributeType.SELECT, isVariantOption, position: await db.attribute.count() }, update: {} });
      const saved = await db.attributeValue.upsert({ where: { attributeId_slug: { attributeId: attribute.id, slug: valueSlug } }, create: { attributeId: attribute.id, value, slug: valueSlug, position: await db.attributeValue.count({ where: { attributeId: attribute.id } }) }, update: {} });
      return saved.id;
    }

    async function importProduct(product: SourceProduct) {
      const sum = checksum(product);
      const existing = await lookup("product", product.externalId);
      const include = { variants: { include: { options: true } }, images: true } as const;
      let current = existing ? await db.product.findUnique({ where: { id: existing.entityId }, include }) : null;
      if (!current && source.matchExistingBySlug && product.slug) current = await db.product.findFirst({ where: { slug: product.slug, deletedAt: null }, include });
      if (current && existing?.checksum === sum && entity !== "images") {
        stats.products.skipped++;
        return;
      }
      if (dryRun) {
        if (current) stats.products.updated++;
        else stats.products.created++;
        for (const url of product.imageUrls) await importImage(url, product.name, "products");
        return;
      }

      const wantImages = !options.skipImages && (entity === "all" || entity === "images" || entity === "products");
      const images: Array<{ mediaId: string; alt?: string | null }> = [];
      if (wantImages) {
        for (const url of product.imageUrls) {
          const mediaId = await importImage(url, product.name, "products");
          if (mediaId && !images.some((image) => image.mediaId === mediaId)) images.push({ mediaId, alt: product.name });
        }
      } else if (current) {
        images.push(...current.images.sort((a, b) => a.position - b.position).map((image) => ({ mediaId: image.mediaId, alt: image.alt })));
      }
      if (entity === "images" && current) {
        if (images.length) {
          await db.productImage.deleteMany({ where: { productId: current.id } });
          await db.productImage.createMany({ data: images.map((image, position) => ({ productId: current.id, mediaId: image.mediaId, position, alt: image.alt ?? null })) });
          stats.products.updated++;
        } else stats.products.skipped++;
        return;
      }

      const categoryIds: string[] = [];
      for (const externalId of product.categoryExternalIds) {
        const id = categoryIdByExternal.get(externalId) ?? (await lookup("category", externalId))?.entityId ?? (await db.category.findFirst({ where: { slug: slugify(externalId), deletedAt: null } }))?.id;
        if (id) categoryIds.push(id);
      }
      if (categoryIds.length === 0 && product.categoryNames?.length) {
        for (const name of product.categoryNames) {
          const match = await db.category.findFirst({ where: { name: { equals: name, mode: "insensitive" }, deletedAt: null } });
          if (match) categoryIds.push(match.id);
        }
      }
      const primaryCategoryId = (product.primaryCategoryExternalId && (categoryIdByExternal.get(product.primaryCategoryExternalId) ?? (await lookup("category", product.primaryCategoryExternalId))?.entityId)) || categoryIds[0] || null;

      const attributeValueIds: string[] = [];
      for (const [attribute, value] of product.attributes ?? []) {
        const id = await attributeValueId(attribute, value, false);
        if (id) attributeValueIds.push(id);
      }

      const collectionIds: string[] = [];
      for (const slug of product.collections ?? []) {
        const collection = await db.collection.findFirst({ where: { OR: [{ slug }, { name: { equals: slug, mode: "insensitive" } }], deletedAt: null }, select: { id: true } });
        if (collection) collectionIds.push(collection.id);
      }

      const variants: VariantInput[] = [];
      for (const variant of product.variants) {
        const optionValueIds: string[] = [];
        for (const [attribute, value] of variant.options) {
          const id = await attributeValueId(attribute, value, true);
          if (id) optionValueIds.push(id);
        }
        const existingVariant = current?.variants.find((candidate) => candidate.id === variant.externalId) ?? current?.variants.find((candidate) => {
          const existingOptions = candidate.options.map((option) => option.attributeValueId).sort().join("|");
          return existingOptions === [...optionValueIds].sort().join("|") || (variant.sku && candidate.sku === variant.sku);
        });
        const imageMediaId = variant.imageUrl && wantImages ? await importImage(variant.imageUrl, product.name, "products") : (existingVariant?.imageId ?? null);
        variants.push({
          id: existingVariant?.id,
          sku: variant.sku ?? null,
          barcode: variant.barcode ?? null,
          priceCents: variant.priceCents,
          salePriceCents: variant.salePriceCents ?? null,
          costCents: variant.costCents ?? null,
          stockQuantity: variant.stockQuantity ?? existingVariant?.stockQuantity ?? 0,
          lowStockThreshold: variant.lowStockThreshold ?? existingVariant?.lowStockThreshold ?? 5,
          trackInventory: variant.trackInventory ?? (variant.stockQuantity !== null),
          allowBackorder: variant.allowBackorder ?? false,
          weightGrams: variant.weightGrams ?? null,
          lengthMm: variant.lengthMm ?? null,
          widthMm: variant.widthMm ?? null,
          heightMm: variant.heightMm ?? null,
          imageMediaId: imageMediaId ?? null,
          optionValueIds,
          isActive: variant.isActive ?? true,
        });
      }

      const saved = await saveProduct(
        {
          name: product.name,
          slug: current ? current.slug : product.slug,
          status: options.asDraft ? ProductStatus.DRAFT : product.status === "ARCHIVED" ? ProductStatus.ARCHIVED : product.status === "DRAFT" ? ProductStatus.DRAFT : ProductStatus.ACTIVE,
          brandId: await brandId(product.brand),
          primaryCategoryId,
          categoryIds,
          collectionIds,
          tags: product.tags,
          shortDescription: product.shortDescription,
          description: product.description,
          isFeatured: product.featured ?? current?.isFeatured ?? false,
          specifications: product.specifications,
          careInstructions: product.careInstructions,
          shippingNote: product.shippingNote,
          seoTitle: product.seoTitle,
          seoDescription: product.seoDescription,
          images,
          attributeValueIds,
          variants,
        },
        { productId: current?.id, actorId: options.actorId, inventoryReason: InventoryReason.IMPORT },
      );
      await record("product", product.externalId, saved.id, sum);
      if (current) stats.products.updated++;
      else stats.products.created++;
      log(`  ${current ? "~" : "+"} ${product.name} (${variants.length} variant${variants.length === 1 ? "" : "s"})`);
    }

    if (run) await db.importRun.update({ where: { id: run.id }, data: { status: "COMPLETED", finishedAt: new Date(), stats: stats as unknown as Prisma.InputJsonValue } });
    return { runId, stats };
  } catch (error) {
    if (run) await db.importRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), error: error instanceof Error ? error.message : String(error), stats: stats as unknown as Prisma.InputJsonValue } });
    throw error;
  }
}
