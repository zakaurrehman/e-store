import { cleanEnvValue } from "./env-value";

type EnvSource = Record<string, string | undefined>;

/**
 * Where the PostgreSQL connection string can come from, in order of preference.
 * Vercel storage integrations add their variables with a prefix — "STORAGE_" by default — and Prisma Postgres
 * names its direct connection POSTGRES_URL, so the prefixed forms are accepted too.
 */
export const DATABASE_URL_NAMES = ["DATABASE_URL", "POSTGRES_URL", "STORAGE_DATABASE_URL", "STORAGE_POSTGRES_URL"] as const;

/** Direct (non-pooled) connections, preferred for migrations. Neon provides these alongside its pooled URL. */
const DIRECT_DATABASE_URL_NAMES = ["DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING", "STORAGE_DATABASE_URL_UNPOOLED", "STORAGE_POSTGRES_URL_NON_POOLING"] as const;

/** prisma+postgres:// (Prisma Accelerate) URLs need the Accelerate client; Veyora connects with node-postgres. */
export const isAccelerateUrl = (url: string) => /^prisma(\+postgres)?:\/\//i.test(url);

function firstUsable(names: readonly string[], env: EnvSource) {
  for (const name of names) {
    const url = cleanEnvValue(env[name]);
    if (url && !isAccelerateUrl(url)) return url;
  }
  return undefined;
}

/** Connection string for the application. */
export function resolveDatabaseUrl(env: EnvSource = process.env): string | undefined {
  return firstUsable(DATABASE_URL_NAMES, env);
}

/** Connection string for migrations: a direct connection when available, otherwise the application connection. */
export function resolveMigrationDatabaseUrl(env: EnvSource = process.env): string | undefined {
  return firstUsable(DIRECT_DATABASE_URL_NAMES, env) ?? resolveDatabaseUrl(env);
}
