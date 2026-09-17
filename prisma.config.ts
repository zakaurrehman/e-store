import "dotenv/config";
import { defineConfig } from "prisma/config";
import { resolveMigrationDatabaseUrl } from "./src/lib/database-url";

export default defineConfig({
  schema: "db/schema.prisma",
  migrations: {
    path: "db/migrations",
    // react-server resolves "server-only" (imported by app server modules) to its no-op export outside Next.js.
    seed: "tsx --conditions=react-server db/seed/index.ts",
  },
  datasource: {
    // Optional so `prisma generate` works without a database. Migrations prefer a direct (non-pooled) connection;
    // Vercel-prefixed names (STORAGE_…) are accepted too — see src/lib/database-url.ts.
    url: resolveMigrationDatabaseUrl(),
  },
});
