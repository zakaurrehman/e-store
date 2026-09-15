import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "db/schema.prisma",
  migrations: {
    path: "db/migrations",
    // react-server resolves "server-only" (imported by app server modules) to its no-op export outside Next.js.
    seed: "tsx --conditions=react-server db/seed/index.ts",
  },
  datasource: {
    // Optional so `prisma generate` works without a database. Migrations prefer a direct (non-pooled) connection,
    // which Vercel Postgres (Neon) provides as DATABASE_URL_UNPOOLED or POSTGRES_URL_NON_POOLING.
    url: process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_URL,
  },
});
