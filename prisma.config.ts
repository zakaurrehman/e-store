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
    // Optional so `prisma generate` works without a database (e.g. CI or a Vercel build before env vars are set);
    // migrate, seed and the app still require DATABASE_URL and fail with a clear error when it is missing.
    url: process.env.DATABASE_URL,
  },
});
