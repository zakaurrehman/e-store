import "dotenv/config";
import { db } from "@/server/db";
import { seedAccessControl } from "./access-control";
import { seedAdmin } from "./admin";
import { seedCatalog } from "./catalog";
import { seedContent } from "./content";
import { seedDemoData } from "./demo";
import { seedSettings } from "./settings";
import { seedShippingAndTax } from "./shipping";
import { seedPlatformStore } from "./stores";

/**
 * Idempotent production-safe seed: access control, settings, shipping/tax, first admin.
 * Run with `npm run db:seed`. Each step can be re-run safely.
 * SEED_DEMO_DATA=true additionally loads development-only demo customers, orders and reviews.
 */
async function main() {
  const started = Date.now();
  await seedAccessControl();
  await seedSettings();
  await seedShippingAndTax();
  await seedAdmin();
  if (process.env.SEED_SKIP_CATALOG !== "true") await seedCatalog();
  await seedPlatformStore();
  await seedContent();
  if (process.env.SEED_DEMO_DATA === "true") await seedDemoData();
  console.log(`Seed finished in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
