import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { StoreRatingOverview } from "@/components/store/reviews/store-rating-summary";
import { StoreReviewCard } from "@/components/store/reviews/store-review-card";
import { Skeleton } from "@/components/ui/misc";
import { getStoreRatingSummary, listPublishedStoreReviews } from "@/features/store-reviews/queries";
import { storeFromParams } from "@/features/stores/route";

export async function generateMetadata({ params }: PageProps<"/s/[store]/reviews">): Promise<Metadata> {
  const store = await storeFromParams(params);
  return { title: "Reviews", description: `What customers say about ${store.name}.`, alternates: { canonical: "/reviews" } };
}

async function Reviews({ params, searchParams }: PageProps<"/s/[store]/reviews">) {
  const [store, query] = await Promise.all([storeFromParams(params), searchParams]);
  const page = Math.max(1, Number(typeof query.page === "string" ? query.page : 1) || 1);
  const [summary, data] = await Promise.all([getStoreRatingSummary(store.id), listPublishedStoreReviews(store.id, page)]);
  const pageHref = (target: number) => (target <= 1 ? "/reviews" : `/reviews?page=${target}`);

  return (
    <div className="mt-8 grid gap-12 lg:grid-cols-12">
      <div className="lg:col-span-4">
        <h1 className="text-4xl font-semibold tracking-[-0.03em] md:text-5xl">Reviews</h1>
        <p className="mt-3 text-[1.0625rem] leading-relaxed text-ink-600">From customers whose orders from {store.name} have arrived.</p>
        {summary.count > 0 && <StoreRatingOverview summary={summary} className="mt-8" />}
      </div>
      <div className="lg:col-span-8">
        {data.reviews.length === 0 ? (
          <p className="rounded-lg border border-line bg-canvas px-5 py-12 text-center text-[0.9375rem] text-ink-600">
            No reviews yet. Customers can review {store.name} once their order has been delivered.
          </p>
        ) : (
          <>
            <ul className="grid gap-4 sm:grid-cols-2">
              {data.reviews.map((review) => (
                <li key={review.id}>
                  <StoreReviewCard review={review} storeName={store.name} />
                </li>
              ))}
            </ul>
            {data.pageCount > 1 && (
              <nav aria-label="Review pages" className="mt-8 flex items-center justify-between text-[0.9375rem]">
                {page > 1 ? (
                  <Link href={pageHref(page - 1)} className="font-medium underline underline-offset-4">
                    ← Newer reviews
                  </Link>
                ) : (
                  <span />
                )}
                <span className="text-ink-500">
                  Page {data.page} of {data.pageCount}
                </span>
                {page < data.pageCount ? (
                  <Link href={pageHref(page + 1)} className="font-medium underline underline-offset-4">
                    Older reviews →
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function StoreReviewsPage(props: PageProps<"/s/[store]/reviews">) {
  return (
    <div className="container-page pb-24 pt-6">
      <Breadcrumbs items={[{ name: "Reviews", href: "/reviews" }]} />
      <Suspense fallback={<Skeleton className="mt-8 h-96" />}>
        <Reviews {...props} />
      </Suspense>
    </div>
  );
}
