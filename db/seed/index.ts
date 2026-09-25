import "dotenv/config";
import { db } from "@/server/db";
import { seedAccessControl } from "./access-control";
import { seedAdmin } from "./admin";
import { seedCatalog } from "./catalog";
import { seedContent } from "./content";
import { seedDemoData } from "./demo";
import { seedSettings } from "./settings";
import { seedShippingAndTax } from "./shipping";
import { seedReferralCode } from "./referrals";
import { seedPlatformStore } from "./stores";
import { seedDemoStoreReviews } from "./store-reviews";

/**
 * Idempotent production-safe seed: access control, settings, shipping/tax, first admin.
 * Run with `npm run db:seed`. Each step can be re-run safely.
 * SEED_DEMO_DATA=true additionally loads development-only demo customers, orders, product reviews and demo store reviews.
 */
async function main() {
  const started = Date.now();
  await seedAccessControl();
  await seedSettings();
  await seedShippingAndTax();
  await seedAdmin();
  if (process.env.SEED_SKIP_CATALOG !== "true") await seedCatalog();
  await seedPlatformStore();
  await seedReferralCode();
  await seedContent();
  if (process.env.SEED_DEMO_DATA === "true") {
    await seedDemoData();
    await seedDemoStoreReviews();
  }
  console.log(`Seed finished in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
