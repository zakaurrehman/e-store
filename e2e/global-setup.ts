import { clearRateLimits } from "./rate-limits";

export default async function globalSetup() {
  const cleared = await clearRateLimits();
  if (cleared) console.log(`[e2e] cleared ${cleared} local rate-limit bucket(s)`);
}
