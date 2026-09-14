import { db } from "@/server/db";

export type RateLimitResult = { success: boolean; remaining: number; resetAt: Date };

export type RateLimitRule = { limit: number; windowMs: number };

/** Named rules keep limits consistent across actions and route handlers. */
export const RATE_LIMITS = {
  login: { limit: 8, windowMs: 15 * 60_000 },
  register: { limit: 5, windowMs: 60 * 60_000 },
  passwordReset: { limit: 5, windowMs: 60 * 60_000 },
  verifyEmail: { limit: 5, windowMs: 60 * 60_000 },
  contact: { limit: 5, windowMs: 60 * 60_000 },
  newsletter: { limit: 10, windowMs: 60 * 60_000 },
  review: { limit: 10, windowMs: 60 * 60_000 },
  coupon: { limit: 20, windowMs: 10 * 60_000 },
  checkout: { limit: 15, windowMs: 10 * 60_000 },
  orderLookup: { limit: 10, windowMs: 15 * 60_000 },
  search: { limit: 120, windowMs: 60_000 },
  upload: { limit: 60, windowMs: 10 * 60_000 },
} satisfies Record<string, RateLimitRule>;

interface RateLimitStore {
  hit(key: string, rule: RateLimitRule): Promise<{ count: number; resetAt: Date }>;
  reset(key: string): Promise<void>;
}

class MemoryStore implements RateLimitStore {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  async hit(key: string, rule: RateLimitRule) {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      const fresh = { count: 1, resetAt: now + rule.windowMs };
      this.buckets.set(key, fresh);
      return { count: 1, resetAt: new Date(fresh.resetAt) };
    }
    bucket.count += 1;
    return { count: bucket.count, resetAt: new Date(bucket.resetAt) };
  }

  async reset(key: string) {
    this.buckets.delete(key);
  }
}

/**
 * Fixed-window counter shared by every instance through PostgreSQL (single atomic upsert).
 * Timestamps use timezone('utc', now()) to match Prisma's UTC DateTime columns even behind poolers that drop session settings.
 */
class PostgresStore implements RateLimitStore {
  async hit(key: string, rule: RateLimitRule) {
    const rows = await db.$queryRaw<{ count: number; resetAt: Date }[]>`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
      VALUES (${key}, 1, timezone('utc', now()) + (${rule.windowMs}::int * interval '1 millisecond'))
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimitBucket"."resetAt" <= timezone('utc', now()) THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= timezone('utc', now()) THEN EXCLUDED."resetAt" ELSE "RateLimitBucket"."resetAt" END
      RETURNING "count", "resetAt"`;
    const row = rows[0];
    return { count: Number(row.count), resetAt: row.resetAt };
  }

  async reset(key: string) {
    await db.rateLimitBucket.deleteMany({ where: { key } });
  }
}

let store: RateLimitStore | undefined;

function getStore(): RateLimitStore {
  store ??= process.env.RATE_LIMIT_DRIVER === "memory" ? new MemoryStore() : new PostgresStore();
  return store;
}

export async function rateLimit(name: keyof typeof RATE_LIMITS | string, identifier: string, rule?: RateLimitRule) {
  const effective = rule ?? RATE_LIMITS[name as keyof typeof RATE_LIMITS];
  if (!effective) throw new Error(`Unknown rate limit rule: ${name}`);
  const key = `${name}:${identifier}`;
  try {
    const { count, resetAt } = await getStore().hit(key, effective);
    return { success: count <= effective.limit, remaining: Math.max(0, effective.limit - count), resetAt } satisfies RateLimitResult;
  } catch (error) {
    // Fail open on infrastructure errors so a database blip does not lock every customer out.
    console.error("[rate-limit] store failure", error);
    return { success: true, remaining: effective.limit, resetAt: new Date(Date.now() + effective.windowMs) };
  }
}

export async function resetRateLimit(name: string, identifier: string) {
  await getStore().reset(`${name}:${identifier}`);
}

export function retryAfterMessage(resetAt: Date) {
  const minutes = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 60_000));
  if (minutes <= 90) return `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  const hours = Math.round(minutes / 60);
  return `Too many attempts. Please try again in about ${hours} hour${hours === 1 ? "" : "s"}.`;
}
