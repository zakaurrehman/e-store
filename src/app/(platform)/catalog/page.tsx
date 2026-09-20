import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogDepartments, CatalogListing } from "@/components/platform/catalog-listing";
import { ListingSkeleton } from "@/components/store/listing/product-listing";
import { Skeleton } from "@/components/ui/misc";

export const metadata: Metadata = {
  title: "Product catalogue",
  description: "Every product you can sell in your Zendropship store, with wholesale price, suggested selling price and your margin.",
  alternates: { canonical: "/catalog" },
};

async function Listing({ searchParams }: PageProps<"/catalog">) {
  return <CatalogListing basePath="/catalog" scope={{}} searchParams={await searchParams} />;
}

export default function CatalogPage(props: PageProps<"/catalog">) {
  return (
    <div className="container-page pb-20 pt-10">
      <header className="max-w-3xl">
        <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-ink-500">The catalogue</p>
        <h1 className="mt-3 text-balance text-4xl font-semibold tracking-[-0.03em] text-ink-950 md:text-5xl">Choose what your store sells</h1>
        <p className="mt-3 text-[1.0625rem] leading-relaxed text-ink-600">
          <strong className="font-medium text-ink-950">You pay</strong> is the wholesale price charged when your customer orders. <strong className="font-medium text-ink-950">Sells for</strong> is the suggested price in your store — you can change it. We ship every order.
        </p>
      </header>
      <div className="mt-8">
        <Suspense fallback={<Skeleton className="h-9 w-full rounded-full" />}>
          <CatalogDepartments />
        </Suspense>
      </div>
      <div className="mt-10">
        <Suspense fallback={<ListingSkeleton />}>
          <Listing {...props} />
        </Suspense>
      </div>
    </div>
  );
}
