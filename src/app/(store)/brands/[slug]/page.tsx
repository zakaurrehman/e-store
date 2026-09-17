import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { ListingSkeleton, ProductListing } from "@/components/store/listing/product-listing";
import { getBrandBySlug } from "@/features/catalog/queries";

export async function generateMetadata({ params }: PageProps<"/brands/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand) return { title: "Brand not found", robots: { index: false } };
  const description = brand.seoDescription ?? brand.description ?? `Shop ${brand.name} at Zendropship.`;
  return { title: brand.seoTitle ?? brand.name, description, alternates: { canonical: `/brands/${slug}` }, openGraph: { title: brand.name, description } };
}

async function BrandContent({ params, searchParams }: PageProps<"/brands/[slug]">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const brand = await getBrandBySlug(slug);
  if (!brand) notFound();
  return (
    <>
      <Breadcrumbs items={[{ name: "Brands", href: "/brands" }, { name: brand.name, href: `/brands/${brand.slug}` }]} />
      <header className="mt-6 grid gap-6 border-b border-line pb-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-ink-500">The label</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-ink-950 md:text-5xl">{brand.name}</h1>
        </div>
        <div className="lg:col-span-7 lg:pt-7">
          {brand.description && <p className="text-lg leading-relaxed text-ink-800">{brand.description}</p>}
          {brand.story && <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-600">{brand.story}</p>}
        </div>
      </header>
      <div className="mt-10">
        <ProductListing basePath={`/brands/${brand.slug}`} scope={{ brandSlug: brand.slug }} searchParams={query} hideBrandFacet />
      </div>
    </>
  );
}

export default function BrandPage(props: PageProps<"/brands/[slug]">) {
  return (
    <div className="container-page pb-20 pt-6">
      <Suspense fallback={<ListingSkeleton />}>
        <BrandContent {...props} />
      </Suspense>
    </div>
  );
}
