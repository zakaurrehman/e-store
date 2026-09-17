import { describe, expect, it } from "vitest";
import { isAccelerateUrl, resolveDatabaseUrl, resolveMigrationDatabaseUrl } from "@/lib/database-url";

const direct = "postgres://user:pass@db.prisma.io:5432/postgres?sslmode=require";
const pooled = "postgres://user:pass@ep-example-pooler.neon.tech/store";
const unpooled = "postgres://user:pass@ep-example.neon.tech/store";
const accelerate = "prisma+postgres://accelerate.prisma-data.net/?api_key=example";

describe("database connection string resolution", () => {
  it("prefers DATABASE_URL", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: pooled, STORAGE_POSTGRES_URL: direct })).toBe(pooled);
  });

  it("uses the Vercel-prefixed Prisma Postgres variables and skips the Accelerate URL", () => {
    expect(resolveDatabaseUrl({ STORAGE_PRISMA_DATABASE_URL: accelerate, STORAGE_POSTGRES_URL: direct })).toBe(direct);
  });

  it("never returns a Prisma Accelerate URL", () => {
    expect(isAccelerateUrl(accelerate)).toBe(true);
    expect(isAccelerateUrl(direct)).toBe(false);
    expect(resolveDatabaseUrl({ DATABASE_URL: accelerate })).toBeUndefined();
  });

  it("treats blank variables as unset", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: "  ", POSTGRES_URL: direct })).toBe(direct);
    expect(resolveDatabaseUrl({})).toBeUndefined();
  });

  it("runs migrations over a direct connection when one is available", () => {
    expect(resolveMigrationDatabaseUrl({ DATABASE_URL: pooled, DATABASE_URL_UNPOOLED: unpooled })).toBe(unpooled);
    expect(resolveMigrationDatabaseUrl({ STORAGE_POSTGRES_URL: direct })).toBe(direct);
  });
});
