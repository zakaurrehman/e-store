import "dotenv/config";
import { Client } from "pg";

/** The seeded products the specs actually put in a bag. */
const BOUGHT_BY_SPECS = ["amber-wood-wick-candle", "heavyweight-organic-tee", "matte-porcelain-mug-set"];

/**
 * Every run buys real stock and nothing gives it back, so after enough runs the candle the platform spec
 * buys three of is down to its last one or two. A run tops those few products back up before it starts
 * (never lowering anything), instead of the specs buying less. Local databases only — never a real one.
 */
export async function restockSpecProducts(minimum = 100) {
  const url = process.env.DATABASE_URL;
  if (!url) return 0;
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
    throw new Error("Refusing to restock: DATABASE_URL is not a local database.");
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query(
      `UPDATE "ProductVariant" v SET "stockQuantity" = $1
         FROM "Product" p
        WHERE p.id = v."productId" AND p.slug = ANY($2::text[]) AND v."stockQuantity" < $1`,
      [minimum, BOUGHT_BY_SPECS],
    );
    return result.rowCount ?? 0;
  } finally {
    await client.end();
  }
}
