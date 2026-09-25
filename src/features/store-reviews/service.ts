import { Prisma } from "@/generated/prisma/client";
import { OrderStatus, ReviewStatus, StoreStatus } from "@/generated/prisma/enums";
import { getOrderByAccessToken, getOrderForCustomer } from "@/features/orders/queries";
import { loadSettings } from "@/features/settings/service";
import { writeAudit } from "@/server/audit";
import { db } from "@/server/db";
import { DomainError, NotFoundError } from "@/server/errors";

export class StoreReviewError extends DomainError {}

export const STORE_REVIEW_BODY = { min: 10, max: 1500 } as const;
export const STORE_REVIEW_REPLY_MAX = 1000;

/**
 * Who is writing: a signed-in customer (their account must have placed the order), or a guest holding the
 * order's signed link from their email. Either way the order itself is the proof they bought from the store.
 */
export type ReviewAuthor = { userId: string | null; token: string | null };

/** The customer's order in this store, when they may see it — the same checks as the order pages. */
async function customersOrder(orderNumber: string, storeId: string, author: ReviewAuthor) {
  const mine = author.userId ? await getOrderForCustomer(author.userId, orderNumber, storeId) : null;
  return mine ?? (await getOrderByAccessToken(orderNumber, author.token, storeId));
}

/** First name and last initial — how a reviewer is shown on the store. */
function displayName(first?: string | null, last?: string | null) {
  const given = first?.trim();
  if (!given) return "Verified customer";
  const initial = last?.trim().charAt(0);
  return initial ? `${given} ${initial.toUpperCase()}.` : given;
}

/**
 * Leaves a rating and review of the store for one delivered order. Only its customer can, only once the
 * order has been delivered, and only once per order — the database's unique order id makes a second one
 * impossible, even for two submissions at the same moment.
 */
export async function submitStoreReview(input: { storeId: string; orderNumber: string; rating: number; body: string; author: ReviewAuthor }) {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new StoreReviewError("RATING_INVALID", "Choose between 1 and 5 stars.", { fieldErrors: { rating: ["Choose between 1 and 5 stars."] } });
  }
  const body = input.body.trim();
  if (body.length < STORE_REVIEW_BODY.min || body.length > STORE_REVIEW_BODY.max) {
    throw new StoreReviewError("BODY_INVALID", `Write between ${STORE_REVIEW_BODY.min} and ${STORE_REVIEW_BODY.max} characters.`, { fieldErrors: { body: [`Write between ${STORE_REVIEW_BODY.min} and ${STORE_REVIEW_BODY.max} characters.`] } });
  }

  const order = await customersOrder(input.orderNumber, input.storeId, input.author);
  if (!order) throw new NotFoundError("We couldn't find that order.");
  if (order.status !== OrderStatus.DELIVERED) throw new StoreReviewError("NOT_DELIVERED", "You can review the store once your order has been delivered.");
  const store = await db.store.findFirst({ where: { id: order.storeId, deletedAt: null, status: StoreStatus.ACTIVE }, select: { id: true } });
  if (!store) throw new NotFoundError("This store is no longer open.");
  // Deleted reviews count too: a review staff removed is not written again under the same order.
  if (await db.storeReview.findUnique({ where: { orderId: order.id }, select: { id: true } })) {
    throw new StoreReviewError("ALREADY_REVIEWED", "You've already reviewed this order.");
  }

  const [settings, account] = await Promise.all([loadSettings(), order.userId ? db.user.findUnique({ where: { id: order.userId }, select: { firstName: true, lastName: true } }) : null]);
  const authorName = account ? displayName(account.firstName, account.lastName) : displayName(order.shippingAddress?.firstName, order.shippingAddress?.lastName);
  try {
    return await db.storeReview.create({
      data: {
        storeId: store.id,
        orderId: order.id,
        userId: order.userId,
        rating: input.rating,
        body,
        authorName,
        status: settings.commerce.reviewsRequireApproval ? ReviewStatus.PENDING : ReviewStatus.APPROVED,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new StoreReviewError("ALREADY_REVIEWED", "You've already reviewed this order.");
    throw error;
  }
}

/** The review left for an order, if any (a deleted one still counts, so it cannot be written twice). */
export function storeReviewForOrder(orderId: string) {
  return db.storeReview.findUnique({ where: { orderId }, select: { id: true, rating: true, body: true, status: true, ownerReply: true, createdAt: true, deletedAt: true } });
}

const ownersReview = async (storeId: string, reviewId: string) => {
  const review = await db.storeReview.findFirst({ where: { id: reviewId, storeId, deletedAt: null }, select: { id: true } });
  if (!review) throw new NotFoundError("Review not found.");
  return review;
};

/** The store owner answers a review in public, under it. An empty reply removes theirs. */
export async function replyToStoreReview(storeId: string, reviewId: string, reply: string, ownerId: string) {
  await ownersReview(storeId, reviewId);
  const text = reply.trim().slice(0, STORE_REVIEW_REPLY_MAX);
  const review = await db.storeReview.update({ where: { id: reviewId }, data: { ownerReply: text || null, ownerRepliedAt: text ? new Date() : null } });
  await writeAudit({ actorId: ownerId, action: "store-review.reply", entityType: "StoreReview", entityId: reviewId, summary: text ? "Owner replied to a review" : "Owner removed their reply" });
  return review;
}

/**
 * The owner asks Zendropship to look at a review they think breaks the rules. Owners cannot hide or delete
 * reviews themselves — that would make every store's rating its owner's choice — so staff decide.
 */
export async function reportStoreReview(storeId: string, reviewId: string, reason: string, ownerId: string) {
  await ownersReview(storeId, reviewId);
  const why = reason.trim().slice(0, 500);
  if (why.length < 5) throw new StoreReviewError("REASON_REQUIRED", "Say briefly what is wrong with this review.", { fieldErrors: { reason: ["Say briefly what is wrong with it."] } });
  const review = await db.storeReview.update({ where: { id: reviewId }, data: { reportedAt: new Date(), reportReason: why } });
  await writeAudit({ actorId: ownerId, action: "store-review.report", entityType: "StoreReview", entityId: reviewId, summary: `Owner reported a review: ${why}` });
  return review;
}

export type StoreReviewModeration = "approve" | "hide" | "reject" | "delete" | "dismiss-report";

/** Staff decide what a review does: publish it, hide or reject it, delete it, or set a report aside. */
export async function moderateStoreReview(reviewId: string, action: StoreReviewModeration, actorId: string) {
  const review = await db.storeReview.findFirst({ where: { id: reviewId, deletedAt: null }, select: { id: true, storeId: true } });
  if (!review) throw new NotFoundError("Review not found.");
  const now = new Date();
  const data: Prisma.StoreReviewUpdateInput = { moderatedAt: now };
  if (action === "approve") Object.assign(data, { status: ReviewStatus.APPROVED, reportedAt: null, reportReason: null });
  if (action === "hide") data.status = ReviewStatus.HIDDEN;
  if (action === "reject") data.status = ReviewStatus.REJECTED;
  if (action === "delete") data.deletedAt = now;
  if (action === "dismiss-report") Object.assign(data, { reportedAt: null, reportReason: null });
  await db.storeReview.update({ where: { id: reviewId }, data });
  await writeAudit({ actorId, action: `store-review.${action}`, entityType: "StoreReview", entityId: reviewId, summary: `Store review ${action}` });
  return review;
}

/** Clears every demo review — the sample data — before a store goes in front of real customers. */
export async function removeDemoStoreReviews(actorId: string) {
  const stores = await db.storeReview.findMany({ where: { isDemo: true }, distinct: ["storeId"], select: { storeId: true } });
  const { count } = await db.storeReview.deleteMany({ where: { isDemo: true } });
  await writeAudit({ actorId, action: "store-review.remove-demo", entityType: "StoreReview", entityId: null, summary: `Removed ${count} demo store review(s)` });
  return { count, storeIds: stores.map((row) => row.storeId) };
}
