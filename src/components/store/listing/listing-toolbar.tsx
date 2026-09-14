"use client";

import { LayoutGrid, List, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { filtersToSearchParams, SORT_OPTIONS, type ListingFilters, type SortKey } from "@/features/catalog/filters";
import type { ListingFacets } from "@/features/catalog/queries";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/money";

export function SortSelect({ basePath, filters, defaultSort, view, allowRelevance }: { basePath: string; filters: ListingFilters; defaultSort: SortKey; view: "grid" | "list"; allowRelevance?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <label className="relative inline-flex items-center gap-2 text-sm text-ink-600">
      <span className="hidden sm:inline">Sort</span>
      <select
        value={filters.sort}
        disabled={pending}
        onChange={(event) => {
          const params = filtersToSearchParams({ ...filters, sort: event.target.value as SortKey, page: 1 }, { sort: defaultSort });
          if (view === "list") params.set("view", "list");
          const query = params.toString();
          startTransition(() => router.push(query ? `${basePath}?${query}` : basePath, { scroll: false }));
        }}
        className="h-9 appearance-none rounded-sm border border-line-strong bg-surface py-0 pl-3 pr-8 text-sm font-medium text-ink-950 outline-none focus:border-ink-950"
      >
        {allowRelevance && <option value="relevance">Most relevant</option>}
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute right-2.5 size-3.5 text-ink-500" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}

export function ViewToggle({ basePath, filters, defaultSort, view }: { basePath: string; filters: ListingFilters; defaultSort: SortKey; view: "grid" | "list" }) {
  const href = (next: "grid" | "list") => {
    const params = filtersToSearchParams(filters, { sort: defaultSort });
    if (next === "list") params.set("view", "list");
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  };
  const item = "inline-flex size-9 items-center justify-center transition-colors";
  return (
    <div className="hidden overflow-hidden rounded-sm border border-line-strong sm:flex" role="group" aria-label="Layout">
      <Link href={href("grid")} scroll={false} aria-label="Grid view" aria-pressed={view === "grid"} className={cn(item, view === "grid" ? "bg-ink-950 text-white" : "text-ink-500 hover:text-ink-950")}>
        <LayoutGrid className="size-4" />
      </Link>
      <Link href={href("list")} scroll={false} aria-label="List view" aria-pressed={view === "list"} className={cn(item, "border-l border-line-strong", view === "list" ? "bg-ink-950 text-white" : "text-ink-500 hover:text-ink-950")}>
        <List className="size-4" />
      </Link>
    </div>
  );
}

export function ActiveFilters({ basePath, filters, facets, defaultSort }: { basePath: string; filters: ListingFilters; facets: ListingFacets; defaultSort: SortKey }) {
  const chips: Array<{ label: string; next: ListingFilters }> = [];
  const lookup = (list: Array<{ slug: string; label: string }>, slug: string) => list.find((item) => item.slug === slug)?.label ?? slug;

  filters.categories.forEach((slug) => chips.push({ label: lookup(facets.categories, slug), next: { ...filters, categories: filters.categories.filter((item) => item !== slug) } }));
  filters.brands.forEach((slug) => chips.push({ label: lookup(facets.brands, slug), next: { ...filters, brands: filters.brands.filter((item) => item !== slug) } }));
  for (const [attribute, values] of Object.entries(filters.attributes)) {
    const group = facets.attributes.find((item) => item.slug === attribute);
    values.forEach((slug) =>
      chips.push({
        label: `${group?.name ?? attribute}: ${group ? lookup(group.values, slug) : slug}`,
        next: { ...filters, attributes: { ...filters.attributes, [attribute]: values.filter((item) => item !== slug) } },
      }),
    );
  }
  if (filters.priceMin !== null || filters.priceMax !== null) {
    const label = filters.priceMin !== null && filters.priceMax !== null ? `${formatMoney(filters.priceMin)} – ${formatMoney(filters.priceMax)}` : filters.priceMin !== null ? `From ${formatMoney(filters.priceMin)}` : `Up to ${formatMoney(filters.priceMax!)}`;
    chips.push({ label, next: { ...filters, priceMin: null, priceMax: null } });
  }
  if (filters.rating) chips.push({ label: `${filters.rating}★ & up`, next: { ...filters, rating: null } });
  if (filters.inStock) chips.push({ label: "In stock", next: { ...filters, inStock: false } });
  if (filters.onSale) chips.push({ label: "On sale", next: { ...filters, onSale: false } });
  if (chips.length === 0) return null;

  const href = (next: ListingFilters) => {
    const query = filtersToSearchParams({ ...next, page: 1 }, { sort: defaultSort }).toString();
    return query ? `${basePath}?${query}` : basePath;
  };
  const cleared = href({ ...filters, categories: [], brands: [], attributes: {}, priceMin: null, priceMax: null, rating: null, inStock: false, onSale: false });

  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label="Active filters">
      {chips.map((chip) => (
        <li key={chip.label}>
          <Link href={href(chip.next)} scroll={false} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-canvas pl-3 pr-2 text-[0.8125rem] text-ink-800 transition-colors hover:bg-canvas-deep">
            {chip.label}
            <X className="size-3.5 text-ink-500" aria-hidden />
            <span className="sr-only">Remove filter</span>
          </Link>
        </li>
      ))}
      <li>
        <Link href={cleared} scroll={false} className="ml-1 text-[0.8125rem] font-medium text-ink-950 underline decoration-ink-300 underline-offset-4 hover:decoration-ink-950">
          Clear all
        </Link>
      </li>
    </ul>
  );
}
