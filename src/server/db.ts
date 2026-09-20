import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { resolveDatabaseUrl } from "@/lib/database-url";

const globalForPrisma = globalThis as unknown as { __zendropshipPrisma?: PrismaClient };

function createClient(connectionString = resolveDatabaseUrl()) {
  if (!connectionString) throw new Error("No PostgreSQL connection string: set DATABASE_URL to a direct postgres:// URL (or connect a Vercel database)");
  // Serverless runs many short-lived instances, each with its own pool, against a database that allows only a
  // handful of connections in total — so keep the pool tiny there and let idle connections go back quickly.
  const serverless = !!process.env.VERCEL;
  const adapter = new PrismaPg({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? (serverless ? 2 : 10)),
    idleTimeoutMillis: serverless ? 10_000 : 30_000,
    connectionTimeoutMillis: 15_000,
    // Prisma stores DateTime as UTC in `timestamp` columns; pin the session so raw SQL now() agrees
    // regardless of the server's configured TimeZone.
    options: "-c TimeZone=UTC",
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/** Shared Prisma client (one pool per server instance; reused across hot reloads in development). */
export const db: PrismaClient = globalForPrisma.__zendropshipPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.__zendropshipPrisma = db;

/** Interactive-transaction client type. */
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
export type DbClient = PrismaClient | Tx;

export { createClient as createPrismaClient };
