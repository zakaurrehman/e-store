"use client";

import { ArrowUpRight, Clock, Search, TrendingUp, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import type { Suggestions } from "@/features/search/suggest";
import { cn } from "@/utils/cn";
import { formatMoney } from "@/utils/money";

export const OPEN_SEARCH_EVENT = "zendropship:open-search";
const HISTORY_KEY = "zendropship:search-history";

function readHistory(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}

export function rememberSearch(term: string) {
  const clean = term.trim();
  if (clean.length < 2) return;
  try {
    const next = [clean, ...readHistory().filter((item) => item.toLowerCase() !== clean.toLowerCase())].slice(0, 6);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable (private mode) — history is a convenience only
  }
}

export function SearchButton({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))} className={className} aria-label={children ? undefined : "Search"}>
      {children ?? <Search className="size-5" strokeWidth={1.6} />}
    </button>
  );
}

export function SearchDialog() {
  const [open, setOpen] = useState(false);
  const [query, setQueryValue] = useState("");
  const [data, setData] = useState<Suggestions | null>(null);
  const [popular, setPopular] = useState<string[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const listId = useId();

  // Close on navigation — adjusted during render rather than in an effect.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  /** A query change resets keyboard selection and the loading state up front; the effect below only fetches. */
  const setQuery = (next: string) => {
    setQueryValue(next);
    setActiveIndex(-1);
    const searchable = next.trim().length >= 2;
    setLoading(searchable);
    if (!searchable) setData(null);
  };

  useEffect(() => {
    // Recent searches live in localStorage, so they are read when the dialog is opened.
    const show = () => {
      setHistory(readHistory());
      setOpen(true);
    };
    const keyHandler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !typing)) {
        event.preventDefault();
        show();
      }
    };
    window.addEventListener(OPEN_SEARCH_EVENT, show);
    window.addEventListener("keydown", keyHandler);
    return () => {
      window.removeEventListener(OPEN_SEARCH_EVENT, show);
      window.removeEventListener("keydown", keyHandler);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    if (popular.length === 0) {
      fetch("/api/search/suggest")
        .then((response) => (response.ok ? response.json() : { popular: [] }))
        .then((body: { popular?: string[] }) => setPopular(body.popular ?? []))
        .catch(() => undefined);
    }
    return () => window.clearTimeout(timer);
  }, [open, popular.length]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/suggest?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        if (!response.ok) throw new Error(String(response.status));
        setData((await response.json()) as Suggestions);
        setError(false);
      } catch (cause) {
        if ((cause as Error).name !== "AbortError") setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 160);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const submit = useCallback(
    (term: string) => {
      const clean = term.trim();
      if (!clean) return;
      rememberSearch(clean);
      setOpen(false);
      router.push(`/search?q=${encodeURIComponent(clean)}`);
    },
    [router],
  );

  const productLinks = data?.products ?? [];

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(productLinks.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(-1, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeIndex >= 0 && productLinks[activeIndex]) {
        rememberSearch(query);
        setOpen(false);
        router.push(`/p/${productLinks[activeIndex].slug}`);
      } else submit(query);
    }
  };

  const hasResults = !!data && (data.products.length > 0 || data.categories.length > 0 || data.brands.length > 0);

  return (
    <Dialog open={open} onClose={() => setOpen(false)} variant="center" title="Search" hideTitle className="mt-[8vh] mb-auto w-[min(calc(100vw-1.5rem),44rem)]" bodyClassName="px-0 sm:px-0 pb-0">
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          submit(query);
        }}
        className="relative border-b border-line"
      >
        <Search className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-ink-400" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search products, brands and categories"
          aria-label="Search the store"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          autoComplete="off"
          enterKeyHint="search"
          maxLength={100}
          className="h-16 w-full bg-transparent pl-13 pr-24 text-[1.0625rem] text-ink-950 outline-none placeholder:text-ink-400"
        />
        <div className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-2">
          {loading && <Spinner className="size-4 text-ink-400" />}
          {query && (
            <button type="button" onClick={() => setQuery("")} className="rounded-xs p-1 text-ink-400 hover:text-ink-950" aria-label="Clear search">
              <X className="size-4" />
            </button>
          )}
        </div>
      </form>

      <div className="max-h-[min(64dvh,34rem)] overflow-y-auto px-5 py-5">
        {query.trim().length < 2 ? (
          <div className="grid gap-7 sm:grid-cols-2">
            {history.length > 0 && (
              <section>
                <div className="flex items-center justify-between">
                  <h3 className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">Recent searches</h3>
                  <button
                    type="button"
                    className="text-xs text-ink-500 hover:text-ink-950"
                    onClick={() => {
                      try {
                        localStorage.removeItem(HISTORY_KEY);
                      } catch {}
                      setHistory([]);
                    }}
                  >
                    Clear
                  </button>
                </div>
                <ul className="mt-3 space-y-1">
                  {history.map((term) => (
                    <li key={term}>
                      <button type="button" onClick={() => submit(term)} className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-[0.9375rem] text-ink-800 hover:bg-canvas">
                        <Clock className="size-4 text-ink-400" aria-hidden />
                        {term}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {popular.length > 0 && (
              <section>
                <h3 className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">Popular searches</h3>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {popular.map((term) => (
                    <li key={term}>
                      <button type="button" onClick={() => submit(term)} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm text-ink-800 hover:border-ink-950">
                        <TrendingUp className="size-3.5 text-ink-400" aria-hidden />
                        {term}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className={cn(history.length === 0 && popular.length === 0 && "sm:col-span-2")}>
              <h3 className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">Shop by department</h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                {["women", "men", "kids", "beauty", "watches", "jewellery", "bags-accessories", "tech", "home"].map((slug) => (
                  <li key={slug}>
                    <Link href={`/c/${slug}`} onClick={() => setOpen(false)} className="inline-flex rounded-full bg-canvas px-3 py-1.5 text-sm capitalize text-ink-800 hover:bg-canvas-deep">
                      {slug.replace("bags-accessories", "Bags & accessories")}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        ) : error ? (
          <p className="py-8 text-center text-sm text-ink-500">Search is temporarily unavailable. Press Enter to see full results.</p>
        ) : !loading && data && !hasResults ? (
          <div className="py-8 text-center">
            <p className="text-[0.9375rem] text-ink-800">No matches for “{query.trim()}”.</p>
            {data.correctedQuery && (
              <button type="button" onClick={() => setQuery(data.correctedQuery!)} className="mt-2 text-sm font-medium text-ink-950 underline underline-offset-4">
                Search for “{data.correctedQuery}” instead
              </button>
            )}
          </div>
        ) : (
          data && (
            <div className="grid gap-7 sm:grid-cols-[1fr_12rem]">
              <section>
                {data.correctedQuery && (
                  <p className="mb-3 text-sm text-ink-500">
                    Showing results for <span className="font-medium text-ink-950">“{data.correctedQuery}”</span>
                  </p>
                )}
                <h3 className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">Products</h3>
                <ul id={listId} role="listbox" aria-label="Product suggestions" className="mt-2 space-y-0.5">
                  {data.products.map((product, index) => (
                    <li key={product.id} id={`${listId}-${index}`} role="option" aria-selected={activeIndex === index}>
                      <Link
                        href={`/p/${product.slug}`}
                        onClick={() => {
                          rememberSearch(query);
                          setOpen(false);
                        }}
                        className={cn("flex items-center gap-3.5 rounded-sm p-2 transition-colors hover:bg-canvas", activeIndex === index && "bg-canvas")}
                      >
                        <div className="relative size-14 shrink-0 overflow-hidden rounded-xs bg-canvas">
                          {product.imageUrl && <Image src={product.imageUrl} alt="" fill sizes="56px" className="object-cover" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          {product.brand && <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-ink-500">{product.brand}</p>}
                          <p className="truncate text-[0.9375rem] text-ink-950">{product.name}</p>
                        </div>
                        <p className={cn("tabular shrink-0 text-sm font-medium", product.compareAtPriceCents ? "text-sale" : "text-ink-950")}>{formatMoney(product.priceCents)}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => submit(query)} className="mt-3 inline-flex items-center gap-1.5 px-2 text-sm font-medium text-ink-950 underline decoration-ink-300 underline-offset-4 hover:decoration-ink-950">
                  See all results for “{query.trim()}” <ArrowUpRight className="size-3.5" aria-hidden />
                </button>
              </section>
              <div className="space-y-6">
                {data.categories.length > 0 && (
                  <section>
                    <h3 className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">Categories</h3>
                    <ul className="mt-2 space-y-1">
                      {data.categories.map((category) => (
                        <li key={category.slug}>
                          <Link href={`/c/${category.slug}`} onClick={() => setOpen(false)} className="block rounded-xs px-2 py-1.5 text-[0.9375rem] text-ink-800 hover:bg-canvas">
                            {category.name}
                            {category.parent && <span className="text-ink-400"> · {category.parent}</span>}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {data.brands.length > 0 && (
                  <section>
                    <h3 className="text-2xs font-semibold uppercase tracking-[0.12em] text-ink-500">Brands</h3>
                    <ul className="mt-2 space-y-1">
                      {data.brands.map((brand) => (
                        <li key={brand.slug}>
                          <Link href={`/brands/${brand.slug}`} onClick={() => setOpen(false)} className="block rounded-xs px-2 py-1.5 text-[0.9375rem] text-ink-800 hover:bg-canvas">
                            {brand.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            </div>
          )
        )}
      </div>
      <div className="hidden items-center justify-between border-t border-line px-5 py-2.5 text-xs text-ink-500 sm:flex">
        <span>
          <kbd className="rounded-xs border border-line px-1 font-sans">↑</kbd> <kbd className="rounded-xs border border-line px-1 font-sans">↓</kbd> to navigate ·{" "}
          <kbd className="rounded-xs border border-line px-1 font-sans">Enter</kbd> to select
        </span>
        <span>
          <kbd className="rounded-xs border border-line px-1 font-sans">Esc</kbd> to close
        </span>
      </div>
    </Dialog>
  );
}
