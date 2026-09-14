import { Clock } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountSection } from "@/components/store/account/section";
import { ProductGrid } from "@/components/store/product/product-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { getProductCardsByIds } from "@/features/catalog/queries";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Recently viewed", robots: { index: false } };

async function RecentlyViewed() {
  const user = await requireUser("/account/recently-viewed");
  const rows = await db.recentlyViewed.findMany({ where: { userId: user.id }, orderBy: { viewedAt: "desc" }, take: 24, select: { productId: true } });
  const products = await getProductCardsByIds(rows.map((row) => row.productId));
  return (
    <AccountSection title="Recently viewed" description="Products you've looked at on any device while signed in.">
      {products.length === 0 ? (
        <EmptyState icon={<Clock className="size-6" strokeWidth={1.5} />} title="Nothing viewed yet" description="Products you open will be remembered here." action={<ButtonLink href="/shop">Browse the store</ButtonLink>} className="py-10" />
      ) : (
        <ProductGrid products={products} className="md:grid-cols-3 xl:grid-cols-3" />
      )}
    </AccountSection>
  );
}

export default function RecentlyViewedPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <RecentlyViewed />
    </Suspense>
  );
}
