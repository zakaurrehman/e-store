import { clearRateLimits } from "./rate-limits";
import { restockSpecProducts } from "./stock";

export default async function globalSetup() {
  const cleared = await clearRateLimits();
  if (cleared) console.log(`[e2e] cleared ${cleared} local rate-limit bucket(s)`);
  const restocked = await restockSpecProducts();
  if (restocked) console.log(`[e2e] restocked ${restocked} variant(s) the specs buy`);
}
