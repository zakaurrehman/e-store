/**
 * Runs the background jobs once (local equivalent of the /api/cron endpoint).
 *   npm run jobs:run
 * For a local scheduler, run it from cron / Task Scheduler every 5 minutes.
 */
import "dotenv/config";
import { runJobs } from "@/server/jobs";
import { db } from "@/server/db";

runJobs()
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
