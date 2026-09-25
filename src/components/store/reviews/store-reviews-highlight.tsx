import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { StoreContext } from "@/features/stores/context";
import { getStoreRatingSummary, listPublishedStoreReviews } from "@/features/store-reviews/queries";
import { StoreRatingOverview } from "./store-rating-summary";
import { StoreReviewCard } from "./store-review-card";

/** "What customers say" on the store's home page: the rating and the latest reviews, near the top. */
export async function StoreReviewsHighlight({ store }: { store: Pick<StoreContext, "id" | "name"> }) {
  const [summary, latest] = await Promise.all([getStoreRatingSummary(store.id), listPublishedStoreReviews(store.id, 1, 3)]);
  if (summary.count === 0) return null;
  return (
    <section id="reviews" aria-labelledby="store-reviews-heading" className="scroll-mt-24 border-y border-line bg-canvas/50 py-12 md:py-16">
      <div className="container-page grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <h2 id="store-reviews-heading" className="text-2xl font-semibold tracking-[-0.02em] md:text-[1.75rem]">
            What customers say
          </h2>
          <StoreRatingOverview summary={summary} className="mt-5" />
          <Link href="/reviews" className="mt-6 inline-flex items-center gap-1.5 text-[0.9375rem] font-medium text-ink-950 underline decoration-ink-300 underline-offset-4 hover:decoration-ink-950">
            Read all {summary.count} review{summary.count === 1 ? "" : "s"} <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:col-span-8 lg:grid-cols-3">
          {latest.reviews.map((review) => (
            <li key={review.id}>
              <StoreReviewCard review={review} storeName={store.name} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
