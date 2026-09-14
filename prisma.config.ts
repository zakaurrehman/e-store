import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "db/schema.prisma",
  migrations: {
    path: "db/migrations",
    // react-server resolves "server-only" (imported by app server modules) to its no-op export outside Next.js.
    seed: "tsx --conditions=react-server db/seed/index.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
