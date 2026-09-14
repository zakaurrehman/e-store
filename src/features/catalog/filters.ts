/**
 * Listing filter model shared by server queries and client filter UI.
 * URL scheme (stable, crawlable, shareable):
 *   ?q=&category=&brand=a,b&colour=gold&size=m&price=50-200&rating=4&stock=1&sale=1&sort=price-asc&page=2
 * Any non-reserved key is treated as a filterable attribute slug.
 */

export const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "best-selling", label: "Best selling" },
  { value: "rating", label: "Top rated" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
] as const;

export type SortKey = (typeof SORT_OPTIONS)[number]["value"] | "relevance";

export const PAGE_SIZE = 24;

const RESERVED = new Set(["q", "category", "brand", "price", "rating", "stock", "sale", "sort", "page", "view"]);

export type ListingFilters = {
  q: string;
  categories: string[];
  brands: string[];
  attributes: Record<string, string[]>;
  priceMin: number | null;
  priceMax: number | null;
  rating: number | null;
  inStock: boolean;
  onSale: boolean;
  sort: SortKey;
  page: number;
};

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function list(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value.join(",") : (value ?? "");
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter((item) => SLUG.test(item)),
    ),
  )
    .sort()
    .slice(0, 30);
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseListingFilters(params: SearchParamsRecord, defaults: { sort?: SortKey } = {}): ListingFilters {
  const q = (first(params.q) ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  const [minRaw, maxRaw] = (first(params.price) ?? "").split("-");
  const toCents = (value: string | undefined) => {
    if (!value) return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : null;
  };
  const rating = Number(first(params.rating));
  const page = Number.parseInt(first(params.page) ?? "1", 10);
  const sortParam = first(params.sort);
  const validSorts = new Set<string>([...SORT_OPTIONS.map((option) => option.value), "relevance"]);
  const sort = (sortParam && validSorts.has(sortParam) ? sortParam : (defaults.sort ?? (q ? "relevance" : "featured"))) as SortKey;

  const attributes: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(params)) {
    if (RESERVED.has(key) || !SLUG.test(key)) continue;
    const values = list(value);
    if (values.length) attributes[key] = values;
  }

  return {
    q,
    categories: list(params.category),
    brands: list(params.brand),
    attributes: Object.fromEntries(Object.entries(attributes).sort(([a], [b]) => a.localeCompare(b))),
    priceMin: toCents(minRaw),
    priceMax: toCents(maxRaw),
    rating: [1, 2, 3, 4].includes(rating) ? rating : null,
    inStock: first(params.stock) === "1",
    onSale: first(params.sale) === "1",
    sort,
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 500) : 1,
  };
}

export function filtersToSearchParams(filters: Partial<ListingFilters>, defaults: { sort?: SortKey } = {}) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.categories?.length) params.set("category", filters.categories.join(","));
  if (filters.brands?.length) params.set("brand", filters.brands.join(","));
  for (const [key, values] of Object.entries(filters.attributes ?? {})) {
    if (values.length) params.set(key, values.join(","));
  }
  if (filters.priceMin !== null && filters.priceMin !== undefined || filters.priceMax !== null && filters.priceMax !== undefined) {
    params.set("price", `${filters.priceMin != null ? filters.priceMin / 100 : ""}-${filters.priceMax != null ? filters.priceMax / 100 : ""}`);
  }
  if (filters.rating) params.set("rating", String(filters.rating));
  if (filters.inStock) params.set("stock", "1");
  if (filters.onSale) params.set("sale", "1");
  const defaultSort = defaults.sort ?? (filters.q ? "relevance" : "featured");
  if (filters.sort && filters.sort !== defaultSort) params.set("sort", filters.sort);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  return params;
}

export function activeFilterCount(filters: ListingFilters) {
  return (
    filters.categories.length +
    filters.brands.length +
    Object.values(filters.attributes).reduce((sum, values) => sum + values.length, 0) +
    (filters.priceMin !== null || filters.priceMax !== null ? 1 : 0) +
    (filters.rating ? 1 : 0) +
    (filters.inStock ? 1 : 0) +
    (filters.onSale ? 1 : 0)
  );
}
