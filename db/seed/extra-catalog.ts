import "dotenv/config";
import { ProductStatus } from "@/generated/prisma/enums";
import { saveProduct } from "@/features/catalog/service";
import { db } from "@/server/db";
import { slugify } from "@/utils/slug";
import { ingestPhoto } from "./catalog";
import { EXTRA_PRODUCTS } from "./data/extra-products";
import type { SeedProduct } from "./data/products";

/**
 * Second catalogue drop (bags, accessories, watches, jewellery) added on top of the launch catalogue.
 * Run with `npm run db:seed:extra`. It uses the same `saveProduct` service the admin and the launch seed use,
 * so these products behave exactly like every other catalogue product. Safe to re-run: a product whose slug
 * already exists is skipped, so nothing is duplicated.
 */

/** This writes to the database and downloads images — only ever against a local development database. */
function assertLocalDatabase() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run: NODE_ENV=production.");
  let host = "";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    throw new Error("DATABASE_URL is not set or not a valid URL.");
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(`Refusing to run against "${host}": db:seed:extra only runs against a local database. Import to production through Admin → Import & export.`);
  }
}

/** Matches brandCode() in catalog.ts so SKUs read the same as the launch catalogue (e.g. VY-FL-…). */
function brandCode(slug: string) {
  return slug
    .split("-")
    .filter((part) => part !== "and")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 3);
}

type Refs = { values: Map<string, string>; brands: Map<string, string>; categories: Map<string, string>; collections: Map<string, string> };

async function loadRefs(): Promise<Refs> {
  const [values, brands, categories, collections] = await Promise.all([
    db.attributeValue.findMany({ select: { id: true, slug: true, attribute: { select: { slug: true } } } }),
    db.brand.findMany({ select: { slug: true, id: true } }),
    db.category.findMany({ select: { slug: true, id: true } }),
    db.collection.findMany({ select: { slug: true, id: true } }),
  ]);
  return {
    values: new Map(values.map((row) => [`${row.attribute.slug}:${row.slug}`, row.id])),
    brands: new Map(brands.map((row) => [row.slug, row.id])),
    categories: new Map(categories.map((row) => [row.slug, row.id])),
    collections: new Map(collections.map((row) => [row.slug, row.id])),
  };
}

const cents = (dollars: number) => Math.round(dollars * 100);
// Sample catalogue only: wholesale at 55% of the selling price, matching the launch catalogue. A real supplier feed provides the actual cost.
const sampleWholesale = (dollars: number) => Math.round(dollars * 100 * 0.55);

async function seedExtraProduct(product: SeedProduct, index: number, refs: Refs) {
  const slug = slugify(product.name);
  const existing = await db.product.findUnique({ where: { slug }, select: { id: true } });
  if (existing) return "skipped" as const;

  const [primary, ...rest] = product.photos;
  const images = [await ingestPhoto(primary, "full", product.alt, "products")];
  if (rest.length) {
    for (const id of rest) images.push(await ingestPhoto(id, "full", product.alt, "products"));
  } else if (!product.noDetail) {
    images.push(await ingestPhoto(primary, "detail", `${product.alt} — detail`, "products"));
  }

  const code = `VY-${brandCode(product.brand)}-G${String(index + 1).padStart(2, "0")}`;
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
          costCents: sampleWholesale(sale ?? price),
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
          costCents: sampleWholesale(product.sale ?? product.price),
          stockQuantity: product.stock ?? 10,
          weightGrams: product.weight ?? 500,
          optionValueIds: [],
        },
      ];

  const attributeValueIds = [
    ...(product.colours ?? []).map((value) => refs.values.get(`colour:${slugify(value)}`)),
    ...(product.materials ?? []).map((value) => refs.values.get(`material:${slugify(value)}`)),
  ].filter(Boolean) as string[];

  const categoryIds = product.categories.map((entry) => {
    const id = refs.categories.get(entry);
    if (!id) throw new Error(`Unknown category ${entry} for ${product.name}`);
    return id;
  });
  const parents = await db.category.findMany({ where: { id: { in: categoryIds } }, select: { parentId: true } });
  const allCategoryIds = [...categoryIds, ...parents.map((category) => category.parentId).filter(Boolean)] as string[];

  const collectionIds = product.gift ? [refs.collections.get("the-gift-edit")!].filter(Boolean) : [];

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
  return "created" as const;
}

export async function seedExtraCatalog() {
  assertLocalDatabase();
  const refs = await loadRefs();
  const started = Date.now();
  let created = 0;
  let skipped = 0;
  for (const [index, product] of EXTRA_PRODUCTS.entries()) {
    const result = await seedExtraProduct(product, index, refs);
    if (result === "created") created += 1;
    else skipped += 1;
    process.stdout.write(`\r  products ${index + 1}/${EXTRA_PRODUCTS.length} (created ${created}, skipped ${skipped})`);
  }
  process.stdout.write("\n");
  console.log(`✓ extra catalog: ${created} created, ${skipped} already present in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

seedExtraCatalog()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
