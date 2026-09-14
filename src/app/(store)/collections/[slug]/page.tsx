import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { ListingSkeleton, ProductListing } from "@/components/store/listing/product-listing";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { getCollectionBySlug } from "@/features/catalog/queries";

export async function generateMetadata({ params }: PageProps<"/collections/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getCollectionBySlug(slug);
  if (!collection) return { title: "Collection not found", robots: { index: false } };
  const description = collection.seoDescription ?? collection.description ?? undefined;
  return { title: collection.seoTitle ?? collection.name, description, alternates: { canonical: `/collections/${slug}` } };
}

async function CollectionContent({ params, searchParams }: PageProps<"/collections/[slug]">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const collection = await getCollectionBySlug(slug);
  if (!collection) notFound();
  const dataDriven = collection.rule === "BEST_SELLERS" || collection.rule === "TOP_RATED";
  return (
    <>
      <Breadcrumbs items={[{ name: collection.name, href: `/collections/${collection.slug}` }]} />
      <header className="mt-6 max-w-3xl">
        <h1 className="text-balance text-4xl font-semibold tracking-[-0.03em] text-ink-950 md:text-5xl">{collection.name}</h1>
        {collection.description && <p className="mt-3 text-base leading-relaxed text-ink-600">{collection.description}</p>}
      </header>
      <div className="mt-10">
        <ProductListing
          basePath={`/collections/${collection.slug}`}
          scope={{ collectionSlug: collection.slug }}
          searchParams={query}
          emptyState={
            <EmptyState
              title={dataDriven ? "Rankings are on their way" : "This collection is being refreshed"}
              description={
                dataDriven
                  ? "This collection is built from real orders and verified reviews, so it fills up as customers shop. Explore our newest pieces in the meantime."
                  : "New pieces are on their way. Explore our latest arrivals in the meantime."
              }
              action={<ButtonLink href="/collections/new-arrivals">Shop new arrivals</ButtonLink>}
            />
          }
        />
      </div>
    </>
  );
}

export default function CollectionPage(props: PageProps<"/collections/[slug]">) {
  return (
    <div className="container-page pb-20 pt-6">
      <Suspense fallback={<ListingSkeleton />}>
        <CollectionContent {...props} />
      </Suspense>
    </div>
  );
}
