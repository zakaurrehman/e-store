import { randomUUID } from "node:crypto";
import { addItem, getOrCreateUserCart } from "@/features/cart/service";
import { getShippingOptions } from "@/features/checkout/shipping";
import { cancelOrder, placeOrder, processWebhook, updateOrderStatus } from "@/features/orders/service";
import { moderateReview, submitReview } from "@/features/reviews/service";
import { OrderStatus, ProductStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { getPaymentProvider } from "@/server/payments/registry";
import { SandboxProvider } from "@/server/payments/providers/sandbox";
import { seedPlatformStore } from "./stores";

/**
 * Development-only demo data for QA: customers, orders across the fulfilment timeline and approved reviews.
 * Orders go through the real checkout pipeline (stock reservation, pricing, tax) and online payments are
 * confirmed only through the sandbox gateway's signed webhook. Demo customers have no password and cannot sign in.
 * Enable with SEED_DEMO_DATA=true. Refused when NODE_ENV=production. Skipped if demo customers already exist.
 */

const DEMO_DOMAIN = "demo.zendropship.local";

const CUSTOMERS = [
  { firstName: "Maya", lastName: "Okafor", city: "Austin", region: "TX", postalCode: "78701", country: "US", line1: "210 Congress Avenue" },
  { firstName: "Luca", lastName: "Bennett", city: "Portland", region: "OR", postalCode: "97205", country: "US", line1: "815 SW Alder Street" },
  { firstName: "Priya", lastName: "Raman", city: "Chicago", region: "IL", postalCode: "60611", country: "US", line1: "455 N Cityfront Plaza" },
  { firstName: "Elena", lastName: "Varga", city: "London", region: null, postalCode: "EC1V 2NX", country: "GB", line1: "12 Old Street" },
  { firstName: "Noah", lastName: "Fischer", city: "Seattle", region: "WA", postalCode: "98101", country: "US", line1: "1420 Fifth Avenue" },
  { firstName: "Amara", lastName: "Diallo", city: "Denver", region: "CO", postalCode: "80202", country: "US", line1: "1600 Glenarm Place" },
];

const REVIEW_TEXT = [
  { rating: 5, title: "Better than I expected", body: "The quality is excellent for the price and it arrived well packed. I would happily order again." },
  { rating: 4, title: "Lovely, runs slightly large", body: "Great finish and materials. I would size down next time, but I am very happy with it overall." },
  { rating: 5, title: "Everyday favourite", body: "I have used it almost daily since it arrived and it still looks new. Exactly as described." },
  { rating: 4, title: "Solid choice", body: "Well made and comfortable. Delivery was quicker than the estimate, which was a nice surprise." },
];

/** Small deterministic PRNG so a fresh database always gets the same demo data. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY_SECONDS = 86_400;

/** Moves an order and its history back in time so dashboards and timelines show realistic spread. */
async function backdateOrder(orderId: string, seconds: number) {
  await db.$executeRaw`UPDATE "Order" SET "placedAt" = "placedAt" - (${seconds} * interval '1 second'), "createdAt" = "createdAt" - (${seconds} * interval '1 second'), "paidAt" = "paidAt" - (${seconds} * interval '1 second'), "deliveredAt" = "deliveredAt" - (${seconds} * interval '1 second') WHERE "id" = ${orderId}`;
  await db.$executeRaw`UPDATE "OrderEvent" SET "createdAt" = "createdAt" - (${seconds} * interval '1 second') WHERE "orderId" = ${orderId}`;
  await db.$executeRaw`UPDATE "Shipment" SET "createdAt" = "createdAt" - (${seconds} * interval '1 second'), "shippedAt" = "shippedAt" - (${seconds} * interval '1 second'), "deliveredAt" = "deliveredAt" - (${seconds} * interval '1 second') WHERE "orderId" = ${orderId}`;
  await db.$executeRaw`UPDATE "Payment" SET "createdAt" = "createdAt" - (${seconds} * interval '1 second') WHERE "orderId" = ${orderId}`;
}

export async function seedDemoData() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("SEED_DEMO_DATA is refused in production.");
  }
  if (await db.user.findFirst({ where: { email: { endsWith: `@${DEMO_DOMAIN}` } }, select: { id: true } })) {
    console.log("• demo: demo customers already exist — skipped");
    return;
  }
  const admin = await db.user.findFirst({ where: { role: { key: "SUPER_ADMIN" }, deletedAt: null }, select: { id: true } });
  if (!admin) {
    console.log("• demo: no super admin to act as staff (set SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD) — skipped");
    return;
  }
  const store = await seedPlatformStore();
  const variants = await db.productVariant.findMany({
    where: { isActive: true, stockQuantity: { gte: 6 }, product: { status: ProductStatus.ACTIVE, deletedAt: null } },
    select: { id: true, productId: true },
    orderBy: { id: "asc" },
    take: 60,
  });
  if (variants.length < 3) {
    console.log("• demo: not enough in-stock products (run the catalogue seed first) — skipped");
    return;
  }

  const random = mulberry32(2026);
  const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)];
  const role = await db.role.findUniqueOrThrow({ where: { key: "CUSTOMER" } });
  const sandboxEnabled = !!getPaymentProvider("sandbox");
  const gateway = sandboxEnabled ? new SandboxProvider(process.env.SANDBOX_PAYMENTS_SECRET!, process.env.APP_URL!) : null;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const counts = { customers: 0, orders: 0, paid: 0, delivered: 0, cancelled: 0, reviews: 0 };
  let reviewIndex = 0;

  for (const [index, person] of CUSTOMERS.entries()) {
    const email = `${person.firstName.toLowerCase()}.${person.lastName.toLowerCase()}@${DEMO_DOMAIN}`;
    const joinedDaysAgo = 95 - index * 6;
    const user = await db.user.create({
      data: {
        email,
        firstName: person.firstName,
        lastName: person.lastName,
        roleId: role.id,
        emailVerifiedAt: new Date(),
        createdAt: new Date(Date.now() - joinedDaysAgo * DAY_SECONDS * 1000),
      },
    });
    const address = { firstName: person.firstName, lastName: person.lastName, company: null, line1: person.line1, line2: null, city: person.city, region: person.region, postalCode: person.postalCode, country: person.country, phone: null };
    await db.address.create({ data: { userId: user.id, label: "Home", ...address, isDefaultShipping: true, isDefaultBilling: true } });
    counts.customers++;

    const orderCount = 1 + Math.floor(random() * 3);
    for (let orderNumber = 0; orderNumber < orderCount; orderNumber++) {
      const [method] = await getShippingOptions(person.country);
      if (!method) continue;
      const cart = await getOrCreateUserCart(user.id, store.id);
      const lineCount = 1 + Math.floor(random() * 2);
      const chosen = new Set<string>();
      for (let line = 0; line < lineCount; line++) chosen.add(pick(variants).id);
      for (const variantId of chosen) await addItem(cart.id, variantId, 1 + Math.floor(random() * 2)).catch(() => undefined);
      if ((await db.cartItem.count({ where: { cartId: cart.id } })) === 0) continue;

      // The last order of the second customer is left unpaid and later cancelled (stock is returned).
      const leaveUnpaid = index === 1 && orderNumber === orderCount - 1;
      const outcome = await placeOrder(
        {
          idempotencyKey: `demo-${randomUUID()}`,
          email,
          phone: null,
          shippingAddress: address,
          billingSameAsShipping: true,
          shippingMethodId: method.id,
          paymentProvider: sandboxEnabled ? "sandbox" : "cod",
          customerNote: null,
          saveAddress: false,
          marketingOptIn: false,
        },
        { cartId: cart.id, userId: user.id, ipAddress: "127.0.0.1", appUrl },
      );
      const order = await db.order.findUniqueOrThrow({ where: { id: outcome.result.orderId }, include: { payments: true, items: true } });
      counts.orders++;

      if (leaveUnpaid) {
        await cancelOrder(order.id, "Payment not completed (demo data)", admin.id, { refund: false });
        counts.cancelled++;
      } else {
        const payment = order.payments[0];
        if (gateway && payment?.providerReference) {
          await processWebhook(
            "sandbox",
            gateway.buildWebhookRequest({ id: `demo_evt_${payment.id}`, type: "succeeded", providerReference: payment.providerReference, amountCents: order.totalCents, currency: order.currency }),
          );
          counts.paid++;
        }
        // Advance through the real transition rules: some orders stay confirmed, most ship, many are delivered.
        const roll = random();
        const path: OrderStatus[] = roll < 0.2 ? [] : roll < 0.45 ? [OrderStatus.PROCESSING, OrderStatus.SHIPPED] : [OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED];
        for (const status of path) await updateOrderStatus(order.id, status, admin.id, "Demo data");
        if (path.at(-1) === OrderStatus.DELIVERED) {
          counts.delivered++;
          const productId = order.items[0]?.productId;
          const text = REVIEW_TEXT[reviewIndex++ % REVIEW_TEXT.length];
          if (productId && !(await db.review.findFirst({ where: { productId, userId: user.id }, select: { id: true } }))) {
            await submitReview({ id: user.id, firstName: user.firstName, lastName: user.lastName, emailVerified: true }, { productId, rating: text.rating, title: text.title, body: text.body }).catch(() => undefined);
            const review = await db.review.findFirst({ where: { productId, userId: user.id }, select: { id: true, status: true } });
            if (review && review.status !== "APPROVED") await moderateReview(review.id, "approve", admin.id);
            if (review) counts.reviews++;
          }
        }
      }

      const daysAgo = Math.max(1, joinedDaysAgo - 3 - Math.floor(random() * Math.max(1, joinedDaysAgo - 4)));
      await backdateOrder(order.id, daysAgo * DAY_SECONDS);
    }
  }

  console.log(
    `✓ demo: ${counts.customers} customers, ${counts.orders} orders (${counts.paid} paid via signed sandbox webhooks, ${counts.delivered} delivered, ${counts.cancelled} cancelled), ${counts.reviews} approved reviews`,
  );
}
