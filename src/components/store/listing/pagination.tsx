import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { filtersToSearchParams, type ListingFilters, type SortKey } from "@/features/catalog/filters";
import { cn } from "@/utils/cn";

function pageList(current: number, total: number) {
  const pages = new Set([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const result: Array<number | "gap"> = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) result.push("gap");
    result.push(page);
  });
  return result;
}

export function Pagination({ basePath, filters, page, pageCount, defaultSort, view }: { basePath: string; filters: ListingFilters; page: number; pageCount: number; defaultSort: SortKey; view: "grid" | "list" }) {
  if (pageCount <= 1) return null;
  const href = (target: number) => {
    const params = filtersToSearchParams({ ...filters, page: target }, { sort: defaultSort });
    if (view === "list") params.set("view", "list");
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  };
  const item = "inline-flex h-10 min-w-10 items-center justify-center rounded-sm px-3 text-sm transition-colors";
  return (
    <nav aria-label="Pagination" className="mt-14 flex items-center justify-center gap-1">
      {page > 1 ? (
        <Link href={href(page - 1)} rel="prev" className={cn(item, "text-ink-700 hover:bg-canvas")} aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </Link>
      ) : (
        <span className={cn(item, "text-ink-300")} aria-hidden>
          <ChevronLeft className="size-4" />
        </span>
      )}
      {pageList(page, pageCount).map((entry, index) =>
        entry === "gap" ? (
          <span key={`gap-${index}`} className="px-1 text-ink-400" aria-hidden>
            …
          </span>
        ) : (
          <Link key={entry} href={href(entry)} aria-current={entry === page ? "page" : undefined} className={cn(item, "tabular", entry === page ? "bg-ink-950 font-medium text-white" : "text-ink-700 hover:bg-canvas")}>
            {entry}
          </Link>
        ),
      )}
      {page < pageCount ? (
        <Link href={href(page + 1)} rel="next" className={cn(item, "text-ink-700 hover:bg-canvas")} aria-label="Next page">
          <ChevronRight className="size-4" />
        </Link>
      ) : (
        <span className={cn(item, "text-ink-300")} aria-hidden>
          <ChevronRight className="size-4" />
        </span>
      )}
    </nav>
  );
}
