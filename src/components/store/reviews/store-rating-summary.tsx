import { RatingStars } from "@/components/ui/rating";
import type { StoreRatingSummary } from "@/features/store-reviews/queries";
import { cn } from "@/utils/cn";
import { DemoReviewBadge } from "./store-review-card";

/** The store's average, how many reviews it is based on, and the spread of stars. */
export function StoreRatingOverview({ summary, className }: { summary: StoreRatingSummary; className?: string }) {
  const widest = Math.max(1, ...summary.distribution.map((row) => row.count));
  return (
    <div className={className}>
      <div className="flex items-end gap-3">
        <span className="tabular text-5xl font-semibold tracking-[-0.03em] text-ink-950">{summary.average.toFixed(1)}</span>
        <div className="pb-1.5">
          <RatingStars value={summary.average} size="md" />
          <p className="mt-1 text-[0.8125rem] text-ink-500">
            Based on {summary.count} review{summary.count === 1 ? "" : "s"}
          </p>
        </div>
      </div>
      {summary.demoCount > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-[0.8125rem] text-ink-600">
          <DemoReviewBadge />
          {summary.demoCount === summary.count ? "All of these are demo reviews" : `${summary.demoCount} of these are demo reviews`} — sample data for demonstration, not real customers.
        </p>
      )}
      <ul className="mt-5 space-y-1.5" aria-label="Reviews by star rating">
        {summary.distribution.map((row) => (
          <li key={row.stars} className="flex items-center gap-3 text-[0.8125rem] text-ink-600">
            <span className="tabular w-10 shrink-0">{row.stars} star</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-200" aria-hidden>
              <span className={cn("block h-full rounded-full bg-ink-950")} style={{ width: `${(row.count / widest) * 100}%` }} />
            </span>
            <span className="tabular w-6 shrink-0 text-right">{row.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
