import { expireUnpaidOrders, flushNotifications } from "@/features/orders/service";
import { db } from "@/server/db";
import { processDueDeliveries } from "@/server/notifications";

/** Periodic maintenance. Every job is safe to run concurrently and repeatedly. */
export async function runJobs() {
  const started = Date.now();
  const results: Record<string, unknown> = {};

  try {
    results.deliveriesRetried = await processDueDeliveries();
  } catch (error) {
    results.deliveriesError = error instanceof Error ? error.message : String(error);
  }

  try {
    const { expired, notifications } = await expireUnpaidOrders();
    results.unpaidOrdersExpired = expired;
    await flushNotifications(notifications);
  } catch (error) {
    results.expireError = error instanceof Error ? error.message : String(error);
  }

  try {
    const sessions = await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const tokens = await db.verificationToken.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date(Date.now() - 7 * 86_400_000) } }, { usedAt: { lt: new Date(Date.now() - 7 * 86_400_000) } }] } });
    const carts = await db.cart.deleteMany({ where: { userId: null, expiresAt: { lt: new Date() } } });
    const buckets = await db.rateLimitBucket.deleteMany({ where: { resetAt: { lt: new Date(Date.now() - 3_600_000) } } });
    const webhooks = await db.webhookEvent.deleteMany({ where: { processedAt: { lt: new Date(Date.now() - 90 * 86_400_000) } } });
    results.cleanup = { sessions: sessions.count, tokens: tokens.count, guestCarts: carts.count, rateLimitBuckets: buckets.count, webhookEvents: webhooks.count };
  } catch (error) {
    results.cleanupError = error instanceof Error ? error.message : String(error);
  }

  return { ok: true, durationMs: Date.now() - started, ...results };
}
