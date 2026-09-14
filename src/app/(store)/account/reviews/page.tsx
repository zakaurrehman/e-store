import { Star } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { AccountSection } from "@/components/store/account/section";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { RatingStars } from "@/components/ui/rating";
import { OrderStatus, PaymentStatus } from "@/generated/prisma/enums";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "My reviews", robots: { index: false } };
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

async function Reviews() {
  const user = await requireUser("/account/reviews");
  const [reviews, purchased] = await Promise.all([
    db.review.findMany({ where: { userId: user.id, deletedAt: null }, orderBy: { createdAt: "desc" }, include: { product: { select: { name: true, slug: true, images: { take: 1, orderBy: { position: "asc" }, select: { media: { select: { url: true } } } } } } } }),
    db.orderItem.findMany({
      where: { review: null, productId: { not: null }, order: { userId: user.id, status: { not: OrderStatus.CANCELLED }, paymentStatus: { in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED] } } },
      orderBy: { order: { placedAt: "desc" } },
      distinct: ["productId"],
      include: { product: { select: { id: true, name: true, slug: true, status: true, images: { take: 1, orderBy: { position: "asc" }, select: { media: { select: { url: true } } } } } } },
    }),
  ]);
  const reviewedProductIds = new Set(reviews.map((review) => review.productId));
  const toReview = purchased.filter((item) => item.product && item.product.status === "ACTIVE" && !reviewedProductIds.has(item.product.id));

  return (
    <div className="space-y-12">
      {toReview.length > 0 && (
        <AccountSection title="Waiting for your review" description="Purchases you haven't reviewed yet. Your review will carry a verified-purchase badge.">
          <ul className="divide-y divide-line">
            {toReview.map((item) => (
              <li key={item.id} className="flex items-center gap-4 py-4">
                <div className="relative size-14 shrink-0 overflow-hidden rounded-sm bg-canvas">{item.product?.images[0] && <Image src={item.product.images[0].media.url} alt="" fill sizes="56px" className="object-cover" />}</div>
                <p className="flex-1 text-[0.9375rem] font-medium">{item.product?.name}</p>
                <ButtonLink href={`/p/${item.product?.slug}#reviews`} size="sm" variant="secondary">
                  Write a review
                </ButtonLink>
              </li>
            ))}
          </ul>
        </AccountSection>
      )}
      <AccountSection title="Your reviews">
        {reviews.length === 0 ? (
          <EmptyState icon={<Star className="size-6" strokeWidth={1.5} />} title="No reviews yet" description="Reviews you write appear here with their moderation status." className="py-10" />
        ) : (
          <ul className="divide-y divide-line">
            {reviews.map((review) => (
              <li key={review.id} className="flex gap-4 py-5">
                <div className="relative size-16 shrink-0 overflow-hidden rounded-sm bg-canvas">{review.product.images[0] && <Image src={review.product.images[0].media.url} alt="" fill sizes="64px" className="object-cover" />}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/p/${review.product.slug}#reviews`} className="text-[0.9375rem] font-medium hover:underline">
                      {review.product.name}
                    </Link>
                    <Badge tone={review.status === "APPROVED" ? "success" : review.status === "PENDING" ? "warning" : "neutral"}>{review.status === "APPROVED" ? "Published" : review.status === "PENDING" ? "Awaiting moderation" : review.status === "HIDDEN" ? "Hidden" : "Not published"}</Badge>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-[0.8125rem] text-ink-500">
                    <RatingStars value={review.rating} size="xs" /> {dateFormat.format(review.createdAt)}
                  </div>
                  <p className="mt-2 font-medium text-ink-900">{review.title}</p>
                  <p className="mt-1 line-clamp-3 text-[0.9375rem] text-ink-600">{review.body}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AccountSection>
    </div>
  );
}

export default function ReviewsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Reviews />
    </Suspense>
  );
}
