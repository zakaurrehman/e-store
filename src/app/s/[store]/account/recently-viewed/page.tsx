import { Clock } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountSection } from "@/components/store/account/section";
import { ProductGrid } from "@/components/store/product/product-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { getProductCardsByIds } from "@/features/catalog/queries";
import { storeAndScope } from "@/features/stores/route";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Recently viewed", robots: { index: false } };

async function RecentlyViewed({ params }: PageProps<"/s/[store]/account/recently-viewed">) {
  const [user, { scope }] = await Promise.all([requireUser("/account/recently-viewed"), storeAndScope(params)]);
  const rows = await db.recentlyViewed.findMany({ where: { userId: user.id }, orderBy: { viewedAt: "desc" }, take: 24, select: { productId: true } });
  const products = await getProductCardsByIds(rows.map((row) => row.productId), scope);
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

export default function RecentlyViewedPage(props: PageProps<"/s/[store]/account/recently-viewed">) {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <RecentlyViewed {...props} />
    </Suspense>
  );
}
