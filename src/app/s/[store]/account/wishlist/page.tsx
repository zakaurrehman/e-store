import { Heart } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountSection } from "@/components/store/account/section";
import { ProductGrid } from "@/components/store/product/product-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { getProductCardsByIds } from "@/features/catalog/queries";
import { storeAndScope } from "@/features/stores/route";
import { getWishlistProductIds } from "@/features/wishlist/service";
import { requireUser } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Wishlist", robots: { index: false } };

async function Wishlist({ params }: PageProps<"/s/[store]/account/wishlist">) {
  const [user, { scope }] = await Promise.all([requireUser("/account/wishlist"), storeAndScope(params)]);
  const ids = await getWishlistProductIds(user.id);
  // Saved items from other stores on the platform are not sold here, so they are not shown.
  const products = await getProductCardsByIds(ids, scope);
  return (
    <AccountSection title="Wishlist" description={products.length > 0 ? `${products.length} saved item${products.length === 1 ? "" : "s"}` : undefined}>
      {products.length === 0 ? (
        <EmptyState icon={<Heart className="size-6" strokeWidth={1.5} />} title="Your wishlist is empty" description="Tap the heart on any product to save it here." action={<ButtonLink href="/collections/new-arrivals">Explore new arrivals</ButtonLink>} className="py-10" />
      ) : (
        <ProductGrid products={products} className="md:grid-cols-3 xl:grid-cols-3" />
      )}
    </AccountSection>
  );
}

export default function WishlistPage(props: PageProps<"/s/[store]/account/wishlist">) {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Wishlist {...props} />
    </Suspense>
  );
}
