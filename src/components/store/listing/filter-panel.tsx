"use client";

import { Check, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { RatingStars } from "@/components/ui/rating";
import { activeFilterCount, filtersToSearchParams, type ListingFilters, type SortKey } from "@/features/catalog/filters";
import type { ListingFacets } from "@/features/catalog/queries";
import { cn } from "@/utils/cn";

type FilterProps = {
  basePath: string;
  filters: ListingFilters;
  facets: ListingFacets;
  total: number;
  defaultSort: SortKey;
  hideCategoryFacet?: boolean;
  hideBrandFacet?: boolean;
};

function useFilterNavigation(basePath: string, defaultSort: SortKey) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const navigate = (next: ListingFilters) => {
    const params = filtersToSearchParams({ ...next, page: 1 }, { sort: defaultSort });
    const query = params.toString();
    startTransition(() => router.push(query ? `${basePath}?${query}` : basePath, { scroll: false }));
  };
  return { navigate, pending };
}

function FacetGroup({ title, children, defaultOpen = true, count }: { title: string; children: React.ReactNode; defaultOpen?: boolean; count?: number }) {
  return (
    <details open={defaultOpen} className="group border-b border-line py-4 first:pt-0">
      <summary className="flex cursor-pointer list-none items-center justify-between text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-ink-950 [&::-webkit-details-marker]:hidden">
        <span>
          {title}
          {count ? <span className="ml-1.5 font-normal text-ink-500">({count})</span> : null}
        </span>
        <span aria-hidden className="text-lg leading-none text-ink-400 transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="pt-3.5">{children}</div>
    </details>
  );
}

function CheckRow({ label, count, checked, onChange, swatch }: { label: string; count: number; checked: boolean; onChange: () => void; swatch?: string | null }) {
  return (
    <label className="group flex cursor-pointer items-center gap-2.5 py-1.5 text-[0.9375rem] text-ink-800">
      <input type="checkbox" checked={checked} onChange={onChange} className="peer sr-only" />
      {swatch ? (
        <span
          className={cn("relative flex size-5 shrink-0 items-center justify-center rounded-full ring-1 ring-line-strong ring-offset-2 transition-shadow peer-focus-visible:ring-2 peer-focus-visible:ring-iris-500", checked && "ring-2 ring-ink-950")}
          style={{ background: swatch }}
        >
          {checked && <Check className={cn("size-3", /^#(f|e)/i.test(swatch) ? "text-ink-950" : "text-white")} strokeWidth={3} />}
        </span>
      ) : (
        <span className={cn("flex size-[1.125rem] shrink-0 items-center justify-center rounded-xs border border-line-strong transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-iris-500 group-hover:border-ink-500", checked && "border-ink-950 bg-ink-950")}>
          {checked && <Check className="size-3 text-white" strokeWidth={3} />}
        </span>
      )}
      <span className="flex-1">{label}</span>
      <span className="tabular text-[0.8125rem] text-ink-400">{count}</span>
    </label>
  );
}

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value].sort();
}

function FilterFields({ basePath, filters, facets, defaultSort, hideCategoryFacet, hideBrandFacet, onNavigate }: FilterProps & { onNavigate?: () => void }) {
  const { navigate, pending } = useFilterNavigation(basePath, defaultSort);
  const [minPrice, setMinPrice] = useState(filters.priceMin !== null ? String(filters.priceMin / 100) : "");
  const [maxPrice, setMaxPrice] = useState(filters.priceMax !== null ? String(filters.priceMax / 100) : "");

  const go = (next: ListingFilters) => {
    navigate(next);
    onNavigate?.();
  };

  return (
    <div className={cn("transition-opacity", pending && "pointer-events-none opacity-60")} aria-busy={pending}>
      {!hideCategoryFacet && facets.categories.length > 0 && (
        <FacetGroup title="Category">
          {facets.categories.map((category) => (
            <CheckRow key={category.slug} label={category.label} count={category.count} checked={filters.categories.includes(category.slug)} onChange={() => go({ ...filters, categories: toggle(filters.categories, category.slug) })} />
          ))}
        </FacetGroup>
      )}

      <FacetGroup title="Availability">
        <CheckRow label="In stock" count={facets.inStockCount} checked={filters.inStock} onChange={() => go({ ...filters, inStock: !filters.inStock })} />
        {facets.onSaleCount > 0 && <CheckRow label="On sale" count={facets.onSaleCount} checked={filters.onSale} onChange={() => go({ ...filters, onSale: !filters.onSale })} />}
      </FacetGroup>

      {facets.price.max > 0 && (
        <FacetGroup title="Price">
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const min = minPrice.trim() === "" ? null : Math.max(0, Math.round(Number(minPrice) * 100));
              const max = maxPrice.trim() === "" ? null : Math.max(0, Math.round(Number(maxPrice) * 100));
              go({ ...filters, priceMin: Number.isFinite(min) ? min : null, priceMax: Number.isFinite(max) ? max : null });
            }}
          >
            <label className="flex-1 text-[0.75rem] text-ink-500">
              Min
              <span className="relative mt-1 block">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-ink-400">$</span>
                <input inputMode="decimal" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} placeholder={String(Math.floor(facets.price.min / 100))} className="h-10 w-full rounded-sm border border-line-strong pl-6 pr-2 text-sm text-ink-950 outline-none focus:border-ink-950" />
              </span>
            </label>
            <label className="flex-1 text-[0.75rem] text-ink-500">
              Max
              <span className="relative mt-1 block">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-ink-400">$</span>
                <input inputMode="decimal" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder={String(Math.ceil(facets.price.max / 100))} className="h-10 w-full rounded-sm border border-line-strong pl-6 pr-2 text-sm text-ink-950 outline-none focus:border-ink-950" />
              </span>
            </label>
            <Button type="submit" variant="secondary" size="sm" className="h-10">
              Go
            </Button>
          </form>
        </FacetGroup>
      )}

      {!hideBrandFacet && facets.brands.length > 1 && (
        <FacetGroup title="Brand" count={filters.brands.length || undefined}>
          {facets.brands.map((brand) => (
            <CheckRow key={brand.slug} label={brand.label} count={brand.count} checked={filters.brands.includes(brand.slug)} onChange={() => go({ ...filters, brands: toggle(filters.brands, brand.slug) })} />
          ))}
        </FacetGroup>
      )}

      {facets.attributes.map((attribute) => {
        const selected = filters.attributes[attribute.slug] ?? [];
        const isColour = attribute.type === "COLOR";
        return (
          <FacetGroup key={attribute.slug} title={attribute.name} count={selected.length || undefined} defaultOpen={isColour || selected.length > 0 || attribute.slug === "size"}>
            <div className={cn(isColour ? "grid grid-cols-1" : attribute.values.length > 6 && attribute.slug.includes("size") ? "grid grid-cols-2 gap-x-3" : "")}>
              {attribute.values.map((value) => (
                <CheckRow
                  key={value.slug}
                  label={value.label}
                  count={value.count}
                  swatch={isColour ? value.colorHex : undefined}
                  checked={selected.includes(value.slug)}
                  onChange={() => go({ ...filters, attributes: { ...filters.attributes, [attribute.slug]: toggle(selected, value.slug) } })}
                />
              ))}
            </div>
          </FacetGroup>
        );
      })}

      <FacetGroup title="Customer rating" defaultOpen={!!filters.rating}>
        {[4, 3].map((stars) => (
          <label key={stars} className="flex cursor-pointer items-center gap-2.5 py-1.5 text-[0.9375rem] text-ink-800">
            <input
              type="radio"
              name="rating"
              checked={filters.rating === stars}
              onChange={() => go({ ...filters, rating: filters.rating === stars ? null : stars })}
              onClick={() => filters.rating === stars && go({ ...filters, rating: null })}
              className="size-4 accent-ink-950"
            />
            <RatingStars value={stars} size="xs" />
            <span>& up</span>
            <span className="tabular ml-auto text-[0.8125rem] text-ink-400">{facets.ratingCounts[stars] ?? 0}</span>
          </label>
        ))}
      </FacetGroup>
    </div>
  );
}

export function FilterSidebar(props: FilterProps) {
  return (
    <aside aria-label="Filters" className="hidden lg:block">
      <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pb-8 pr-2">
        <FilterFields {...props} />
      </div>
    </aside>
  );
}

export function MobileFilterButton(props: FilterProps) {
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(props.filters);
  const { navigate } = useFilterNavigation(props.basePath, props.defaultSort);
  return (
    <>
      <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <SlidersHorizontal className="size-4" aria-hidden />
        Filters
        {count > 0 && <span className="tabular flex size-5 items-center justify-center rounded-full bg-ink-950 text-[0.6875rem] text-white">{count}</span>}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        variant="bottom"
        title="Filters"
        footer={
          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              disabled={count === 0}
              onClick={() => navigate({ ...props.filters, categories: [], brands: [], attributes: {}, priceMin: null, priceMax: null, rating: null, inStock: false, onSale: false })}
            >
              Clear all
            </Button>
            <Button className="flex-[2]" onClick={() => setOpen(false)}>
              Show {props.total} result{props.total === 1 ? "" : "s"}
            </Button>
          </div>
        }
      >
        <FilterFields {...props} />
      </Dialog>
    </>
  );
}
