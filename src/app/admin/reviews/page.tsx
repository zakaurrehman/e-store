import { BadgeCheck } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { ReviewActions } from "@/components/admin/reviews/review-actions";
import { AdminPagination, buildQuery, Card, dateTime, FilterLink, PageHeader, StatusBadge } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/misc";
import { RatingStars } from "@/components/ui/rating";
import type { Prisma } from "@/generated/prisma/client";
import { ReviewStatus } from "@/generated/prisma/enums";
import { requirePagePermission } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Reviews" };
const PAGE_SIZE = 20;
const TONE: Record<string, "warning" | "success" | "danger" | "neutral"> = { PENDING: "warning", APPROVED: "success", REJECTED: "danger", HIDDEN: "neutral" };

async function Reviews({ searchParams }: PageProps<"/admin/reviews">) {
  const [, query] = await Promise.all([requirePagePermission("reviews.moderate", "/admin/reviews"), searchParams]);
  const status = typeof query.status === "string" && query.status in ReviewStatus ? (query.status as ReviewStatus) : undefined;
  const page = Math.max(1, Number(query.page ?? 1) || 1);
  const where: Prisma.ReviewWhereInput = { deletedAt: null, ...(status ? { status } : {}), ...(query.featured === "1" ? { isFeatured: true } : {}) };
  const [total, reviews, counts] = await Promise.all([
    db.review.count({ where }),
    db.review.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { product: { select: { id: true, name: true, slug: true } }, user: { select: { id: true, email: true } }, images: { include: { media: { select: { url: true } } } } } }),
    db.review.groupBy({ by: ["status"], where: { deletedAt: null }, _count: { _all: true } }),
  ]);
  const countBy = Object.fromEntries(counts.map((row) => [row.status, row._count._all]));
  const base = query as Record<string, string | string[] | undefined>;
  return (
    <>
      <PageHeader title="Reviews" description="Approve, reject, hide, feature or reply. Approved reviews update product ratings immediately." />
      <div className="mb-4 flex flex-wrap gap-2">
        <FilterLink href={`/admin/reviews${buildQuery(base, { status: null, featured: null, page: null })}`} active={!status && query.featured !== "1"}>
          All
        </FilterLink>
        {(["PENDING", "APPROVED", "HIDDEN", "REJECTED"] as const).map((value) => (
          <FilterLink key={value} href={`/admin/reviews${buildQuery(base, { status: value, featured: null, page: null })}`} active={status === value}>
            {value.charAt(0) + value.slice(1).toLowerCase()} <span className="tabular ml-1.5 opacity-60">{countBy[value] ?? 0}</span>
          </FilterLink>
        ))}
        <FilterLink href={`/admin/reviews${buildQuery(base, { featured: "1", status: null, page: null })}`} active={query.featured === "1"}>
          Featured
        </FilterLink>
      </div>
      <Card padded={false}>
        {reviews.length === 0 ? (
          <p className="px-5 py-14 text-center text-[0.9375rem] text-ink-500">No reviews here.</p>
        ) : (
          <ul className="divide-y divide-line">
            {reviews.map((review) => (
              <li key={review.id} className="grid gap-4 px-5 py-5 lg:grid-cols-12">
                <div className="lg:col-span-8">
                  <div className="flex flex-wrap items-center gap-2">
                    <RatingStars value={review.rating} size="sm" />
                    <StatusBadge label={review.status.charAt(0) + review.status.slice(1).toLowerCase()} tone={TONE[review.status]} />
                    {review.isFeatured && <StatusBadge label="Featured" tone="iris" />}
                    {review.isVerifiedPurchase && (
                      <span className="inline-flex items-center gap-1 text-[0.75rem] text-success">
                        <BadgeCheck className="size-3.5" /> Verified purchase
                      </span>
                    )}
                  </div>
                  <p className="mt-2 font-medium">{review.title}</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-ink-700">{review.body}</p>
                  {review.images.length > 0 && (
                    <ul className="mt-2 flex gap-2">
                      {review.images.map((image, index) => (
                        <li key={index} className="relative size-14 overflow-hidden rounded-sm bg-canvas">
                          <Image src={image.media.url} alt="" fill sizes="56px" className="object-cover" />
                        </li>
                      ))}
                    </ul>
                  )}
                  {review.adminReply && (
                    <p className="mt-2 rounded-sm bg-canvas px-3 py-2 text-[0.8125rem] text-ink-700">
                      <span className="font-medium">Reply:</span> {review.adminReply}
                    </p>
                  )}
                  <p className="mt-2 text-[0.75rem] text-ink-500">
                    {review.authorName}
                    {review.user && (
                      <>
                        {" · "}
                        <Link href={`/admin/customers/${review.user.id}`} className="underline underline-offset-2">
                          {review.user.email}
                        </Link>
                      </>
                    )}{" "}
                    · {dateTime.format(review.createdAt)} ·{" "}
                    <Link href={`/catalog/p/${review.product.slug}#reviews`} target="_blank" className="underline underline-offset-2">
                      {review.product.name}
                    </Link>
                  </p>
                </div>
                <div className="lg:col-span-4 lg:text-right">
                  <ReviewActions review={{ id: review.id, status: review.status, isFeatured: review.isFeatured, adminReply: review.adminReply }} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <AdminPagination basePath="/admin/reviews" query={base} page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} pageSize={PAGE_SIZE} />
      </Card>
    </>
  );
}

export default function ReviewsPage(props: PageProps<"/admin/reviews">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Reviews {...props} />
    </Suspense>
  );
}
