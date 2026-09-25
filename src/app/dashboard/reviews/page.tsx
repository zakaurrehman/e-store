import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminPagination, buildQuery, Card, dateTime, FilterLink, PageHeader, StatTile, StatusBadge } from "@/components/admin/ui";
import { OwnerReviewReply, ReportStoreReview } from "@/components/dashboard/store-review-actions";
import { DemoReviewBadge } from "@/components/store/reviews/store-review-card";
import { Skeleton } from "@/components/ui/misc";
import { RatingStars } from "@/components/ui/rating";
import { getStoreRatingSummary, listOwnerStoreReviews, type OwnerReviewFilter } from "@/features/store-reviews/queries";
import { requireStoreOwner } from "@/features/stores/guards";

export const metadata: Metadata = { title: "Reviews" };

const FILTERS: Array<[OwnerReviewFilter, string]> = [
  ["all", "All"],
  ["published", "On your store"],
  ["pending", "Being checked"],
  ["hidden", "Not shown"],
];
const STATUS: Record<string, { label: string; tone: "success" | "warning" | "neutral" | "danger" }> = {
  APPROVED: { label: "On your store", tone: "success" },
  PENDING: { label: "Being checked", tone: "warning" },
  HIDDEN: { label: "Hidden by Zendropship", tone: "neutral" },
  REJECTED: { label: "Not published", tone: "danger" },
};

async function OwnerReviews({ searchParams }: PageProps<"/dashboard/reviews">) {
  const [{ store }, query] = await Promise.all([requireStoreOwner("/dashboard/reviews"), searchParams]);
  const filter = (FILTERS.find(([value]) => value === query.filter)?.[0] ?? "all") as OwnerReviewFilter;
  const page = Math.max(1, Number(typeof query.page === "string" ? query.page : 1) || 1);
  const [summary, data] = await Promise.all([getStoreRatingSummary(store.id), listOwnerStoreReviews(store.id, { filter, page })]);
  const base = query as Record<string, string | string[] | undefined>;

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="Rating" value={summary.count > 0 ? `${summary.average.toFixed(1)} ★` : "—"} hint={summary.count > 0 ? `From ${summary.count} review${summary.count === 1 ? "" : "s"} on your store` : "No reviews on your store yet"} />
        <StatTile label="On your store" value={data.countBy.APPROVED ?? 0} />
        <StatTile label="Being checked" value={data.countBy.PENDING ?? 0} tone={(data.countBy.PENDING ?? 0) > 0 ? "warning" : "default"} hint="New reviews wait for Zendropship before they appear" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(([value, label]) => (
          <FilterLink key={value} href={`/dashboard/reviews${buildQuery(base, { filter: value === "all" ? null : value, page: null })}`} active={filter === value}>
            {label}
          </FilterLink>
        ))}
      </div>
      <Card padded={false}>
        {data.reviews.length === 0 ? (
          <p className="px-5 py-14 text-center text-[0.9375rem] text-ink-500">
            {filter === "all" ? "No reviews yet. Customers can review your store once their order has been delivered." : "No reviews here."}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {data.reviews.map((review) => {
              const status = STATUS[review.status] ?? STATUS.PENDING;
              return (
                <li key={review.id} className="px-5 py-5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <RatingStars value={review.rating} size="sm" />
                    <span className="text-[0.875rem] font-medium text-ink-950">{review.authorName}</span>
                    <span className="text-[0.8125rem] text-ink-500">{dateTime.format(review.createdAt)}</span>
                    {review.order && (
                      <Link href={`/dashboard/orders/${review.order.number}`} className="tabular text-[0.8125rem] text-ink-600 underline underline-offset-4">
                        {review.order.number}
                      </Link>
                    )}
                    {review.isDemo && <DemoReviewBadge />}
                    <StatusBadge label={status.label} tone={status.tone} />
                  </div>
                  <p className="mt-2 whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink-800">{review.body}</p>
                  {review.ownerReply && (
                    <div className="mt-3 rounded-sm border-l-2 border-ink-950 bg-canvas px-3 py-2.5">
                      <p className="text-[0.75rem] font-semibold text-ink-950">Your reply</p>
                      <p className="mt-1 whitespace-pre-line text-[0.875rem] text-ink-700">{review.ownerReply}</p>
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <OwnerReviewReply reviewId={review.id} reply={review.ownerReply} />
                    {!review.isDemo && <ReportStoreReview reviewId={review.id} reported={!!review.reportedAt} />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <AdminPagination basePath="/dashboard/reviews" query={base} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={20} />
    </>
  );
}

export default function DashboardReviewsPage(props: PageProps<"/dashboard/reviews">) {
  return (
    <>
      <PageHeader
        title="Reviews"
        description="What customers say about your store, after their order arrives. Reply in public, or report a review that breaks the rules — Zendropship checks it."
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <OwnerReviews {...props} />
      </Suspense>
    </>
  );
}
