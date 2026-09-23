import "dotenv/config";
import { Client } from "pg";

/**
 * A full run opens several accounts and writes several support messages from one address, which is more
 * than the production rate limits allow in an hour. Those limits are what they should be, so a run clears
 * its own buckets instead of loosening them: once before everything, and again before each spec that
 * registers someone. Local databases only — never a real one.
 */
export async function clearRateLimits() {
  const url = process.env.DATABASE_URL;
  if (!url) return 0;
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
    throw new Error("Refusing to clear rate limits: DATABASE_URL is not a local database.");
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query(`DELETE FROM "RateLimitBucket" WHERE "key" LIKE 'register:%' OR "key" LIKE 'contact:%' OR "key" LIKE 'login:%'`);
    return result.rowCount ?? 0;
  } finally {
    await client.end();
  }
}
