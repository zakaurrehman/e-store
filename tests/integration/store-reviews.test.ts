import { describe, expect, it } from "vitest";
import { seedDemoStoreReviews } from "../../db/seed/store-reviews";
import { addItem, createGuestCart } from "@/features/cart/service";
import { acceptOrder, placeOrder, processWebhook, updateOrderStatus } from "@/features/orders/service";
import { saveSettingsSection } from "@/features/settings/service";
import { readPublishedStoreReviews, readStoreRatingSummary } from "@/features/store-reviews/queries";
import { moderateStoreReview, removeDemoStoreReviews, replyToStoreReview, reportStoreReview, submitStoreReview } from "@/features/store-reviews/service";
import { openStoreForNewOwner } from "@/features/stores/onboarding";
import { addProductsToStore } from "@/features/stores/service";
import { OrderStatus, ReviewStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { isDomainError } from "@/server/errors";
import { orderAccessToken } from "@/server/notifications";
import { createProduct, invitation, orderContext, orderInput, sandboxGateway } from "./helpers";

let sequence = 0;

async function staff() {
  const role = await db.role.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } });
  return db.user.upsert({ where: { email: "reviews.staff@example.com" }, create: { email: "reviews.staff@example.com", firstName: "Rev", lastName: "Staff", roleId: role.id }, update: {} });
}

async function customer(firstName = "Clara") {
  sequence += 1;
  const role = await db.role.findUniqueOrThrow({ where: { key: "CUSTOMER" } });
  return db.user.create({ data: { email: `reviewer.${sequence}.${Date.now()}@example.com`, firstName, lastName: "Nguyen", roleId: role.id } });
}

async function ownerStore() {
  sequence += 1;
  const { user, store } = await openStoreForNewOwner({ storeName: `Review Store ${sequence}`, firstName: "Rae", lastName: "Owner", email: `review.owner.${sequence}.${Date.now()}@example.com`, password: "Correct-horse-battery-7", referralCode: await invitation() });
  const { product, variant } = await createProduct({ priceCents: 6000, stock: 30 });
  await db.productVariant.update({ where: { id: variant.id }, data: { costCents: 3000 } });
  await addProductsToStore(store.id, [product.id], { userId: user.id, asOwner: true });
  return { owner: user, store, variant };
}

/** A card order in the store, paid and — unless told otherwise — accepted and delivered. */
async function order(store: { id: string; ownerId: string | null }, variantId: string, options: { userId?: string | null; email?: string; deliver?: boolean } = {}) {
  const { cart } = await createGuestCart(store.id);
  await addItem(cart.id, variantId, 1);
  const outcome = await placeOrder(await orderInput({ email: options.email ?? "guest.buyer@example.com" }), orderContext(cart.id, options.userId ?? null));
  const payment = await db.payment.findFirstOrThrow({ where: { orderId: outcome.result.orderId } });
  await processWebhook("sandbox", await sandboxGateway().buildWebhookRequest({ id: `evt_${payment.id}`, type: "succeeded", providerReference: payment.providerReference!, amountCents: payment.amountCents, currency: "USD" }));
  if (options.deliver !== false) {
    await acceptOrder(outcome.result.orderId, { userId: store.ownerId!, as: "owner" });
    const admin = await staff();
    for (const status of [OrderStatus.PACKED, OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED]) await updateOrderStatus(outcome.result.orderId, status, admin.id);
  }
  return db.order.findUniqueOrThrow({ where: { id: outcome.result.orderId } });
}

const errorCode = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return null;
  } catch (error) {
    return isDomainError(error) ? error.code : "UNEXPECTED";
  }
};

const review = (overrides: Partial<Parameters<typeof submitStoreReview>[0]> & Pick<Parameters<typeof submitStoreReview>[0], "storeId" | "orderNumber" | "author">) =>
  submitStoreReview({ rating: 5, body: "Quick delivery and lovely packaging.", ...overrides });

describe("store reviews", () => {
  it("can only be written by the customer of a delivered order, once per order", async () => {
    const { store, variant } = await ownerStore();
    const buyer = await customer();
    const stranger = await customer("Stan");

    // Not delivered yet: refused.
    const early = await order(store, variant.id, { userId: buyer.id, email: buyer.email, deliver: false });
    expect(await errorCode(review({ storeId: store.id, orderNumber: early.number, author: { userId: buyer.id, token: null } }))).toBe("NOT_DELIVERED");

    const delivered = await order(store, variant.id, { userId: buyer.id, email: buyer.email });
    // Someone else — signed in, or with a made-up link — cannot review it.
    expect(await errorCode(review({ storeId: store.id, orderNumber: delivered.number, author: { userId: stranger.id, token: null } }))).toBe("NOT_FOUND");
    expect(await errorCode(review({ storeId: store.id, orderNumber: delivered.number, author: { userId: null, token: "not-the-token" } }))).toBe("NOT_FOUND");
    // Nor from another store's address.
    const other = await ownerStore();
    expect(await errorCode(review({ storeId: other.store.id, orderNumber: delivered.number, author: { userId: buyer.id, token: null } }))).toBe("NOT_FOUND");
    // Out-of-range ratings and a too-short review are refused before anything is written.
    for (const rating of [0, 6, 3.5]) expect(await errorCode(review({ storeId: store.id, orderNumber: delivered.number, rating, author: { userId: buyer.id, token: null } }))).toBe("RATING_INVALID");
    expect(await errorCode(review({ storeId: store.id, orderNumber: delivered.number, body: "Nice", author: { userId: buyer.id, token: null } }))).toBe("BODY_INVALID");

    // Its customer can — and it waits for staff, as reviews do while approval is required.
    const written = await review({ storeId: store.id, orderNumber: delivered.number, rating: 4, author: { userId: buyer.id, token: null } });
    expect(written).toMatchObject({ rating: 4, status: ReviewStatus.PENDING, isDemo: false, orderId: delivered.id, userId: buyer.id, authorName: "Clara N." });
    // A second review of the same order is refused.
    expect(await errorCode(review({ storeId: store.id, orderNumber: delivered.number, author: { userId: buyer.id, token: null } }))).toBe("ALREADY_REVIEWED");

    // Three submissions at the same moment still leave one review.
    const another = await order(store, variant.id, { userId: buyer.id, email: buyer.email });
    const results = await Promise.allSettled([1, 2, 3].map(() => review({ storeId: store.id, orderNumber: another.number, author: { userId: buyer.id, token: null } })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.storeReview.count({ where: { orderId: another.id } })).toBe(1);
  });

  it("lets a guest review through their order's signed link, named from the delivery address", async () => {
    const { store, variant } = await ownerStore();
    const delivered = await order(store, variant.id, { email: "guest.reviewer@example.com" });
    const written = await review({ storeId: store.id, orderNumber: delivered.number, author: { userId: null, token: orderAccessToken(delivered) } });
    expect(written.userId).toBeNull();
    expect(written.authorName).toMatch(/^\w+ \w\.$/);
  });

  it("publishes immediately when approval is not required", async () => {
    const { store, variant } = await ownerStore();
    const commerce = (await db.setting.findUniqueOrThrow({ where: { key: "commerce" } })).value as Record<string, unknown>;
    await saveSettingsSection("commerce", { ...commerce, reviewsRequireApproval: false } as never);
    try {
      const delivered = await order(store, variant.id);
      const written = await review({ storeId: store.id, orderNumber: delivered.number, author: { userId: null, token: orderAccessToken(delivered) } });
      expect(written.status).toBe(ReviewStatus.APPROVED);
    } finally {
      await saveSettingsSection("commerce", { ...commerce, reviewsRequireApproval: true } as never);
    }
  });

  it("shows shoppers only published reviews, and says how many of them are demo data", async () => {
    const { store, variant } = await ownerStore();
    const admin = await staff();
    const five = await order(store, variant.id);
    const one = await order(store, variant.id);
    const published = await review({ storeId: store.id, orderNumber: five.number, rating: 5, author: { userId: null, token: orderAccessToken(five) } });
    await review({ storeId: store.id, orderNumber: one.number, rating: 1, author: { userId: null, token: orderAccessToken(one) } });
    await moderateStoreReview(published.id, "approve", admin.id);

    // The pending 1-star review is not counted yet.
    expect(await readStoreRatingSummary(store.id)).toMatchObject({ average: 5, count: 1, demoCount: 0 });
    await db.storeReview.create({ data: { storeId: store.id, rating: 3, body: "Sample review for the demo.", authorName: "Demo D.", status: ReviewStatus.APPROVED, isDemo: true } });
    const summary = await readStoreRatingSummary(store.id);
    expect(summary).toMatchObject({ average: 4, count: 2, demoCount: 1 });
    expect(summary.distribution).toEqual([
      { stars: 5, count: 1 },
      { stars: 4, count: 0 },
      { stars: 3, count: 1 },
      { stars: 2, count: 0 },
      { stars: 1, count: 0 },
    ]);
    const list = await readPublishedStoreReviews(store.id);
    expect(list.reviews.map((row) => row.isDemo).sort()).toEqual([false, true]);

    // Hidden or deleted, a review leaves the store's rating.
    await moderateStoreReview(published.id, "hide", admin.id);
    expect(await readStoreRatingSummary(store.id)).toMatchObject({ count: 1, demoCount: 1 });
  });

  it("lets the owner reply and report, but only staff hide or delete — and a deleted review is not written again", async () => {
    const { owner, store, variant } = await ownerStore();
    const rival = await ownerStore();
    const admin = await staff();
    const delivered = await order(store, variant.id);
    const token = orderAccessToken(delivered);
    const written = await review({ storeId: store.id, orderNumber: delivered.number, rating: 2, body: "Took a while to arrive.", author: { userId: null, token } });

    await replyToStoreReview(store.id, written.id, "Sorry for the wait — we've changed couriers.", owner.id);
    expect((await db.storeReview.findUniqueOrThrow({ where: { id: written.id } })).ownerReply).toBe("Sorry for the wait — we've changed couriers.");
    // Another store's owner cannot touch it.
    expect(await errorCode(replyToStoreReview(rival.store.id, written.id, "Not mine", rival.owner.id))).toBe("NOT_FOUND");
    expect(await errorCode(reportStoreReview(rival.store.id, written.id, "Not mine at all", rival.owner.id))).toBe("NOT_FOUND");

    // A report needs a reason, and staff can set it aside.
    expect(await errorCode(reportStoreReview(store.id, written.id, "bad", owner.id))).toBe("REASON_REQUIRED");
    await reportStoreReview(store.id, written.id, "Mentions a different shop", owner.id);
    expect((await db.storeReview.findUniqueOrThrow({ where: { id: written.id } })).reportedAt).not.toBeNull();
    await moderateStoreReview(written.id, "dismiss-report", admin.id);
    expect((await db.storeReview.findUniqueOrThrow({ where: { id: written.id } })).reportedAt).toBeNull();

    // Staff delete it; the customer cannot write it again, and the store's rating no longer counts it.
    await moderateStoreReview(written.id, "delete", admin.id);
    expect(await errorCode(review({ storeId: store.id, orderNumber: delivered.number, author: { userId: null, token } }))).toBe("ALREADY_REVIEWED");
    expect((await readStoreRatingSummary(store.id)).count).toBe(0);
    expect(await db.auditLog.count({ where: { entityId: written.id, action: { startsWith: "store-review." } } })).toBe(4);
  });

  it("seeds demo reviews marked as demo data, replaces them on a re-run, and removes them all in one step", async () => {
    await ownerStore();
    await seedDemoStoreReviews();
    const seeded = await db.storeReview.findMany({ where: { isDemo: true }, select: { rating: true, orderId: true, status: true, storeId: true } });
    expect(seeded.length).toBeGreaterThanOrEqual(24);
    expect(seeded.every((row) => row.orderId === null && row.status === ReviewStatus.APPROVED && row.rating >= 3 && row.rating <= 5)).toBe(true);
    expect(new Set(seeded.map((row) => row.storeId)).size).toBeGreaterThan(1);

    const before = seeded.length;
    await seedDemoStoreReviews();
    expect(await db.storeReview.count({ where: { isDemo: true } })).toBe(before);

    const real = await db.storeReview.count({ where: { isDemo: false } });
    const { count } = await removeDemoStoreReviews((await staff()).id);
    expect(count).toBe(before);
    expect(await db.storeReview.count({ where: { isDemo: true } })).toBe(0);
    expect(await db.storeReview.count({ where: { isDemo: false } })).toBe(real);
  });
});
