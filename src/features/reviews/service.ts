import { OrderStatus, PaymentStatus, ProductStatus, ReviewStatus } from "@/generated/prisma/enums";
import { recomputeProductRating } from "@/features/catalog/service";
import { loadSettings } from "@/features/settings/service";
import { writeAudit } from "@/server/audit";
import { db } from "@/server/db";
import { DomainError, NotFoundError } from "@/server/errors";

export type ReviewEligibility =
  | { status: "signed-out" }
  | { status: "unverified-email" }
  | { status: "purchase-required" }
  | { status: "already-reviewed"; reviewStatus: ReviewStatus }
  | { status: "eligible"; verifiedPurchase: boolean };

async function findPurchasedItem(userId: string, productId: string) {
  return db.orderItem.findFirst({
    where: {
      productId,
      review: null,
      order: { userId, status: { not: OrderStatus.CANCELLED }, paymentStatus: { in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED] } },
    },
    orderBy: { order: { placedAt: "desc" } },
    select: { id: true },
  });
}

export async function getReviewEligibility(user: { id: string; emailVerified: boolean } | null, productId: string): Promise<ReviewEligibility> {
  if (!user) return { status: "signed-out" };
  const existing = await db.review.findUnique({ where: { productId_userId: { productId, userId: user.id } }, select: { status: true, deletedAt: true } });
  if (existing && !existing.deletedAt) return { status: "already-reviewed", reviewStatus: existing.status };
  if (!user.emailVerified) return { status: "unverified-email" };
  const [settings, purchased] = await Promise.all([loadSettings(), findPurchasedItem(user.id, productId)]);
  if (settings.commerce.reviewsVerifiedPurchaseOnly && !purchased) return { status: "purchase-required" };
  return { status: "eligible", verifiedPurchase: !!purchased };
}

export type ReviewInput = { productId: string; rating: number; title: string; body: string; imageIds?: string[] };

export async function submitReview(user: { id: string; firstName: string; lastName: string; emailVerified: boolean }, input: ReviewInput) {
  const product = await db.product.findFirst({ where: { id: input.productId, status: ProductStatus.ACTIVE, deletedAt: null }, select: { id: true, slug: true } });
  if (!product) throw new NotFoundError("This product is no longer available.");
  const eligibility = await getReviewEligibility(user, product.id);
  if (eligibility.status === "already-reviewed") throw new DomainError("ALREADY_REVIEWED", "You've already reviewed this product.");
  if (eligibility.status === "unverified-email") throw new DomainError("EMAIL_UNVERIFIED", "Please confirm your email address before writing a review.");
  if (eligibility.status === "purchase-required") throw new DomainError("PURCHASE_REQUIRED", "Reviews are limited to customers who bought this product.");
  if (eligibility.status !== "eligible") throw new DomainError("SIGN_IN", "Sign in to write a review.");

  const settings = await loadSettings();
  const purchased = eligibility.verifiedPurchase ? await findPurchasedItem(user.id, product.id) : null;
  const status = settings.commerce.reviewsRequireApproval ? ReviewStatus.PENDING : ReviewStatus.APPROVED;
  const imageIds = settings.commerce.reviewImagesEnabled ? [...new Set(input.imageIds ?? [])].slice(0, 4) : [];

  // A soft-deleted earlier review is replaced rather than duplicated.
  await db.review.deleteMany({ where: { productId: product.id, userId: user.id, deletedAt: { not: null } } });
  const review = await db.review.create({
    data: {
      productId: product.id,
      userId: user.id,
      orderItemId: purchased?.id ?? null,
      rating: input.rating,
      title: input.title,
      body: input.body,
      authorName: `${user.firstName} ${user.lastName.charAt(0)}.`,
      isVerifiedPurchase: !!purchased,
      status,
      images: { create: imageIds.map((mediaId, position) => ({ mediaId, position })) },
    },
  });
  if (status === ReviewStatus.APPROVED) await recomputeProductRating(product.id);
  return { review, productSlug: product.slug };
}

export async function moderateReview(reviewId: string, action: "approve" | "reject" | "hide" | "feature" | "unfeature" | "delete", actorId: string, reply?: string | null) {
  const review = await db.review.findUniqueOrThrow({ where: { id: reviewId }, include: { product: { select: { id: true, slug: true } } } });
  const data: Parameters<typeof db.review.update>[0]["data"] = { moderatedAt: new Date() };
  switch (action) {
    case "approve":
      data.status = ReviewStatus.APPROVED;
      break;
    case "reject":
      data.status = ReviewStatus.REJECTED;
      data.isFeatured = false;
      break;
    case "hide":
      data.status = ReviewStatus.HIDDEN;
      data.isFeatured = false;
      break;
    case "feature":
      if (review.status !== ReviewStatus.APPROVED) throw new DomainError("NOT_APPROVED", "Approve the review before featuring it.");
      data.isFeatured = true;
      break;
    case "unfeature":
      data.isFeatured = false;
      break;
    case "delete":
      data.deletedAt = new Date();
      data.isFeatured = false;
      break;
  }
  if (reply !== undefined) data.adminReply = reply?.trim() || null;
  await db.review.update({ where: { id: reviewId }, data });
  await recomputeProductRating(review.productId);
  await writeAudit({ actorId, action: `review.${action}`, entityType: "Review", entityId: reviewId, summary: `Review ${action} on product ${review.product.slug}` });
  return review.product;
}
