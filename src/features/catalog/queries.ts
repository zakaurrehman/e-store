import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { CollectionRule, PaymentStatus, ProductStatus, ReviewStatus } from "@/generated/prisma/enums";
import { getSearchProvider } from "@/features/search/provider";
import type { StoreScope } from "@/features/stores/context";
import { storePriceFor, summarisePrices, SUGGESTED_PRICING, type StoreProductOverride } from "@/features/stores/pricing";
import { storeCatalogTag } from "@/features/stores/queries";
import { db } from "@/server/db";
import { PAGE_SIZE, type ListingFilters, type SortKey } from "./filters";

export const CATALOG_TAG = "catalog";
export const productTag = (slug: string) => `product:${slug}`;

const NEW_WINDOW_DAYS = 45;

/**
 * Every listing is either the platform catalogue (scope null: supplier's suggested prices, wholesale shown to
 * prospective owners) or one store's shelf (scope set: only products the owner added, at the store's prices).
 */
export type CatalogScope = StoreScope | null;

const scopeTags = (scope: CatalogScope) => (scope ? [CATALOG_TAG, storeCatalogTag(scope.id)] : [CATALOG_TAG]);

export const productCardSelect = {
  id: true,
  slug: true,
  name: true,
  priceCents: true,
  maxPriceCents: true,
  compareAtPriceCents: true,
  onSale: true,
  inStock: true,
  ratingAverage: true,
  ratingCount: true,
  publishedAt: true,
  brand: { select: { name: true, slug: true } },
  images: { orderBy: { position: "asc" }, take: 2, select: { alt: true, media: { select: { url: true, width: true, height: true, alt: true } } } },
  variants: { where: { isActive: true }, orderBy: { position: "asc" }, select: { id: true, priceCents: true, salePriceCents: true, costCents: true } },
} satisfies Prisma.ProductSelect;

/** Card select plus this store's pricing override for the product. */
const cardSelectFor = (scope: CatalogScope) =>
  scope
    ? ({ ...productCardSelect, storeProducts: { where: { storeId: scope.id }, select: { markupBps: true, fixedPriceCents: true } } } satisfies Prisma.ProductSelect)
    : productCardSelect;

type CardRow = Prisma.ProductGetPayload<{ select: typeof productCardSelect }> & { storeProducts?: Array<{ markupBps: number | null; fixedPriceCents: number | null }> };

export type CardImage = { url: string; alt: string; width: number; height: number };

export type ProductCardData = {
  id: string;
  slug: string;
  name: string;
  brand: { name: string; slug: string } | null;
  priceCents: number;
  maxPriceCents: number;
  compareAtPriceCents: number | null;
  onSale: boolean;
  inStock: boolean;
  ratingAverage: number;
  ratingCount: number;
  isNew: boolean;
  images: CardImage[];
  /** Set when the product has exactly one variant, enabling one-tap add to bag. */
  quickAddVariantId: string | null;
  /** Wholesale cost of the cheapest variant — shown to prospective store owners on the platform catalogue only. */
  costCents: number;
};

export function toProductCard(row: CardRow, scope: CatalogScope = null): ProductCardData {
  const newSince = Date.now() - NEW_WINDOW_DAYS * 86_400_000;
  const override: StoreProductOverride = row.storeProducts?.[0] ?? null;
  const priced = summarisePrices(row.variants.map((variant) => storePriceFor(variant, scope?.pricing ?? SUGGESTED_PRICING, override)));
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    priceCents: row.variants.length ? priced.priceCents : row.priceCents,
    maxPriceCents: row.variants.length ? priced.maxPriceCents : row.maxPriceCents,
    compareAtPriceCents: row.variants.length ? priced.compareAtPriceCents : row.compareAtPriceCents,
    onSale: row.variants.length ? priced.onSale : row.onSale,
    inStock: row.inStock,
    costCents: priced.costCents,
    ratingAverage: row.ratingAverage,
    ratingCount: row.ratingCount,
    isNew: !!row.publishedAt && row.publishedAt.getTime() > newSince,
    images: row.images.map((image) => ({
      url: image.media.url,
      alt: image.alt || image.media.alt || row.name,
      width: image.media.width ?? 1200,
      height: image.media.height ?? 1500,
    })),
    quickAddVariantId: row.variants.length === 1 ? row.variants[0].id : null,
  };
}

const visibleProduct = { status: ProductStatus.ACTIVE, deletedAt: null } satisfies Prisma.ProductWhereInput;

/** Sellable in this scope: the whole catalogue on the platform, or only what the owner put on the shelf. */
const visibleIn = (scope: CatalogScope): Prisma.ProductWhereInput =>
  scope ? { ...visibleProduct, storeProducts: { some: { storeId: scope.id, isActive: true } } } : visibleProduct;

// ─── Taxonomy ────────────────────────────────────────────────────────────────

export type NavCategory = { id: string; name: string; slug: string; imageUrl: string | null; children: Array<{ id: string; name: string; slug: string }> };

export async function getCategoryTree(scope: CatalogScope = null): Promise<NavCategory[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(...scopeTags(scope), "categories");
  const categories = await db.category.findMany({
    where: { parentId: null, isActive: true, deletedAt: null },
    orderBy: { position: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      image: { select: { url: true } },
      children: {
        where: { isActive: true, deletedAt: null, showInNav: true },
        orderBy: { position: "asc" },
        select: { id: true, name: true, slug: true },
      },
    },
  });
  const tree = categories.map((category) => ({ ...category, imageUrl: category.image?.url ?? null, image: undefined }));
  if (!scope) return tree;
  // A store's navigation only shows departments and sub-categories it actually stocks.
  const stocked = await db.productCategory.findMany({ where: { product: visibleIn(scope) }, select: { categoryId: true }, distinct: ["categoryId"] });
  const stockedIds = new Set(stocked.map((row) => row.categoryId));
  const parents = await db.category.findMany({ where: { id: { in: [...stockedIds] } }, select: { id: true, parentId: true } });
  for (const category of parents) if (category.parentId) stockedIds.add(category.parentId);
  return tree
    .map((category) => ({ ...category, children: category.children.filter((child) => stockedIds.has(child.id)) }))
    .filter((category) => stockedIds.has(category.id));
}

export async function getCategoryBySlug(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG, "categories");
  const category = await db.category.findFirst({
    where: { slug, isActive: true, deletedAt: null },
    include: {
      parent: { select: { id: true, name: true, slug: true, parent: { select: { name: true, slug: true } } } },
      children: { where: { isActive: true, deletedAt: null }, orderBy: { position: "asc" }, select: { id: true, name: true, slug: true } },
      image: { select: { url: true, alt: true } },
    },
  });
  return category;
}

async function descendantCategoryIds(rootIds: string[]) {
  const all = new Set(rootIds);
  let frontier = rootIds;
  for (let depth = 0; depth < 4 && frontier.length; depth++) {
    const children = await db.category.findMany({ where: { parentId: { in: frontier }, deletedAt: null, isActive: true }, select: { id: true } });
    frontier = children.map((child) => child.id).filter((id) => !all.has(id));
    frontier.forEach((id) => all.add(id));
  }
  return [...all];
}

export async function listBrands(scope: CatalogScope = null) {
  "use cache";
  cacheLife("hours");
  cacheTag(...scopeTags(scope), "brands");
  const brands = await db.brand.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      isFeatured: true,
      logo: { select: { url: true } },
      _count: { select: { products: { where: visibleIn(scope) } } },
    },
  });
  return brands
    .map((brand) => ({ ...brand, productCount: brand._count.products, logoUrl: brand.logo?.url ?? null }))
    .filter((brand) => !scope || brand.productCount > 0);
}

export async function getBrandBySlug(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG, "brands");
  return db.brand.findFirst({ where: { slug, isActive: true, deletedAt: null }, include: { logo: { select: { url: true } } } });
}

export async function getCollectionBySlug(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG, "collections");
  return db.collection.findFirst({ where: { slug, isActive: true, deletedAt: null }, include: { image: { select: { url: true, alt: true } } } });
}

// ─── Listings ────────────────────────────────────────────────────────────────

export type ListingScope = { categorySlug?: string; brandSlug?: string; collectionSlug?: string };

export type FacetValue = { slug: string; label: string; count: number; colorHex?: string | null };

export type ListingFacets = {
  categories: FacetValue[];
  brands: FacetValue[];
  attributes: Array<{ slug: string; name: string; type: string; values: FacetValue[] }>;
  price: { min: number; max: number };
  inStockCount: number;
  onSaleCount: number;
  ratingCounts: Record<number, number>;
};

export type ListingResult = {
  products: ProductCardData[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  facets: ListingFacets;
  correctedQuery: string | null;
};

function orderByFor(sort: SortKey): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "newest":
      return [{ publishedAt: "desc" }, { id: "asc" }];
    case "price-asc":
      return [{ priceCents: "asc" }, { id: "asc" }];
    case "price-desc":
      return [{ priceCents: "desc" }, { id: "asc" }];
    case "rating":
      return [{ ratingAverage: "desc" }, { ratingCount: "desc" }, { id: "asc" }];
    case "best-selling":
      return [{ salesCount: "desc" }, { ratingCount: "desc" }, { publishedAt: "desc" }];
    default:
      return [{ isFeatured: "desc" }, { salesCount: "desc" }, { publishedAt: "desc" }, { id: "asc" }];
  }
}

async function scopeWhere(scope: ListingScope, filters: ListingFilters, catalog: CatalogScope) {
  const and: Prisma.ProductWhereInput[] = [visibleIn(catalog)];
  let defaultSort: SortKey | null = null;
  let searchRank: Map<string, number> | null = null;
  let correctedQuery: string | null = null;

  if (scope.categorySlug) {
    const category = await db.category.findFirst({ where: { slug: scope.categorySlug, deletedAt: null }, select: { id: true } });
    const ids = category ? await descendantCategoryIds([category.id]) : [];
    and.push({ categories: { some: { categoryId: { in: ids } } } });
  }
  if (scope.brandSlug) and.push({ brand: { slug: scope.brandSlug } });
  if (scope.collectionSlug) {
    const collection = await db.collection.findFirst({ where: { slug: scope.collectionSlug, deletedAt: null } });
    if (!collection) and.push({ id: "__none__" });
    else {
      switch (collection.rule) {
        case CollectionRule.NEW_ARRIVALS:
          and.push({ publishedAt: { gte: new Date(Date.now() - 60 * 86_400_000) } });
          defaultSort = "newest";
          break;
        case CollectionRule.ON_SALE:
          and.push({ onSale: true });
          break;
        case CollectionRule.BEST_SELLERS:
          and.push({ salesCount: { gt: 0 } });
          defaultSort = "best-selling";
          break;
        case CollectionRule.TOP_RATED:
          and.push({ ratingCount: { gt: 0 }, ratingAverage: { gte: 4 } });
          defaultSort = "rating";
          break;
        case CollectionRule.FEATURED:
          and.push({ isFeatured: true });
          break;
        default:
          and.push({ collections: { some: { collectionId: collection.id } } });
      }
    }
  }
  if (filters.q) {
    const result = await getSearchProvider().search(filters.q);
    searchRank = new Map(result.hits.map((hit, index) => [hit.productId, index]));
    correctedQuery = result.correctedQuery;
    and.push({ id: { in: result.hits.map((hit) => hit.productId) } });
  }
  return { base: { AND: and } satisfies Prisma.ProductWhereInput, defaultSort, searchRank, correctedQuery };
}

function refinementWhere(filters: ListingFilters): Prisma.ProductWhereInput[] {
  const and: Prisma.ProductWhereInput[] = [];
  if (filters.categories.length) and.push({ categories: { some: { category: { slug: { in: filters.categories } } } } });
  if (filters.brands.length) and.push({ brand: { slug: { in: filters.brands } } });
  for (const [attribute, values] of Object.entries(filters.attributes)) {
    and.push({
      OR: [
        { attributeValues: { some: { attributeValue: { slug: { in: values }, attribute: { slug: attribute } } } } },
        { variants: { some: { isActive: true, options: { some: { attributeValue: { slug: { in: values }, attribute: { slug: attribute } } } } } } },
      ],
    });
  }
  if (filters.priceMin !== null) and.push({ priceCents: { gte: filters.priceMin } });
  if (filters.priceMax !== null) and.push({ priceCents: { lte: filters.priceMax } });
  if (filters.rating) and.push({ ratingAverage: { gte: filters.rating } });
  if (filters.inStock) and.push({ inStock: true });
  if (filters.onSale) and.push({ onSale: true });
  return and;
}

async function computeFacets(base: Prisma.ProductWhereInput, scope: ListingScope): Promise<ListingFacets> {
  const [brandGroups, priceAgg, inStockCount, onSaleCount, rating4, rating3, productValues, variantValues, attributes] = await Promise.all([
    db.product.groupBy({ by: ["brandId"], where: base, _count: { _all: true } }),
    db.product.aggregate({ where: base, _min: { priceCents: true }, _max: { priceCents: true } }),
    db.product.count({ where: { AND: [base, { inStock: true }] } }),
    db.product.count({ where: { AND: [base, { onSale: true }] } }),
    db.product.count({ where: { AND: [base, { ratingAverage: { gte: 4 } }] } }),
    db.product.count({ where: { AND: [base, { ratingAverage: { gte: 3 } }] } }),
    db.productAttributeValue.groupBy({ by: ["attributeValueId"], where: { product: base }, _count: { _all: true } }),
    db.variantOptionValue.findMany({ where: { variant: { isActive: true, product: base } }, select: { attributeValueId: true, variant: { select: { productId: true } } } }),
    db.attribute.findMany({ where: { isFilterable: true }, orderBy: { position: "asc" }, include: { values: { orderBy: { position: "asc" } } } }),
  ]);

  const brandIds = brandGroups.map((group) => group.brandId).filter(Boolean) as string[];
  const brands = await db.brand.findMany({ where: { id: { in: brandIds } }, select: { id: true, name: true, slug: true } });
  const brandCounts = new Map(brandGroups.map((group) => [group.brandId, group._count._all]));

  const valueCounts = new Map<string, number>(productValues.map((group) => [group.attributeValueId, group._count._all]));
  const variantProducts = new Map<string, Set<string>>();
  for (const row of variantValues) {
    const set = variantProducts.get(row.attributeValueId) ?? new Set<string>();
    set.add(row.variant.productId);
    variantProducts.set(row.attributeValueId, set);
  }
  for (const [valueId, products] of variantProducts) valueCounts.set(valueId, (valueCounts.get(valueId) ?? 0) + products.size);

  // Sub-category facet: children of the scoped category, or departments elsewhere.
  let categoryFacet: FacetValue[] = [];
  const scopedCategory = scope.categorySlug
    ? await db.category.findFirst({ where: { slug: scope.categorySlug }, select: { id: true } })
    : null;
  const facetCategories = await db.category.findMany({
    where: { parentId: scopedCategory ? scopedCategory.id : null, isActive: true, deletedAt: null },
    orderBy: { position: "asc" },
    select: { slug: true, name: true, _count: { select: { products: { where: { product: base } } } } },
  });
  categoryFacet = facetCategories.filter((category) => category._count.products > 0).map((category) => ({ slug: category.slug, label: category.name, count: category._count.products }));

  return {
    categories: categoryFacet,
    brands: brands
      .map((brand) => ({ slug: brand.slug, label: brand.name, count: brandCounts.get(brand.id) ?? 0 }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    attributes: attributes
      .map((attribute) => ({
        slug: attribute.slug,
        name: attribute.name,
        type: attribute.type,
        values: attribute.values
          .map((value) => ({ slug: value.slug, label: value.value, colorHex: value.colorHex, count: valueCounts.get(value.id) ?? 0 }))
          .filter((value) => value.count > 0),
      }))
      .filter((attribute) => attribute.values.length > 0),
    price: { min: priceAgg._min.priceCents ?? 0, max: priceAgg._max.priceCents ?? 0 },
    inStockCount,
    onSaleCount,
    ratingCounts: { 4: rating4, 3: rating3 },
  };
}

/** Faceted product listing for category, brand, collection, shop and search pages. */
export async function listProducts(scope: ListingScope, filters: ListingFilters, catalog: CatalogScope = null): Promise<ListingResult> {
  "use cache";
  cacheLife("minutes");
  cacheTag(...scopeTags(catalog));

  const select = cardSelectFor(catalog);
  const { base, defaultSort, searchRank, correctedQuery } = await scopeWhere(scope, filters, catalog);
  const where: Prisma.ProductWhereInput = { AND: [base, ...refinementWhere(filters)] };
  const sort: SortKey = filters.sort === "featured" && defaultSort ? defaultSort : filters.sort;

  const [total, facets] = await Promise.all([db.product.count({ where }), computeFacets(base, scope)]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);

  let rows: CardRow[];
  if (sort === "relevance" && searchRank) {
    const matching = await db.product.findMany({ where, select: { id: true } });
    const ordered = matching.map((row) => row.id).sort((a, b) => (searchRank.get(a) ?? 1e9) - (searchRank.get(b) ?? 1e9));
    const pageIds = ordered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const unordered = await db.product.findMany({ where: { id: { in: pageIds } }, select });
    const byId = new Map(unordered.map((row) => [row.id, row]));
    rows = pageIds.map((id) => byId.get(id)).filter(Boolean) as CardRow[];
  } else {
    rows = await db.product.findMany({
      where,
      orderBy: orderByFor(sort),
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select,
    });
  }

  return { products: rows.map((row) => toProductCard(row, catalog)), total, page, pageCount, pageSize: PAGE_SIZE, facets, correctedQuery };
}

/** Small product rails (homepage, collections, empty states). Returns [] when a data-driven rail has no data. */
export async function getProductRail(source: "new" | "featured" | "best-sellers" | "sale" | "top-rated" | "trending", limit = 8, categorySlug?: string, catalog: CatalogScope = null) {
  "use cache";
  cacheLife("minutes");
  cacheTag(...scopeTags(catalog));
  const select = cardSelectFor(catalog);
  const and: Prisma.ProductWhereInput[] = [visibleIn(catalog), { inStock: true }];
  if (categorySlug) {
    const category = await db.category.findFirst({ where: { slug: categorySlug }, select: { id: true } });
    if (category) and.push({ categories: { some: { categoryId: { in: await descendantCategoryIds([category.id]) } } } });
  }
  let orderBy: Prisma.ProductOrderByWithRelationInput[] = [{ publishedAt: "desc" }];
  switch (source) {
    case "featured":
      and.push({ isFeatured: true });
      orderBy = [{ publishedAt: "desc" }];
      break;
    case "best-sellers":
      and.push({ salesCount: { gt: 0 } });
      orderBy = [{ salesCount: "desc" }, { ratingAverage: "desc" }];
      break;
    case "sale":
      and.push({ onSale: true });
      break;
    case "top-rated":
      and.push({ ratingCount: { gt: 0 }, ratingAverage: { gte: 4 } });
      orderBy = [{ ratingAverage: "desc" }, { ratingCount: "desc" }];
      break;
    case "trending": {
      // Units ordered in the last 30 days across paid orders.
      const since = new Date(Date.now() - 30 * 86_400_000);
      const trending = await db.orderItem.groupBy({
        by: ["productId"],
        where: { productId: { not: null }, order: { placedAt: { gte: since }, paymentStatus: { in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED] } } },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: limit * 2,
      });
      const ids = trending.map((row) => row.productId!) ;
      if (ids.length === 0) return [];
      const rows = await db.product.findMany({ where: { AND: [...and, { id: { in: ids } }] }, select });
      const rank = new Map(ids.map((id, index) => [id, index]));
      return rows.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)).slice(0, limit).map((row) => toProductCard(row, catalog));
    }
    default:
      orderBy = [{ publishedAt: "desc" }];
  }
  const rows = await db.product.findMany({ where: { AND: and }, orderBy, take: limit, select });
  return rows.map((row) => toProductCard(row, catalog));
}

export async function getProductCardsByIds(ids: string[], catalog: CatalogScope = null) {
  "use cache";
  cacheLife("minutes");
  cacheTag(...scopeTags(catalog));
  if (ids.length === 0) return [];
  const rows = await db.product.findMany({ where: { AND: [visibleIn(catalog), { id: { in: ids.slice(0, 50) } }] }, select: cardSelectFor(catalog) });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter(Boolean).map((row) => toProductCard(row as CardRow, catalog));
}

// ─── Product detail ─────────────────────────────────────────────────────────

export async function getProductBySlug(slug: string, catalog: CatalogScope = null) {
  "use cache";
  cacheLife("hours");
  cacheTag(...scopeTags(catalog), productTag(slug));
  const product = await db.product.findFirst({
    where: { slug, ...visibleIn(catalog) },
    include: {
      storeProducts: catalog ? { where: { storeId: catalog.id }, select: { markupBps: true, fixedPriceCents: true } } : false,
      brand: { select: { id: true, name: true, slug: true, description: true } },
      primaryCategory: { select: { id: true, name: true, slug: true, parent: { select: { id: true, name: true, slug: true } } } },
      images: { orderBy: { position: "asc" }, include: { media: { select: { id: true, url: true, width: true, height: true, alt: true } } } },
      variants: {
        where: { isActive: true },
        orderBy: { position: "asc" },
        include: {
          image: { select: { id: true, url: true } },
          options: { include: { attributeValue: { include: { attribute: { select: { id: true, slug: true, name: true, type: true, position: true } } } } } },
        },
      },
      attributeValues: { include: { attributeValue: { include: { attribute: { select: { slug: true, name: true, position: true } } } } } },
      tags: { include: { tag: { select: { name: true, slug: true } } } },
    },
  });
  if (!product) return null;
  const override: StoreProductOverride = catalog ? (product.storeProducts as Array<{ markupBps: number | null; fixedPriceCents: number | null }>)[0] ?? null : null;
  const pricing = catalog?.pricing ?? SUGGESTED_PRICING;
  const pricedVariants = product.variants.map((variant) => ({ variant, priced: storePriceFor(variant, pricing, override) }));
  const summary = summarisePrices(pricedVariants.map((entry) => entry.priced));

  const distribution = await db.review.groupBy({
    by: ["rating"],
    where: { productId: product.id, status: ReviewStatus.APPROVED, deletedAt: null },
    _count: { _all: true },
  });

  // Option groups derived from variants (e.g. Size: S, M, L)
  const groups = new Map<string, { attributeId: string; slug: string; name: string; type: string; position: number; values: Map<string, { id: string; value: string; slug: string; colorHex: string | null; position: number }> }>();
  for (const variant of product.variants) {
    for (const option of variant.options) {
      const attribute = option.attributeValue.attribute;
      const group = groups.get(attribute.id) ?? { attributeId: attribute.id, slug: attribute.slug, name: attribute.name, type: attribute.type, position: attribute.position, values: new Map() };
      group.values.set(option.attributeValue.id, {
        id: option.attributeValue.id,
        value: option.attributeValue.value,
        slug: option.attributeValue.slug,
        colorHex: option.attributeValue.colorHex,
        position: option.attributeValue.position,
      });
      groups.set(attribute.id, group);
    }
  }

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    shortDescription: product.shortDescription,
    description: product.description,
    careInstructions: product.careInstructions,
    shippingNote: product.shippingNote,
    specifications: (product.specifications as Array<{ label: string; value: string }>) ?? [],
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    priceCents: pricedVariants.length ? summary.priceCents : product.priceCents,
    maxPriceCents: pricedVariants.length ? summary.maxPriceCents : product.maxPriceCents,
    compareAtPriceCents: pricedVariants.length ? summary.compareAtPriceCents : product.compareAtPriceCents,
    onSale: pricedVariants.length ? summary.onSale : product.onSale,
    /** Wholesale of the cheapest variant; only shown on the platform catalogue. */
    costCents: summary.costCents,
    inStock: product.inStock,
    ratingAverage: product.ratingAverage,
    ratingCount: product.ratingCount,
    publishedAt: product.publishedAt,
    updatedAt: product.updatedAt,
    brand: product.brand,
    category: product.primaryCategory,
    images: product.images.map((image) => ({
      id: image.media.id,
      url: image.media.url,
      alt: image.alt || image.media.alt || product.name,
      width: image.media.width ?? 1200,
      height: image.media.height ?? 1500,
    })),
    variants: pricedVariants.map(({ variant, priced }) => ({
      id: variant.id,
      title: variant.title,
      sku: variant.sku,
      /** What this store charges for the variant. */
      priceCents: priced.priceCents,
      compareAtCents: priced.compareAtCents,
      costCents: priced.costCents,
      stockQuantity: variant.trackInventory ? variant.stockQuantity : null,
      lowStockThreshold: variant.lowStockThreshold,
      available: !variant.trackInventory || variant.allowBackorder || variant.stockQuantity > 0,
      imageId: variant.image?.id ?? null,
      optionValueIds: variant.options.map((option) => option.attributeValue.id),
    })),
    optionGroups: [...groups.values()]
      .sort((a, b) => a.position - b.position)
      .map((group) => ({ ...group, values: [...group.values.values()].sort((a, b) => a.position - b.position) })),
    facts: product.attributeValues
      .sort((a, b) => a.attributeValue.attribute.position - b.attributeValue.attribute.position)
      .map((entry) => ({ attribute: entry.attributeValue.attribute.name, attributeSlug: entry.attributeValue.attribute.slug, value: entry.attributeValue.value, slug: entry.attributeValue.slug })),
    tags: product.tags.map((entry) => entry.tag),
    ratingDistribution: Object.fromEntries([5, 4, 3, 2, 1].map((stars) => [stars, distribution.find((row) => row.rating === stars)?._count._all ?? 0])) as Record<number, number>,
  };
}

export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>;

export async function getRelatedProducts(productId: string, categoryId: string | null, brandId: string | null, limit = 8, catalog: CatalogScope = null) {
  "use cache";
  cacheLife("hours");
  cacheTag(...scopeTags(catalog));
  const conditions: Prisma.ProductWhereInput[] = [];
  if (categoryId) conditions.push({ primaryCategoryId: categoryId });
  if (brandId) conditions.push({ brandId });
  if (conditions.length === 0) return [];
  const rows = await db.product.findMany({
    where: { AND: [visibleIn(catalog), { id: { not: productId } }, { inStock: true }, { OR: conditions }] },
    orderBy: [{ salesCount: "desc" }, { ratingAverage: "desc" }, { publishedAt: "desc" }],
    take: limit,
    select: cardSelectFor(catalog),
  });
  return rows.map((row) => toProductCard(row, catalog));
}

/**
 * Products actually bought in the same orders. Returns `source: "orders"` only when real co-purchase
 * data exists; otherwise complementary picks from the same department are labelled differently by the UI.
 */
export async function getBoughtTogether(productId: string, departmentCategoryId: string | null, limit = 3, catalog: CatalogScope = null) {
  "use cache";
  cacheLife("hours");
  cacheTag(...scopeTags(catalog));
  const select = cardSelectFor(catalog);
  const rows = await db.$queryRaw<{ productId: string; together: bigint }[]>`
    SELECT other."productId", COUNT(*) AS together
    FROM "OrderItem" item
    JOIN "OrderItem" other ON other."orderId" = item."orderId" AND other."productId" IS NOT NULL AND other."productId" <> item."productId"
    JOIN "Order" o ON o."id" = item."orderId"
    WHERE item."productId" = ${productId} AND o."paymentStatus" IN ('PAID', 'PARTIALLY_REFUNDED') AND o."status" <> 'CANCELLED'
    GROUP BY other."productId"
    ORDER BY together DESC
    LIMIT ${limit * 2}`;
  if (rows.length > 0) {
    const products = await db.product.findMany({ where: { AND: [visibleIn(catalog), { inStock: true }, { id: { in: rows.map((row) => row.productId) } }] }, select });
    const rank = new Map(rows.map((row, index) => [row.productId, index]));
    const cards = products.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)).slice(0, limit).map((row) => toProductCard(row, catalog));
    if (cards.length > 0) return { source: "orders" as const, products: cards };
  }
  if (!departmentCategoryId) return { source: "curated" as const, products: [] };
  const ids = await descendantCategoryIds([departmentCategoryId]);
  const current = await db.product.findUnique({ where: { id: productId }, select: { primaryCategoryId: true, priceCents: true } });
  const complementary = await db.product.findMany({
    where: {
      AND: [
        visibleIn(catalog),
        { inStock: true },
        { id: { not: productId } },
        { categories: { some: { categoryId: { in: ids } } } },
        current?.primaryCategoryId ? { primaryCategoryId: { not: current.primaryCategoryId } } : {},
      ],
    },
    orderBy: [{ isFeatured: "desc" }, { ratingAverage: "desc" }, { priceCents: "asc" }],
    take: limit,
    select,
  });
  return { source: "curated" as const, products: complementary.map((row) => toProductCard(row, catalog)) };
}

/** Number of products available to sell across the platform catalogue. */
export async function countCatalogProducts() {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  return db.product.count({ where: visibleProduct });
}
