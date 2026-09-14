import { SearchX } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ProductGrid } from "@/components/store/product/product-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { activeFilterCount, parseListingFilters, type SearchParamsRecord, type SortKey } from "@/features/catalog/filters";
import { listProducts, type ListingScope } from "@/features/catalog/queries";
import { FilterSidebar, MobileFilterButton } from "./filter-panel";
import { ActiveFilters, SortSelect, ViewToggle } from "./listing-toolbar";
import { Pagination } from "./pagination";

type ProductListingProps = {
  basePath: string;
  scope: ListingScope;
  searchParams: SearchParamsRecord;
  defaultSort?: SortKey;
  hideCategoryFacet?: boolean;
  hideBrandFacet?: boolean;
  emptyState?: ReactNode;
};

/** Faceted, paginated product listing shared by category, brand, collection, shop and search pages. */
export async function ProductListing({ basePath, scope, searchParams, defaultSort, hideCategoryFacet, hideBrandFacet, emptyState }: ProductListingProps) {
  const filters = parseListingFilters(searchParams, { sort: defaultSort });
  const effectiveDefault: SortKey = defaultSort ?? (filters.q ? "relevance" : "featured");
  const view = searchParams.view === "list" ? "list" : "grid";
  const result = await listProducts(scope, filters);
  const hasFilters = activeFilterCount(filters) > 0;
  const filterProps = { basePath, filters, facets: result.facets, total: result.total, defaultSort: effectiveDefault, hideCategoryFacet, hideBrandFacet };

  return (
    <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[16rem_minmax(0,1fr)] xl:gap-14">
      <FilterSidebar {...filterProps} />
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <p className="tabular text-sm text-ink-600" aria-live="polite">
            {result.total === 1 ? "1 product" : `${result.total.toLocaleString("en-US")} products`}
          </p>
          <div className="flex items-center gap-2">
            <MobileFilterButton {...filterProps} />
            <SortSelect basePath={basePath} filters={filters} defaultSort={effectiveDefault} view={view} allowRelevance={!!filters.q} />
            <ViewToggle basePath={basePath} filters={filters} defaultSort={effectiveDefault} view={view} />
          </div>
        </div>
        {hasFilters && (
          <div className="pt-4">
            <ActiveFilters basePath={basePath} filters={filters} facets={result.facets} defaultSort={effectiveDefault} />
          </div>
        )}
        <div className="pt-7">
          {result.products.length === 0 ? (
            hasFilters ? (
              <EmptyState
                icon={<SearchX className="size-6" strokeWidth={1.5} />}
                title="No products match these filters"
                description="Try removing a filter or widening your price range."
                action={
                  <ButtonLink href={basePath + (filters.q ? `?q=${encodeURIComponent(filters.q)}` : "")} variant="secondary">
                    Clear filters
                  </ButtonLink>
                }
              />
            ) : (
              (emptyState ?? (
                <EmptyState
                  icon={<SearchX className="size-6" strokeWidth={1.5} />}
                  title="Nothing here yet"
                  description="New pieces are added every week. In the meantime, explore our latest arrivals."
                  action={<ButtonLink href="/collections/new-arrivals">Shop new arrivals</ButtonLink>}
                />
              ))
            )
          ) : (
            <>
              <ProductGrid products={result.products} layout={view} priorityCount={4} />
              <Pagination basePath={basePath} filters={filters} page={result.page} pageCount={result.pageCount} defaultSort={effectiveDefault} view={view} />
            </>
          )}
        </div>
        {result.correctedQuery && result.products.length > 0 && (
          <p className="sr-only">
            Showing results for <Link href={`/search?q=${encodeURIComponent(result.correctedQuery)}`}>{result.correctedQuery}</Link>
          </p>
        )}
      </div>
    </div>
  );
}

export function ListingSkeleton() {
  return (
    <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[16rem_minmax(0,1fr)] xl:gap-14" aria-busy aria-label="Loading products">
      <div className="hidden space-y-4 lg:block">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
      <div>
        <Skeleton className="h-9 w-full" />
        <div className="mt-7 grid grid-cols-2 gap-x-3 gap-y-9 sm:gap-x-5 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index}>
              <Skeleton className="aspect-[4/5] rounded-md" />
              <Skeleton className="mt-3 h-3 w-1/3" />
              <Skeleton className="mt-2 h-4 w-3/4" />
              <Skeleton className="mt-2 h-4 w-1/4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
