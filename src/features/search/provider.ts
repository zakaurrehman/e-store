import { Prisma } from "@/generated/prisma/client";
import { db, type DbClient } from "@/server/db";

export type SearchHit = { productId: string; score: number };

export type SearchResult = { hits: SearchHit[]; correctedQuery: string | null };

/**
 * Search abstraction. The Postgres implementation below is production-ready for catalogues up to roughly
 * 100k products. A Meilisearch / Algolia / Elasticsearch provider implements the same interface and is
 * selected in getSearchProvider(); callers never touch the engine directly.
 */
export interface SearchProvider {
  indexProduct(productId: string, client?: DbClient): Promise<void>;
  removeProduct(productId: string): Promise<void>;
  search(query: string, options?: { limit?: number }): Promise<SearchResult>;
}

export function normaliseQuery(query: string) {
  return query.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, 100);
}

function prefixTsQuery(query: string) {
  const tokens = query
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0)
    .slice(0, 8);
  if (tokens.length === 0) return null;
  return tokens.map((token) => `${token}:*`).join(" & ");
}

class PostgresSearchProvider implements SearchProvider {
  async indexProduct(productId: string, client: DbClient = db) {
    const product = await client.product.findUnique({
      where: { id: productId },
      include: {
        brand: { select: { name: true } },
        categories: { include: { category: { select: { name: true, parent: { select: { name: true } } } } } },
        tags: { include: { tag: { select: { name: true } } } },
        attributeValues: { include: { attributeValue: { select: { value: true } } } },
        variants: { select: { sku: true, title: true } },
      },
    });
    if (!product) return;
    const title = product.name;
    const taxonomy = [
      product.brand?.name,
      ...product.categories.flatMap((entry) => [entry.category.name, entry.category.parent?.name]),
      ...product.tags.map((entry) => entry.tag.name),
      ...product.attributeValues.map((entry) => entry.attributeValue.value),
    ]
      .filter(Boolean)
      .join(" ");
    const body = [
      product.shortDescription,
      product.description?.replace(/[#*_>`[\]()-]/g, " ").slice(0, 4000),
      ...product.variants.flatMap((variant) => [variant.sku, variant.title === "Default" ? null : variant.title]),
    ]
      .filter(Boolean)
      .join(" ");
    const content = `${taxonomy} ${body}`.trim();

    await client.$executeRaw`
      INSERT INTO "SearchDocument" ("productId", "title", "content", "vector", "updatedAt")
      VALUES (
        ${productId}, ${title}, ${content},
        setweight(to_tsvector('english', unaccent(${title})), 'A') ||
        setweight(to_tsvector('simple', unaccent(${title})), 'A') ||
        setweight(to_tsvector('english', unaccent(${taxonomy})), 'B') ||
        setweight(to_tsvector('simple', unaccent(${taxonomy})), 'B') ||
        setweight(to_tsvector('english', unaccent(${body})), 'C'),
        timezone('utc', now())
      )
      ON CONFLICT ("productId") DO UPDATE SET
        "title" = EXCLUDED."title",
        "content" = EXCLUDED."content",
        "vector" = EXCLUDED."vector",
        "updatedAt" = timezone('utc', now())`;
  }

  async removeProduct(productId: string) {
    await db.searchDocument.deleteMany({ where: { productId } });
  }

  async search(rawQuery: string, options: { limit?: number } = {}): Promise<SearchResult> {
    const query = normaliseQuery(rawQuery);
    const limit = options.limit ?? 500;
    const prefix = prefixTsQuery(query);
    if (!prefix) return { hits: [], correctedQuery: null };

    // 1) Full-text: stemmed web-search syntax OR as-you-type prefix match, ranked by weight + title similarity + popularity.
    const fullText = await db.$queryRaw<{ productId: string; score: number }[]>`
      WITH q AS (
        SELECT websearch_to_tsquery('english', unaccent(${query})) AS stemmed,
               to_tsquery('simple', ${prefix}) AS prefix
      )
      SELECT d."productId",
             (ts_rank_cd(d."vector", q.stemmed) + ts_rank_cd(d."vector", q.prefix)
               + similarity(d."title", ${query}) * 0.6
               + ln(1 + p."salesCount") * 0.02)::float AS score
      FROM "SearchDocument" d
      JOIN "Product" p ON p."id" = d."productId"
      CROSS JOIN q
      WHERE p."status" = 'ACTIVE' AND p."deletedAt" IS NULL
        AND (d."vector" @@ q.stemmed OR d."vector" @@ q.prefix)
      ORDER BY score DESC
      LIMIT ${limit}`;

    if (fullText.length >= 3 || query.length < 3) {
      return { hits: fullText.map((row) => ({ productId: row.productId, score: Number(row.score) })), correctedQuery: null };
    }

    // 2) Typo tolerance: trigram similarity on titles and taxonomy words. Explicit thresholds are used
    //    instead of the % / <% operators so results don't depend on session-level pg_trgm settings.
    const fuzzy = await db.$queryRaw<{ productId: string; title: string; score: number }[]>`
      SELECT * FROM (
        SELECT d."productId", d."title",
               GREATEST(similarity(d."title", ${query}), word_similarity(${query}, d."title"), word_similarity(${query}, d."content") * 0.8)::float AS score
        FROM "SearchDocument" d
        JOIN "Product" p ON p."id" = d."productId"
        WHERE p."status" = 'ACTIVE' AND p."deletedAt" IS NULL
      ) ranked
      WHERE score >= 0.4
      ORDER BY score DESC
      LIMIT ${limit}`;

    const seen = new Set(fullText.map((row) => row.productId));
    const hits: SearchHit[] = [
      ...fullText.map((row) => ({ productId: row.productId, score: Number(row.score) + 1 })),
      ...fuzzy.filter((row) => !seen.has(row.productId)).map((row) => ({ productId: row.productId, score: Number(row.score) })),
    ];

    let correctedQuery: string | null = null;
    if (fullText.length === 0 && fuzzy.length > 0) {
      correctedQuery = await this.suggestCorrection(query);
    }
    return { hits, correctedQuery };
  }

  /** Best-matching vocabulary term for a misspelt query (e.g. "lether" → "leather"). */
  private async suggestCorrection(query: string) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 4);
    const corrected: string[] = [];
    let changed = false;
    for (const word of words) {
      const rows = await db.$queryRaw<{ word: string; score: number }[]>(Prisma.sql`
        SELECT word, similarity(word, ${word})::float AS score
        FROM ts_stat($$SELECT to_tsvector('simple', unaccent("title") || ' ' || unaccent("content")) FROM "SearchDocument"$$)
        WHERE length(word) > 2 AND similarity(word, ${word}) >= 0.3
        ORDER BY score DESC, nentry DESC
        LIMIT 1`);
      const best = rows[0];
      if (best && best.word !== word && Number(best.score) > 0.3) {
        corrected.push(best.word);
        changed = true;
      } else {
        corrected.push(word);
      }
    }
    return changed ? corrected.join(" ") : null;
  }
}

let provider: SearchProvider | undefined;

export function getSearchProvider(): SearchProvider {
  provider ??= new PostgresSearchProvider();
  return provider;
}
