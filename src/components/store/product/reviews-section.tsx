import { BadgeCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { RatingStars } from "@/components/ui/rating";
import type { ProductDetail } from "@/features/catalog/queries";
import { getProductReviews, type ReviewSort } from "@/features/reviews/queries";
import { getReviewEligibility } from "@/features/reviews/service";
import { getStoreSettings } from "@/features/settings/queries";
import { getCurrentUser } from "@/server/auth/session";
import { cn } from "@/utils/cn";
import { ReviewForm } from "./review-form";

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" });

export async function ReviewsSection({ product, page, sort }: { product: Pick<ProductDetail, "id" | "slug" | "ratingAverage" | "ratingCount" | "ratingDistribution">; page: number; sort: ReviewSort }) {
  const [user, settings, data] = await Promise.all([getCurrentUser(), getStoreSettings(), getProductReviews(product.id, page, sort)]);
  const eligibility = await getReviewEligibility(user, product.id);
  const total = product.ratingCount;

  const writeArea = (() => {
    switch (eligibility.status) {
      case "signed-out":
        return (
          <div>
            <p className="text-[0.9375rem] text-ink-600">Share your experience with other customers.</p>
            <ButtonLink href={`/login?next=${encodeURIComponent(`/p/${product.slug}#reviews`)}`} variant="secondary" className="mt-4">
              Sign in to write a review
            </ButtonLink>
          </div>
        );
      case "unverified-email":
        return <Alert tone="info">Confirm your email address to write a review. Check your inbox for the confirmation link, or resend it from your account.</Alert>;
      case "purchase-required":
        return <Alert tone="info">Reviews are open to customers who have bought this product.</Alert>;
      case "already-reviewed":
        return <Alert tone={eligibility.reviewStatus === "APPROVED" ? "success" : "info"}>{eligibility.reviewStatus === "PENDING" ? "Thanks for your review — it's awaiting moderation." : "Thanks for reviewing this product."}</Alert>;
      case "eligible":
        return (
          <details className="group rounded-md border border-line p-5 open:pb-6">
            <summary className="flex cursor-pointer list-none items-center justify-between font-medium [&::-webkit-details-marker]:hidden">
              Write a review
              <span aria-hidden className="text-xl leading-none text-ink-400 transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <div className="mt-5">
              {eligibility.verifiedPurchase && (
                <p className="mb-4 inline-flex items-center gap-1.5 text-[0.8125rem] text-success">
                  <BadgeCheck className="size-4" /> Your review will show a verified purchase badge
                </p>
              )}
              <ReviewForm productId={product.id} imagesEnabled={settings.commerce.reviewImagesEnabled} />
            </div>
          </details>
        );
    }
  })();

  const sortHref = (value: ReviewSort) => `/p/${product.slug}?reviewSort=${value}#reviews`;

  return (
    <section id="reviews" aria-labelledby="reviews-heading" className="scroll-mt-24 border-t border-line py-14 md:py-20">
      <div className="container-page grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <h2 id="reviews-heading" className="text-2xl font-semibold tracking-[-0.02em] md:text-[1.75rem]">
            Customer reviews
          </h2>
          {total > 0 ? (
            <div className="mt-5">
              <div className="flex items-end gap-3">
                <span className="tabular text-5xl font-semibold tracking-[-0.03em]">{product.ratingAverage.toFixed(1)}</span>
                <div className="pb-1.5">
                  <RatingStars value={product.ratingAverage} size="md" />
                  <p className="mt-1 text-[0.8125rem] text-ink-500">
                    Based on {total} review{total === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <ul className="mt-6 space-y-2" aria-label="Rating distribution">
                {[5, 4, 3, 2, 1].map((stars) => {
                  const count = product.ratingDistribution[stars] ?? 0;
                  const percent = total ? Math.round((count / total) * 100) : 0;
                  return (
                    <li key={stars} className="flex items-center gap-3 text-[0.8125rem] text-ink-600">
                      <span className="tabular w-8">{stars}★</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas-deep">
                        <span className="block h-full rounded-full bg-ink-950" style={{ width: `${percent}%` }} />
                      </span>
                      <span className="tabular w-8 text-right">{count}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="mt-4 text-[0.9375rem] text-ink-600">No reviews yet. Reviews come only from real customers and are checked before they appear.</p>
          )}
          <div className="mt-8">{writeArea}</div>
        </div>

        <div className="lg:col-span-8">
          {data.total > 0 && (
            <div className="flex items-center justify-between gap-4 border-b border-line pb-4">
              <p className="text-sm text-ink-600">
                Showing {Math.min(data.total, (page - 1) * 6 + 1)}–{Math.min(data.total, page * 6)} of {data.total}
              </p>
              <nav aria-label="Sort reviews" className="flex gap-1 text-sm">
                {(["newest", "highest", "lowest"] as const).map((value) => (
                  <Link key={value} href={sortHref(value)} scroll={false} aria-current={sort === value ? "true" : undefined} className={cn("rounded-full px-3 py-1.5 capitalize", sort === value ? "bg-ink-950 text-white" : "text-ink-600 hover:bg-canvas")}>
                    {value}
                  </Link>
                ))}
              </nav>
            </div>
          )}
          <ul className="divide-y divide-line">
            {data.reviews.map((review) => (
              <li key={review.id} className="py-7">
                <article>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <RatingStars value={review.rating} size="sm" />
                    <time dateTime={review.createdAt.toISOString()} className="text-[0.8125rem] text-ink-500">
                      {dateFormat.format(review.createdAt)}
                    </time>
                  </div>
                  <h3 className="mt-3 font-medium text-ink-950">{review.title}</h3>
                  <p className="mt-2 whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink-700">{review.body}</p>
                  {review.images.length > 0 && (
                    <ul className="mt-4 flex gap-2">
                      {review.images.map(({ media }) => (
                        <li key={media.id} className="relative size-20 overflow-hidden rounded-sm bg-canvas">
                          <Image src={media.url} alt={media.alt || "Customer photo"} fill sizes="80px" className="object-cover" />
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-4 flex items-center gap-2 text-[0.8125rem] text-ink-600">
                    {review.authorName}
                    {review.isVerifiedPurchase && (
                      <span className="inline-flex items-center gap-1 text-success">
                        <BadgeCheck className="size-3.5" aria-hidden /> Verified purchase
                      </span>
                    )}
                  </p>
                  {review.adminReply && (
                    <div className="mt-4 rounded-sm bg-canvas px-4 py-3 text-[0.875rem] text-ink-700">
                      <p className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-ink-500">Response from Veyora</p>
                      <p className="mt-1">{review.adminReply}</p>
                    </div>
                  )}
                </article>
              </li>
            ))}
          </ul>
          {data.pageCount > 1 && (
            <nav aria-label="Review pages" className="mt-4 flex gap-2">
              {page > 1 && (
                <ButtonLink href={`/p/${product.slug}?reviewPage=${page - 1}&reviewSort=${sort}#reviews`} variant="secondary" size="sm" scroll={false}>
                  Previous
                </ButtonLink>
              )}
              {page < data.pageCount && (
                <ButtonLink href={`/p/${product.slug}?reviewPage=${page + 1}&reviewSort=${sort}#reviews`} variant="secondary" size="sm" scroll={false}>
                  More reviews
                </ButtonLink>
              )}
            </nav>
          )}
        </div>
      </div>
    </section>
  );
}
