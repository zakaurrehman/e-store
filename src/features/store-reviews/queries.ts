import { cacheLife, cacheTag } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { ReviewStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";

/** Everything a store's shoppers see of its reviews carries this tag; any change to them updates it. */
export const storeReviewsTag = (storeId: string) => `store-reviews:${storeId}`;

export const STORE_REVIEWS_PAGE_SIZE = 12;

const published = (storeId: string): Prisma.StoreReviewWhereInput => ({ storeId, status: ReviewStatus.APPROVED, deletedAt: null });

export type StoreRatingSummary = {
  average: number;
  count: number;
  /** How many of them are demo reviews — the summary says so whenever there are any. */
  demoCount: number;
  /** Reviews per star, 5 down to 1. */
  distribution: Array<{ stars: number; count: number }>;
};

/** A store's published rating, cached for its storefront (see readStoreRatingSummary). */
export async function getStoreRatingSummary(storeId: string): Promise<StoreRatingSummary> {
  "use cache";
  cacheLife("hours");
  cacheTag(storeReviewsTag(storeId));
  return readStoreRatingSummary(storeId);
}

/** A store's published rating: average, how many, how many are demo data, and the spread of stars. */
export async function readStoreRatingSummary(storeId: string): Promise<StoreRatingSummary> {
  const [overall, byStars, demoCount] = await Promise.all([
    db.storeReview.aggregate({ where: published(storeId), _avg: { rating: true }, _count: { _all: true } }),
    db.storeReview.groupBy({ by: ["rating"], where: published(storeId), _count: { _all: true } }),
    db.storeReview.count({ where: { ...published(storeId), isDemo: true } }),
  ]);
  const perStar = new Map(byStars.map((row) => [row.rating, row._count._all]));
  return {
    average: Math.round((overall._avg.rating ?? 0) * 10) / 10,
    count: overall._count._all,
    demoCount,
    distribution: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: perStar.get(stars) ?? 0 })),
  };
}

const publicReviewSelect = { id: true, rating: true, body: true, authorName: true, isDemo: true, ownerReply: true, ownerRepliedAt: true, createdAt: true, orderId: true } satisfies Prisma.StoreReviewSelect;
export type PublicStoreReview = Prisma.StoreReviewGetPayload<{ select: typeof publicReviewSelect }>;

/** A store's published reviews, newest first, cached for its storefront (see readPublishedStoreReviews). */
export async function listPublishedStoreReviews(storeId: string, page = 1, pageSize = STORE_REVIEWS_PAGE_SIZE) {
  "use cache";
  cacheLife("hours");
  cacheTag(storeReviewsTag(storeId));
  return readPublishedStoreReviews(storeId, page, pageSize);
}

/** A store's published reviews, newest first. */
export async function readPublishedStoreReviews(storeId: string, page = 1, pageSize = STORE_REVIEWS_PAGE_SIZE) {
  const where = published(storeId);
  const [total, reviews] = await Promise.all([
    db.storeReview.count({ where }),
    db.storeReview.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select: publicReviewSelect }),
  ]);
  return { total, page, pageCount: Math.max(1, Math.ceil(total / pageSize)), reviews };
}

export type OwnerReviewFilter = "all" | "published" | "pending" | "hidden";

/** The owner's view of their store's reviews — every state but deleted, read fresh. */
export async function listOwnerStoreReviews(storeId: string, options: { filter?: OwnerReviewFilter; page?: number; pageSize?: number } = {}) {
  const pageSize = options.pageSize ?? 20;
  const page = Math.max(1, options.page ?? 1);
  const status =
    options.filter === "published" ? { status: ReviewStatus.APPROVED } : options.filter === "pending" ? { status: ReviewStatus.PENDING } : options.filter === "hidden" ? { status: { in: [ReviewStatus.HIDDEN, ReviewStatus.REJECTED] } } : {};
  const where: Prisma.StoreReviewWhereInput = { storeId, deletedAt: null, ...status };
  const [total, reviews, counts] = await Promise.all([
    db.storeReview.count({ where }),
    db.storeReview.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { order: { select: { number: true } } } }),
    db.storeReview.groupBy({ by: ["status"], where: { storeId, deletedAt: null }, _count: { _all: true } }),
  ]);
  const countBy = Object.fromEntries(counts.map((row) => [row.status, row._count._all])) as Partial<Record<ReviewStatus, number>>;
  return { total, page, pageCount: Math.max(1, Math.ceil(total / pageSize)), reviews, countBy };
}
