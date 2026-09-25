import { envOption } from "@/lib/env-value";
import { db } from "@/server/db";
import { UNKNOWN_IP } from "@/server/request";

export type RateLimitResult = { success: boolean; remaining: number; resetAt: Date };

export type RateLimitRule = { limit: number; windowMs: number };

/** Named rules keep limits consistent across actions and route handlers. */
export const RATE_LIMITS = {
  login: { limit: 8, windowMs: 15 * 60_000 },
  register: { limit: 5, windowMs: 60 * 60_000 },
  /** Store openings from one network: generous for people setting up several stores, a wall for scripts. */
  openStore: { limit: 20, windowMs: 60 * 60_000 },
  /** Wrong invitation codes from one network — only wrong ones count, so it stops guessing, not people. */
  inviteGuess: { limit: 10, windowMs: 15 * 60_000 },
  /** Live invitation-code checks as the form is filled in. */
  inviteCheck: { limit: 60, windowMs: 10 * 60_000 },
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
  /** The live window's count without adding to it (0 when there is none). */
  peek(key: string): Promise<{ count: number; resetAt: Date | null }>;
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

  async peek(key: string) {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= Date.now()) return { count: 0, resetAt: null };
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

  async peek(key: string) {
    const rows = await db.$queryRaw<{ count: number; resetAt: Date }[]>`
      SELECT "count", "resetAt" FROM "RateLimitBucket" WHERE "key" = ${key} AND "resetAt" > timezone('utc', now())`;
    return rows[0] ? { count: Number(rows[0].count), resetAt: rows[0].resetAt } : { count: 0, resetAt: null };
  }

  async reset(key: string) {
    await db.rateLimitBucket.deleteMany({ where: { key } });
  }
}

let store: RateLimitStore | undefined;

function getStore(): RateLimitStore {
  store ??= envOption(process.env.RATE_LIMIT_DRIVER) === "memory" ? new MemoryStore() : new PostgresStore();
  return store;
}

const ruleFor = (name: string, rule?: RateLimitRule) => {
  const effective = rule ?? RATE_LIMITS[name as keyof typeof RATE_LIMITS];
  if (!effective) throw new Error(`Unknown rate limit rule: ${name}`);
  return effective;
};

export async function rateLimit(name: keyof typeof RATE_LIMITS | string, identifier: string, rule?: RateLimitRule) {
  const effective = ruleFor(name, rule);
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

let warnedUnknownIp = false;
const allow = (rule: RateLimitRule) => ({ success: true, remaining: rule.limit, resetAt: new Date(Date.now() + rule.windowMs) }) satisfies RateLimitResult;

/**
 * A limit per client address. When the address is unknown every visitor would land in one shared bucket
 * and lock everyone else out, so the limit is skipped instead (and the misconfiguration logged once) —
 * see getRequestMeta. `prefix` keeps several limits on one rule apart.
 */
export async function rateLimitByIp(name: keyof typeof RATE_LIMITS | string, ipAddress: string, options: { prefix?: string; rule?: RateLimitRule } = {}) {
  const rule = ruleFor(name, options.rule);
  if (!ipAddress || ipAddress === UNKNOWN_IP) {
    if (!warnedUnknownIp) {
      warnedUnknownIp = true;
      console.warn("[rate-limit] client IP unknown — per-address limits are off. Deploy on Vercel or set TRUST_PROXY=true behind a proxy.");
    }
    return allow(rule);
  }
  return rateLimit(name, `${options.prefix ?? ""}${ipAddress}`, rule);
}

/** Whether a per-address limit is already used up, without counting this request against it. */
export async function isRateLimitedByIp(name: keyof typeof RATE_LIMITS | string, ipAddress: string): Promise<{ limited: boolean; resetAt: Date }> {
  const rule = ruleFor(name);
  if (!ipAddress || ipAddress === UNKNOWN_IP) return { limited: false, resetAt: new Date() };
  try {
    const { count, resetAt } = await getStore().peek(`${name}:${ipAddress}`);
    return { limited: count >= rule.limit, resetAt: resetAt ?? new Date() };
  } catch (error) {
    console.error("[rate-limit] store failure", error);
    return { limited: false, resetAt: new Date() };
  }
}

/** "12 minutes", "about 2 hours" — how long until a limit lifts, for messages written around it. */
export function waitFor(resetAt: Date) {
  const minutes = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 60_000));
  if (minutes <= 90) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  return `about ${hours} hour${hours === 1 ? "" : "s"}`;
}

export async function resetRateLimit(name: string, identifier: string) {
  await getStore().reset(`${name}:${identifier}`);
}

export function retryAfterMessage(resetAt: Date) {
  return `Too many attempts. Please try again in ${waitFor(resetAt)}.`;
}
