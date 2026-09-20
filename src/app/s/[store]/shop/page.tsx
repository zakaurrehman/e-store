import type { Metadata } from "next";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { ListingSkeleton, ProductListing } from "@/components/store/listing/product-listing";
import { storeAndScope, storeFromParams } from "@/features/stores/route";

export async function generateMetadata({ params }: PageProps<"/s/[store]/shop">): Promise<Metadata> {
  const store = await storeFromParams(params);
  return { title: "Shop all", description: `Browse every product at ${store.name}.`, alternates: { canonical: "/shop" } };
}

async function ShopContent({ params, searchParams }: PageProps<"/s/[store]/shop">) {
  const [query, { scope }] = await Promise.all([searchParams, storeAndScope(params)]);
  return <ProductListing basePath="/shop" scope={{}} catalog={scope} searchParams={query} />;
}

export default function ShopPage(props: PageProps<"/s/[store]/shop">) {
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
