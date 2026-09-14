import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { CATALOG_TAG, getProductCardsByIds } from "@/features/catalog/queries";
import { db } from "@/server/db";
import { getSearchProvider, normaliseQuery } from "./provider";

export type Suggestions = {
  query: string;
  correctedQuery: string | null;
  products: Array<{ id: string; slug: string; name: string; brand: string | null; priceCents: number; compareAtPriceCents: number | null; imageUrl: string | null }>;
  categories: Array<{ name: string; slug: string; parent: string | null }>;
  brands: Array<{ name: string; slug: string }>;
};

export async function getSuggestions(rawQuery: string): Promise<Suggestions> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOG_TAG);
  const query = normaliseQuery(rawQuery);
  if (query.length < 2) return { query, correctedQuery: null, products: [], categories: [], brands: [] };

  const [result, categories, brands] = await Promise.all([
    getSearchProvider().search(query, { limit: 6 }),
    db.$queryRaw<Array<{ name: string; slug: string; parent: string | null }>>`
      SELECT c."name", c."slug", p."name" AS parent
      FROM "Category" c LEFT JOIN "Category" p ON p."id" = c."parentId"
      WHERE c."isActive" AND c."deletedAt" IS NULL
        AND (c."name" ILIKE ${`%${query}%`} OR similarity(c."name", ${query}) > 0.35)
      ORDER BY similarity(c."name", ${query}) DESC, c."position" ASC
      LIMIT 4`,
    db.$queryRaw<Array<{ name: string; slug: string }>>`
      SELECT "name", "slug" FROM "Brand"
      WHERE "isActive" AND "deletedAt" IS NULL AND ("name" ILIKE ${`%${query}%`} OR similarity("name", ${query}) > 0.35)
      ORDER BY similarity("name", ${query}) DESC
      LIMIT 3`,
  ]);

  const cards = await getProductCardsByIds(result.hits.slice(0, 6).map((hit) => hit.productId));
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
