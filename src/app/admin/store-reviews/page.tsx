import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RemoveDemoStoreReviews, StoreReviewModeration } from "@/components/admin/reviews/store-review-moderation";
import { AdminPagination, buildQuery, Card, dateTime, FilterLink, PageHeader, StatusBadge } from "@/components/admin/ui";
import { DemoReviewBadge } from "@/components/store/reviews/store-review-card";
import { Skeleton } from "@/components/ui/misc";
import { RatingStars } from "@/components/ui/rating";
import type { Prisma } from "@/generated/prisma/client";
import { ReviewStatus } from "@/generated/prisma/enums";
import { requirePagePermission } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Store reviews" };
const PAGE_SIZE = 20;
const TONE: Record<string, "warning" | "success" | "danger" | "neutral"> = { PENDING: "warning", APPROVED: "success", REJECTED: "danger", HIDDEN: "neutral" };
const LABEL: Record<string, string> = { PENDING: "Waiting", APPROVED: "Published", REJECTED: "Rejected", HIDDEN: "Hidden" };

async function StoreReviews({ searchParams }: PageProps<"/admin/store-reviews">) {
  const [, query] = await Promise.all([requirePagePermission("reviews.moderate", "/admin/store-reviews"), searchParams]);
  const status = typeof query.status === "string" && query.status in ReviewStatus ? (query.status as ReviewStatus) : undefined;
  const reported = query.reported === "1";
  const demo = query.demo === "1";
  const page = Math.max(1, Number(query.page ?? 1) || 1);
  const where: Prisma.StoreReviewWhereInput = { deletedAt: null, ...(status ? { status } : {}), ...(reported ? { reportedAt: { not: null } } : {}), ...(demo ? { isDemo: true } : {}) };
  const [total, reviews, counts, reportedCount, demoCount] = await Promise.all([
    db.storeReview.count({ where }),
    db.storeReview.findMany({
      where,
      orderBy: [{ reportedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { store: { select: { id: true, name: true, slug: true } }, order: { select: { id: true, number: true } } },
    }),
    db.storeReview.groupBy({ by: ["status"], where: { deletedAt: null }, _count: { _all: true } }),
    db.storeReview.count({ where: { deletedAt: null, reportedAt: { not: null } } }),
    db.storeReview.count({ where: { deletedAt: null, isDemo: true } }),
  ]);
  const countBy = Object.fromEntries(counts.map((row) => [row.status, row._count._all]));
  const base = query as Record<string, string | string[] | undefined>;
  const reset = { status: null, reported: null, demo: null, page: null };

  return (
    <>
      <PageHeader
        title="Store reviews"
        description="Ratings customers give a store after their order is delivered. Publish, hide or delete them; owners can reply and report, but only staff decide what is shown."
        actions={<RemoveDemoStoreReviews count={demoCount} />}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterLink href={`/admin/store-reviews${buildQuery(base, reset)}`} active={!status && !reported && !demo}>
          All
        </FilterLink>
        {(["PENDING", "APPROVED", "HIDDEN", "REJECTED"] as const).map((value) => (
          <FilterLink key={value} href={`/admin/store-reviews${buildQuery(base, { ...reset, status: value })}`} active={status === value}>
            {LABEL[value]} <span className="tabular ml-1.5 opacity-60">{countBy[value] ?? 0}</span>
          </FilterLink>
        ))}
        <FilterLink href={`/admin/store-reviews${buildQuery(base, { ...reset, reported: "1" })}`} active={reported}>
          Reported by owners <span className="tabular ml-1.5 opacity-60">{reportedCount}</span>
        </FilterLink>
        <FilterLink href={`/admin/store-reviews${buildQuery(base, { ...reset, demo: "1" })}`} active={demo}>
          Demo <span className="tabular ml-1.5 opacity-60">{demoCount}</span>
        </FilterLink>
      </div>
      <Card padded={false}>
        {reviews.length === 0 ? (
          <p className="px-5 py-14 text-center text-[0.9375rem] text-ink-500">No store reviews here.</p>
        ) : (
          <ul className="divide-y divide-line">
            {reviews.map((review) => (
              <li key={review.id} className="px-5 py-5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <RatingStars value={review.rating} size="sm" />
                  <Link href={`/admin/stores/${review.store.id}`} className="text-[0.875rem] font-medium text-ink-950 hover:underline">
                    {review.store.name}
                  </Link>
                  <span className="text-[0.8125rem] text-ink-600">{review.authorName}</span>
                  <span className="text-[0.8125rem] text-ink-500">{dateTime.format(review.createdAt)}</span>
                  {review.order && (
                    <Link href={`/admin/orders/${review.order.id}`} className="tabular text-[0.8125rem] text-ink-600 underline underline-offset-4">
                      {review.order.number}
                    </Link>
                  )}
                  {review.isDemo && <DemoReviewBadge />}
                  <StatusBadge label={LABEL[review.status]} tone={TONE[review.status]} />
                </div>
                {review.reportedAt && (
                  <p className="mt-2 rounded-sm border border-warning/40 bg-warning-soft px-3 py-2 text-[0.8125rem] text-ink-800">
                    <span className="font-medium">Reported by the owner:</span> {review.reportReason}
                  </p>
                )}
                <p className="mt-2 whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink-800">{review.body}</p>
                {review.ownerReply && (
                  <div className="mt-3 rounded-sm border-l-2 border-ink-950 bg-canvas px-3 py-2.5">
                    <p className="text-[0.75rem] font-semibold text-ink-950">Reply from {review.store.name}</p>
                    <p className="mt-1 whitespace-pre-line text-[0.875rem] text-ink-700">{review.ownerReply}</p>
                  </div>
                )}
                <div className="mt-3">
                  <StoreReviewModeration review={{ id: review.id, status: review.status, reported: !!review.reportedAt }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <AdminPagination basePath="/admin/store-reviews" query={base} page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} pageSize={PAGE_SIZE} />
    </>
  );
}

export default function AdminStoreReviewsPage(props: PageProps<"/admin/store-reviews">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <StoreReviews {...props} />
    </Suspense>
  );
}
