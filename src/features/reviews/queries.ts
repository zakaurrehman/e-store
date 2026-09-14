import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { ReviewStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";

export const reviewsTag = (productId: string) => `reviews:${productId}`;
export const REVIEW_PAGE_SIZE = 6;
export type ReviewSort = "newest" | "highest" | "lowest";

export async function getProductReviews(productId: string, page = 1, sort: ReviewSort = "newest") {
  "use cache";
  cacheLife("minutes");
  cacheTag(reviewsTag(productId), "reviews");
  const orderBy: Prisma.ReviewOrderByWithRelationInput[] =
    sort === "highest" ? [{ rating: "desc" }, { createdAt: "desc" }] : sort === "lowest" ? [{ rating: "asc" }, { createdAt: "desc" }] : [{ createdAt: "desc" }];
  const where = { productId, status: ReviewStatus.APPROVED, deletedAt: null } satisfies Prisma.ReviewWhereInput;
  const [total, reviews] = await Promise.all([
    db.review.count({ where }),
    db.review.findMany({
      where,
      orderBy,
      skip: (page - 1) * REVIEW_PAGE_SIZE,
      take: REVIEW_PAGE_SIZE,
      select: {
        id: true,
        rating: true,
        title: true,
        body: true,
        authorName: true,
        isVerifiedPurchase: true,
        adminReply: true,
        createdAt: true,
        images: { orderBy: { position: "asc" }, select: { media: { select: { id: true, url: true, alt: true } } } },
      },
    }),
  ]);
  return { total, page, pageCount: Math.max(1, Math.ceil(total / REVIEW_PAGE_SIZE)), reviews };
}
