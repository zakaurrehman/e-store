import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { CATALOG_TAG, getProductCardsByIds, type CatalogScope } from "@/features/catalog/queries";
import { db } from "@/server/db";
import { getSearchProvider, normaliseQuery } from "./provider";

export type Suggestions = {
  query: string;
  correctedQuery: string | null;
  products: Array<{ id: string; slug: string; name: string; brand: string | null; priceCents: number; compareAtPriceCents: number | null; imageUrl: string | null }>;
  categories: Array<{ name: string; slug: string; parent: string | null }>;
  brands: Array<{ name: string; slug: string }>;
};

/** Suggestions for the search box. In a store, only what that store sells is suggested. */
export async function getSuggestions(rawQuery: string, catalog: CatalogScope = null): Promise<Suggestions> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_TAG);
  const query = normaliseQuery(rawQuery);
  if (query.length < 2) return { query, correctedQuery: null, products: [], categories: [], brands: [] };
  const storeId = catalog?.id ?? null;
  const categoryInStore = storeId
    ? Prisma.sql`AND EXISTS (SELECT 1 FROM "ProductCategory" pc JOIN "StoreProduct" sp ON sp."productId" = pc."productId" AND sp."storeId" = ${storeId} AND sp."isActive" WHERE pc."categoryId" = c."id")`
    : Prisma.empty;
  const brandInStore = storeId
    ? Prisma.sql`AND EXISTS (SELECT 1 FROM "Product" pr JOIN "StoreProduct" sp ON sp."productId" = pr."id" AND sp."storeId" = ${storeId} AND sp."isActive" WHERE pr."brandId" = "Brand"."id")`
    : Prisma.empty;

  const [result, categories, brands] = await Promise.all([
    // A store sells a subset of the catalogue, so look further down the ranking to fill six suggestions.
    getSearchProvider().search(query, { limit: storeId ? 40 : 6 }),
    db.$queryRaw<Array<{ name: string; slug: string; parent: string | null }>>`
      SELECT c."name", c."slug", p."name" AS parent
      FROM "Category" c LEFT JOIN "Category" p ON p."id" = c."parentId"
      WHERE c."isActive" AND c."deletedAt" IS NULL
        AND (c."name" ILIKE ${`%${query}%`} OR similarity(c."name", ${query}) > 0.35)
        ${categoryInStore}
      ORDER BY similarity(c."name", ${query}) DESC, c."position" ASC
      LIMIT 4`,
    db.$queryRaw<Array<{ name: string; slug: string }>>`
      SELECT "name", "slug" FROM "Brand"
      WHERE "isActive" AND "deletedAt" IS NULL AND ("name" ILIKE ${`%${query}%`} OR similarity("name", ${query}) > 0.35)
        ${brandInStore}
      ORDER BY similarity("name", ${query}) DESC
      LIMIT 3`,
  ]);

  const cards = (await getProductCardsByIds(result.hits.slice(0, storeId ? 40 : 6).map((hit) => hit.productId), catalog)).slice(0, 6);
  return {
    query,
    correctedQuery: result.correctedQuery,
    products: cards.map((card) => ({
      id: card.id,
      slug: card.slug,
      name: card.name,
      brand: card.brand?.name ?? null,
      priceCents: card.priceCents,
      compareAtPriceCents: card.compareAtPriceCents,
      imageUrl: card.images[0]?.url ?? null,
    })),
    categories,
    brands,
  };
}

/** Real popular searches only (seen repeatedly and returning results). */
export async function getPopularSearches(limit = 8) {
  "use cache";
  cacheLife("hours");
  cacheTag("search-popular");
  const rows = await db.searchQuery.findMany({
    where: { count: { gte: 3 }, lastResultCount: { gt: 0 } },
    orderBy: [{ count: "desc" }, { lastSearchedAt: "desc" }],
    take: limit,
    select: { term: true },
  });
  return rows.map((row) => row.term);
}

export async function recordSearch(term: string, resultCount: number, userId: string | null) {
  const normalised = normaliseQuery(term).toLowerCase();
  if (normalised.length < 2) return;
  await db.searchQuery.upsert({
    where: { term: normalised },
    create: { term: normalised, lastResultCount: resultCount },
    update: { count: { increment: 1 }, lastResultCount: resultCount, lastSearchedAt: new Date() },
  });
  if (userId) {
    await db.searchHistory.upsert({
      where: { userId_term: { userId, term: normalised } },
      create: { userId, term: normalised },
      update: { createdAt: new Date() },
    });
  }
}
