import { BadgeCheck, FlaskConical } from "lucide-react";
import { RatingStars } from "@/components/ui/rating";
import type { PublicStoreReview } from "@/features/store-reviews/queries";
import { cn } from "@/utils/cn";

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

/** "Demo review" — never let sample data pass for a customer. */
export function DemoReviewBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-warning", className)}
      title="Sample data for demonstration — not a real customer"
    >
      <FlaskConical className="size-3" aria-hidden /> Demo review
    </span>
  );
}

/** One review as shoppers see it: stars, who and when, what they said, and the store's answer. */
export function StoreReviewCard({ review, storeName, className }: { review: PublicStoreReview; storeName: string; className?: string }) {
  return (
    <article className={cn("flex h-full flex-col rounded-lg border border-line bg-surface p-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <RatingStars value={review.rating} size="sm" />
        {review.isDemo ? (
          <DemoReviewBadge />
        ) : (
          <span className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-success">
            <BadgeCheck className="size-3.5" aria-hidden /> Verified order
          </span>
        )}
      </div>
      <p className="mt-3 flex-1 whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink-800">{review.body}</p>
      <p className="mt-4 text-[0.8125rem] text-ink-500">
        <span className="font-medium text-ink-800">{review.authorName}</span> · <time dateTime={review.createdAt.toISOString()}>{dateFormat.format(review.createdAt)}</time>
      </p>
      {review.ownerReply && (
        <div className="mt-4 rounded-sm border-l-2 border-ink-950 bg-canvas px-3 py-2.5">
          <p className="text-[0.75rem] font-semibold text-ink-950">Reply from {storeName}</p>
          <p className="mt-1 whitespace-pre-line text-[0.875rem] leading-relaxed text-ink-700">{review.ownerReply}</p>
        </div>
      )}
    </article>
  );
}
