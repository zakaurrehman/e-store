import type { Metadata } from "next";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { ListingSkeleton, ProductListing } from "@/components/store/listing/product-listing";

export const metadata: Metadata = {
  title: "Shop all",
  description: "Browse every product across fashion, beauty, watches, jewellery, bags, tech and home.",
  alternates: { canonical: "/shop" },
};

async function ShopContent({ searchParams }: PageProps<"/shop">) {
  const query = await searchParams;
  return <ProductListing basePath="/shop" scope={{}} searchParams={query} />;
}

export default function ShopPage(props: PageProps<"/shop">) {
  return (
    <div className="container-page pb-20 pt-6">
      <Breadcrumbs items={[{ name: "Shop all", href: "/shop" }]} />
      <h1 className="mt-6 text-4xl font-semibold tracking-[-0.03em] text-ink-950 md:text-5xl">Shop all</h1>
      <div className="mt-10">
        <Suspense fallback={<ListingSkeleton />}>
          <ShopContent {...props} />
        </Suspense>
      </div>
    </div>
  );
}
