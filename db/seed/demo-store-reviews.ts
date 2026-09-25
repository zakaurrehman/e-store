import "dotenv/config";
import { db } from "@/server/db";
import { seedDemoStoreReviews } from "./store-reviews";

/**
 * Adds (or refreshes) the demo store reviews on an existing database without the rest of the seed:
 * `npm run db:seed:demo-reviews`. Every review it writes is marked as demo data. Refused in production.
 */
seedDemoStoreReviews()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
