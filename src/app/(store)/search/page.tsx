import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { Suspense } from "react";
import { ListingSkeleton, ProductListing } from "@/components/store/listing/product-listing";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { parseListingFilters } from "@/features/catalog/filters";
import { getCategoryTree, listProducts } from "@/features/catalog/queries";
import { recordSearch } from "@/features/search/suggest";
import { getCurrentUser } from "@/server/auth/session";

export async function generateMetadata({ searchParams }: PageProps<"/search">): Promise<Metadata> {
  const { q } = await searchParams;
  const term = typeof q === "string" ? q.trim().slice(0, 80) : "";
  return { title: term ? `Search results for “${term}”` : "Search", robots: { index: false, follow: true } };
}

async function SearchContent({ searchParams }: PageProps<"/search">) {
  const query = await searchParams;
  const filters = parseListingFilters(query);
  if (!filters.q) {
    const departments = await getCategoryTree();
    return (
      <>
        <h1 className="text-4xl font-semibold tracking-[-0.03em] text-ink-950 md:text-5xl">Search</h1>
        <form action="/search" role="search" className="mt-8 flex max-w-xl gap-2">
          <label htmlFor="search-page-input" className="sr-only">
            Search products
          </label>
          <input id="search-page-input" name="q" type="search" required minLength={2} maxLength={100} placeholder="What are you looking for?" className="h-12 flex-1 rounded-sm border border-line-strong px-4 text-base outline-none focus:border-ink-950" />
          <button type="submit" className="h-12 rounded-sm bg-ink-950 px-6 text-sm font-medium text-white hover:bg-ink-800">
            Search
          </button>
        </form>
        <ul className="mt-10 flex flex-wrap gap-2">
          {departments.map((department) => (
            <li key={department.id}>
              <Link href={`/c/${department.slug}`} className="inline-flex h-9 items-center rounded-full bg-canvas px-4 text-sm text-ink-800 hover:bg-canvas-deep">
                {department.name}
              </Link>
            </li>
          ))}
        </ul>
      </>
    );
  }

  const result = await listProducts({}, filters);
  const user = await getCurrentUser();
  if (filters.page === 1) after(() => recordSearch(filters.q, result.total, user?.id ?? null).catch(() => undefined));

  return (
    <>
      <p className="text-sm text-ink-500">Search results for</p>
      <h1 className="mt-1 text-balance text-4xl font-semibold tracking-[-0.03em] text-ink-950 md:text-5xl">“{filters.q}”</h1>
      {result.correctedQuery && (
        <p className="mt-3 text-[0.9375rem] text-ink-600">
          {result.total === 0 ? "No exact matches. " : "Showing close matches. "}Did you mean{" "}
          <Link href={`/search?q=${encodeURIComponent(result.correctedQuery)}`} className="font-medium text-ink-950 underline underline-offset-4">
            {result.correctedQuery}
          </Link>
          ?
        </p>
      )}
      <div className="mt-10">
        <ProductListing
          basePath="/search"
          scope={{}}
          searchParams={query}
          emptyState={
            <EmptyState
              title={`No results for “${filters.q}”`}
              description="Check the spelling, try a more general term, or browse our departments."
              action={
                <>
                  <ButtonLink href="/shop" variant="secondary">
                    Browse all products
                  </ButtonLink>
                  <ButtonLink href="/collections/new-arrivals">New arrivals</ButtonLink>
                </>
              }
            />
          }
        />
      </div>
    </>
  );
}

export default function SearchPage(props: PageProps<"/search">) {
  return (
    <div className="container-page pb-20 pt-10">
      <Suspense fallback={<ListingSkeleton />}>
        <SearchContent {...props} />
      </Suspense>
    </div>
  );
}
