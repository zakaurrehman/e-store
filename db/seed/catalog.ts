import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AttributeType, CollectionRule, ProductStatus } from "@/generated/prisma/enums";
import { saveProduct } from "@/features/catalog/service";
import { ingestImage } from "@/features/media/service";
import { db } from "@/server/db";
import { slugify } from "@/utils/slug";
import { PRODUCTS, type SeedProduct } from "./data/products";
import { ATTRIBUTES, BRANDS, CATEGORIES, COLLECTIONS } from "./data/taxonomy";

const CACHE_DIR = path.resolve(process.cwd(), ".cache/seed-media");

type PhotoVariant = "full" | "detail" | "wide";

function photoUrl(id: string, variant: PhotoVariant) {
  const base = `https://images.unsplash.com/photo-${id}?q=85&fm=jpg`;
  if (variant === "detail") return `${base}&w=1400&h=1750&fit=crop&crop=focalpoint&fp-x=0.5&fp-y=0.5&fp-z=1.7`;
  if (variant === "wide") return `${base}&w=2400&fit=max`;
  return `${base}&w=1800&fit=max`;
}

async function downloadPhoto(id: string, variant: PhotoVariant) {
  await mkdir(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, `${id}-${variant}.jpg`);
  try {
    return await readFile(file);
  } catch {
    // not cached yet
  }
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(photoUrl(id, variant), { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const type = response.headers.get("content-type") ?? "";
      if (!type.startsWith("image/")) throw new Error(`Unexpected content-type ${type}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      await writeFile(file, buffer);
      return buffer;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw new Error(`Failed to download photo ${id} (${variant}): ${String(lastError)}`);
}

export async function ingestPhoto(id: string, variant: PhotoVariant, alt: string, folder: string) {
  const buffer = await downloadPhoto(id, variant);
  return ingestImage({
    buffer,
    filename: `${slugify(alt).slice(0, 60)}-${variant}.jpg`,
    folder,
    alt,
    credit: `Photo via Unsplash (photo-${id})`,
    maxDimension: variant === "wide" ? 2400 : 2000,
  });
}

async function seedAttributes() {
  const valueIds = new Map<string, string>(); // `${attributeSlug}:${valueSlug}` → id
  for (const [position, attribute] of ATTRIBUTES.entries()) {
    const record = await db.attribute.upsert({
      where: { slug: attribute.slug },
      create: {
        slug: attribute.slug,
        name: attribute.name,
        type: attribute.type === "COLOR" ? AttributeType.COLOR : AttributeType.SELECT,
        isVariantOption: attribute.isVariantOption,
        isFilterable: attribute.isFilterable,
        position,
      },
      update: {},
    });
    for (const [index, entry] of attribute.values.entries()) {
      const value = typeof entry === "string" ? entry : entry.value;
      const hex = typeof entry === "string" ? null : entry.hex;
      const slug = slugify(value);
      const saved = await db.attributeValue.upsert({
        where: { attributeId_slug: { attributeId: record.id, slug } },
        create: { attributeId: record.id, value, slug, colorHex: hex, position: index },
        update: {},
      });
      valueIds.set(`${attribute.slug}:${slug}`, saved.id);
    }
  }
  return valueIds;
}

async function seedBrands() {
  const ids = new Map<string, string>();
  for (const [position, brand] of BRANDS.entries()) {
    const record = await db.brand.upsert({
      where: { slug: brand.slug },
      create: { slug: brand.slug, name: brand.name, description: brand.description, story: brand.story, isFeatured: !!brand.featured, position },
      update: {},
    });
    ids.set(brand.slug, record.id);
  }
  return ids;
}

async function seedCategories() {
  const ids = new Map<string, string>();
  for (const [position, category] of CATEGORIES.entries()) {
    const image = category.photo ? await ingestPhoto(category.photo, "full", `${category.name} at Zendropship`, "categories") : null;
    const parent = await db.category.upsert({
      where: { slug: category.slug },
      create: { slug: category.slug, name: category.name, description: category.description, position, imageId: image?.id },
      update: {},
    });
    ids.set(category.slug, parent.id);
    for (const [childPosition, child] of (category.children ?? []).entries()) {
      const record = await db.category.upsert({
        where: { slug: child.slug },
        create: { slug: child.slug, name: child.name, description: child.description, parentId: parent.id, position: childPosition },
        update: {},
      });
      ids.set(child.slug, record.id);
    }
  }
  return ids;
}

async function seedCollections() {
  const ids = new Map<string, string>();
  for (const [position, collection] of COLLECTIONS.entries()) {
    const record = await db.collection.upsert({
      where: { slug: collection.slug },
      create: { slug: collection.slug, name: collection.name, description: collection.description, rule: collection.rule as CollectionRule, position },
      update: {},
    });
    ids.set(collection.slug, record.id);
  }
  return ids;
}

function brandCode(slug: string) {
  return slug
    .split("-")
    .filter((part) => part !== "and")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 3);
}

async function seedProduct(
  product: SeedProduct,
  index: number,
  refs: { values: Map<string, string>; brands: Map<string, string>; categories: Map<string, string>; collections: Map<string, string> },
) {
  const [primary, ...rest] = product.photos;
  const images = [await ingestPhoto(primary, "full", product.alt, "products")];
  if (rest.length) {
    for (const id of rest) images.push(await ingestPhoto(id, "full", product.alt, "products"));
  } else if (!product.noDetail) {
    images.push(await ingestPhoto(primary, "detail", `${product.alt} — detail`, "products"));
  }

  const code = `VY-${brandCode(product.brand)}-${String(index + 1).padStart(3, "0")}`;
  const cents = (dollars: number) => Math.round(dollars * 100);
  const variants = product.option
    ? product.option.values.map((entry) => {
        const option = typeof entry === "string" ? { value: entry } : entry;
        const valueId = refs.values.get(`${product.option!.attribute}:${slugify(option.value)}`);
        if (!valueId) throw new Error(`Unknown option value ${product.option!.attribute}:${option.value} for ${product.name}`);
        const price = option.price ?? product.price;
        const sale = option.sale ?? (product.sale !== undefined && option.price === undefined ? product.sale : undefined);
        return {
          sku: `${code}-${slugify(option.value).toUpperCase()}`,
          priceCents: cents(price),
          salePriceCents: sale !== undefined ? cents(sale) : null,
          stockQuantity: option.stock ?? product.stock ?? 10,
          weightGrams: product.weight ?? 500,
          optionValueIds: [valueId],
        };
      })
    : [
        {
          sku: code,
          priceCents: cents(product.price),
          salePriceCents: product.sale !== undefined ? cents(product.sale) : null,
          stockQuantity: product.stock ?? 10,
          weightGrams: product.weight ?? 500,
          optionValueIds: [],
        },
      ];

  const attributeValueIds = [
    ...(product.colours ?? []).map((value) => refs.values.get(`colour:${slugify(value)}`)),
    ...(product.materials ?? []).map((value) => refs.values.get(`material:${slugify(value)}`)),
  ].filter(Boolean) as string[];

  const categoryIds = product.categories.map((slug) => {
    const id = refs.categories.get(slug);
    if (!id) throw new Error(`Unknown category ${slug} for ${product.name}`);
    return id;
  });
  // Also list products in the parent department so department pages include them.
  const parents = await db.category.findMany({ where: { id: { in: categoryIds } }, select: { parentId: true } });
  const allCategoryIds = [...categoryIds, ...parents.map((category) => category.parentId).filter(Boolean)] as string[];

  const collectionIds = product.gift ? [refs.collections.get("the-gift-edit")!] : [];

  const saved = await saveProduct(
    {
      name: product.name,
      status: ProductStatus.ACTIVE,
      brandId: refs.brands.get(product.brand) ?? null,
      primaryCategoryId: categoryIds[0],
      categoryIds: allCategoryIds,
      collectionIds,
      tags: product.tags,
      shortDescription: product.short,
      description: product.description,
      isFeatured: !!product.featured,
      specifications: product.specs.map(([label, value]) => ({ label, value })),
      careInstructions: product.care ?? null,
      seoTitle: null,
      seoDescription: product.short,
      images: images.map((image, position) => ({ mediaId: image.id, alt: position === 0 ? product.alt : `${product.alt} — detail` })),
      attributeValueIds,
      variants,
    },
    {},
  );

  const createdAt = new Date(Date.now() - product.daysAgo * 24 * 60 * 60 * 1000);
  await db.product.update({ where: { id: saved.id }, data: { createdAt, publishedAt: createdAt } });
  return saved;
}

export async function seedCatalog() {
  const existing = await db.product.count();
  if (existing > 0) {
    console.log(`• catalog: ${existing} products already present — skipped`);
    return;
  }
  const started = Date.now();
  const values = await seedAttributes();
  const brands = await seedBrands();
  const categories = await seedCategories();
  const collections = await seedCollections();
  console.log(`✓ taxonomy: ${ATTRIBUTES.length} attributes, ${BRANDS.length} brands, ${categories.size} categories, ${collections.size} collections`);

  // Download in small parallel batches; save sequentially to keep the ledger ordered.
  const refs = { values, brands, categories, collections };
  const batchSize = 4;
  for (let index = 0; index < PRODUCTS.length; index += batchSize) {
    const batch = PRODUCTS.slice(index, index + batchSize);
    await Promise.all(
      batch.flatMap((product) =>
        product.photos.length > 1
          ? product.photos.map((id) => downloadPhoto(id, "full"))
          : product.noDetail
            ? [downloadPhoto(product.photos[0], "full")]
            : [downloadPhoto(product.photos[0], "full"), downloadPhoto(product.photos[0], "detail")],
      ),
    );
    for (const [offset, product] of batch.entries()) {
      await seedProduct(product, index + offset, refs);
    }
    process.stdout.write(`\r  products ${Math.min(index + batchSize, PRODUCTS.length)}/${PRODUCTS.length}`);
  }
  process.stdout.write("\n");
  console.log(`✓ catalog: ${PRODUCTS.length} products in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}
