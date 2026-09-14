import { csvBool, csvList, csvPairs, parseProductCsv } from "./csv";

/** Normalised shapes every import source produces. */
export type SourceCategory = { externalId: string; name: string; slug?: string; description?: string; parentExternalId?: string | null; imageUrl?: string | null };

export type SourceVariant = {
  externalId: string;
  options: Array<[attribute: string, value: string]>;
  sku?: string | null;
  barcode?: string | null;
  priceCents: number;
  salePriceCents?: number | null;
  costCents?: number | null;
  stockQuantity: number | null;
  trackInventory?: boolean;
  allowBackorder?: boolean;
  lowStockThreshold?: number;
  weightGrams?: number | null;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  imageUrl?: string | null;
  isActive?: boolean;
};

export type SourceProduct = {
  externalId: string;
  name: string;
  slug?: string;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  brand?: string | null;
  categoryExternalIds: string[];
  categoryNames?: string[];
  primaryCategoryExternalId?: string | null;
  collections?: string[];
  tags?: string[];
  shortDescription?: string | null;
  description?: string | null;
  featured?: boolean;
  specifications?: Array<{ label: string; value: string }>;
  careInstructions?: string | null;
  shippingNote?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  imageUrls: string[];
  attributes?: Array<[attribute: string, value: string]>;
  variants: SourceVariant[];
  ratingAverage?: number | null;
  ratingCount?: number | null;
};

export interface ImportSource {
  readonly key: string;
  /** Update existing products with the same slug when the source has never been imported (used for export → edit → re-import). */
  readonly matchExistingBySlug?: boolean;
  categories(): Promise<SourceCategory[]>;
  products(): Promise<SourceProduct[]>;
}

const stripHtml = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<li>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "’")
    .replace(/&#8216;|&lsquo;/g, "‘")
    .replace(/&#8220;|&ldquo;/g, "“")
    .replace(/&#8221;|&rdquo;/g, "”")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

type WcProduct = {
  id: number;
  name: string;
  slug: string;
  type: string;
  sku: string;
  short_description: string;
  description: string;
  prices: { price: string; regular_price: string; sale_price: string; currency_minor_unit: number };
  on_sale: boolean;
  images: Array<{ id: number; src: string; alt: string }>;
  categories: Array<{ id: number; name: string; slug: string }>;
  tags: Array<{ id: number; name: string; slug: string }>;
  brands?: Array<{ id: number; name: string; slug: string }>;
  attributes: Array<{ id: number; name: string; taxonomy: string | null; has_variations: boolean; terms: Array<{ id: number; name: string; slug: string }> }>;
  variations: Array<{ id: number; attributes: Array<{ name: string; value: string }> }>;
  is_in_stock: boolean;
  low_stock_remaining: number | null;
  average_rating: string;
  review_count: number;
  weight?: string;
  dimensions?: { length: string; width: string; height: string };
};

type WcCategory = { id: number; name: string; slug: string; description: string; parent: number; image: { src: string } | null };

/**
 * Reads a WooCommerce store through its public Store API (no credentials). Variable products are
 * expanded by fetching each variation. Only use against stores whose content you are authorised to reuse.
 */
export class WooCommerceStoreSource implements ImportSource {
  readonly key: string;
  private readonly base: string;

  constructor(storeUrl: string, private readonly options: { fetchImpl?: typeof fetch } = {}) {
    this.base = storeUrl.replace(/\/$/, "");
    this.key = `woocommerce:${new URL(this.base).host}`;
  }

  private async json<T>(path: string): Promise<{ data: T; totalPages: number }> {
    const doFetch = this.options.fetchImpl ?? fetch;
    const response = await doFetch(`${this.base}/wp-json/wc/store/v1${path}`, { headers: { "User-Agent": "Veyora-Importer/1.0" }, signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Source responded ${response.status} for ${path}`);
    return { data: (await response.json()) as T, totalPages: Number(response.headers.get("x-wp-totalpages") ?? 1) };
  }

  private async paginate<T>(path: string): Promise<T[]> {
    const first = await this.json<T[]>(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=1`);
    const items = [...first.data];
    for (let page = 2; page <= first.totalPages; page++) items.push(...(await this.json<T[]>(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`)).data);
    return items;
  }

  async categories(): Promise<SourceCategory[]> {
    const categories = await this.paginate<WcCategory>("/products/categories");
    return categories
      .filter((category) => category.slug !== "uncategorized")
      .map((category) => ({ externalId: String(category.id), name: stripHtml(category.name), slug: category.slug, description: stripHtml(category.description ?? ""), parentExternalId: category.parent ? String(category.parent) : null, imageUrl: category.image?.src ?? null }));
  }

  async products(): Promise<SourceProduct[]> {
    const products = await this.paginate<WcProduct>("/products");
    const result: SourceProduct[] = [];
    for (const product of products) {
      const minor = product.prices.currency_minor_unit ?? 2;
      const toCents = (value: string) => Math.round(Number(value) / 10 ** (minor - 2));
      const regular = toCents(product.prices.regular_price || product.prices.price);
      const sale = product.on_sale && product.prices.sale_price ? toCents(product.prices.sale_price) : null;
      const variants: SourceVariant[] = [];
      if (product.type === "variable" && product.variations.length > 0) {
        for (const variation of product.variations) {
          const detail = (await this.json<WcProduct>(`/products/${variation.id}`)).data;
          const detailRegular = toCents(detail.prices.regular_price || detail.prices.price);
          const detailSale = detail.on_sale && detail.prices.sale_price ? toCents(detail.prices.sale_price) : null;
          variants.push({
            externalId: String(variation.id),
            options: variation.attributes.map((attribute) => [attribute.name.replace(/^pa_/, ""), attribute.value] as [string, string]),
            sku: detail.sku || null,
            priceCents: detailRegular,
            salePriceCents: detailSale !== null && detailSale < detailRegular ? detailSale : null,
            stockQuantity: detail.low_stock_remaining ?? (detail.is_in_stock ? null : 0),
            trackInventory: detail.low_stock_remaining !== null || !detail.is_in_stock,
            weightGrams: detail.weight ? Math.round(Number(detail.weight) * 1000) : null,
            imageUrl: detail.images[0]?.src ?? null,
          });
        }
      } else {
        variants.push({
          externalId: String(product.id),
          options: [],
          sku: product.sku || null,
          priceCents: regular,
          salePriceCents: sale !== null && sale < regular ? sale : null,
          stockQuantity: product.low_stock_remaining ?? (product.is_in_stock ? null : 0),
          trackInventory: product.low_stock_remaining !== null || !product.is_in_stock,
          weightGrams: product.weight ? Math.round(Number(product.weight) * 1000) : null,
          lengthMm: product.dimensions?.length ? Math.round(Number(product.dimensions.length) * 10) : null,
          widthMm: product.dimensions?.width ? Math.round(Number(product.dimensions.width) * 10) : null,
          heightMm: product.dimensions?.height ? Math.round(Number(product.dimensions.height) * 10) : null,
        });
      }
      result.push({
        externalId: String(product.id),
        name: stripHtml(product.name),
        slug: product.slug,
        status: "ACTIVE",
        brand: product.brands?.[0]?.name ?? null,
        categoryExternalIds: product.categories.filter((category) => category.slug !== "uncategorized").map((category) => String(category.id)),
        categoryNames: product.categories.map((category) => stripHtml(category.name)),
        tags: product.tags.map((tag) => tag.name),
        shortDescription: stripHtml(product.short_description ?? "") || null,
        description: stripHtml(product.description ?? "") || null,
        imageUrls: product.images.map((image) => image.src),
        attributes: product.attributes.filter((attribute) => !attribute.has_variations).flatMap((attribute) => attribute.terms.map((term) => [attribute.name, term.name] as [string, string])),
        variants,
        ratingAverage: Number(product.average_rating) || null,
        ratingCount: product.review_count || null,
      });
    }
    return result;
  }
}

/** Reads the Veyora product CSV (the same format /api/admin/products/export produces). */
export class CsvSource implements ImportSource {
  readonly key: string;
  readonly matchExistingBySlug = true;
  constructor(private readonly text: string, name = "upload") {
    this.key = `csv:${name}`;
  }

  async categories(): Promise<SourceCategory[]> {
    const { rows } = parseProductCsv(this.text);
    const slugs = new Set<string>();
    for (const row of rows) for (const slug of [row.category, ...csvList(row.categories)]) if (slug) slugs.add(slug);
    return [...slugs].map((slug) => ({ externalId: slug, name: slug.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()), slug }));
  }

  async products(): Promise<SourceProduct[]> {
    const { rows, errors } = parseProductCsv(this.text);
    if (errors.length) throw new Error(errors.slice(0, 5).join("; "));
    const byHandle = new Map<string, SourceProduct>();
    for (const [index, row] of rows.entries()) {
      const handle = row.handle || row.name;
      if (!handle) throw new Error(`Row ${index + 2}: handle or name is required`);
      const price = Math.round(Number(row.price) * 100);
      if (!Number.isFinite(price)) throw new Error(`Row ${index + 2}: invalid price "${row.price}"`);
      const variant: SourceVariant = {
        externalId: row.variant_id || `${handle}:${row.variant_options || row.sku || index}`,
        options: csvPairs(row.variant_options),
        sku: row.sku || null,
        barcode: row.barcode || null,
        priceCents: price,
        salePriceCents: row.sale_price ? Math.round(Number(row.sale_price) * 100) : null,
        costCents: row.cost ? Math.round(Number(row.cost) * 100) : null,
        stockQuantity: row.stock === "" ? null : Number(row.stock),
        trackInventory: csvBool(row.track_inventory, true),
        allowBackorder: csvBool(row.allow_backorder, false),
        lowStockThreshold: row.low_stock_threshold ? Number(row.low_stock_threshold) : undefined,
        weightGrams: row.weight_grams ? Number(row.weight_grams) : null,
        lengthMm: row.length_mm ? Number(row.length_mm) : null,
        widthMm: row.width_mm ? Number(row.width_mm) : null,
        heightMm: row.height_mm ? Number(row.height_mm) : null,
        imageUrl: row.variant_image || null,
        isActive: csvBool(row.variant_active, true),
      };
      const existing = byHandle.get(handle);
      if (existing) {
        existing.variants.push(variant);
        continue;
      }
      const categories = [row.category, ...csvList(row.categories)].filter(Boolean);
      byHandle.set(handle, {
        externalId: handle,
        name: row.name || handle,
        slug: row.handle || undefined,
        status: row.status === "DRAFT" || row.status === "ARCHIVED" ? row.status : "ACTIVE",
        brand: row.brand || null,
        categoryExternalIds: [...new Set(categories)],
        primaryCategoryExternalId: row.category || null,
        collections: csvList(row.collections),
        tags: csvList(row.tags),
        shortDescription: row.short_description || null,
        description: row.description || null,
        featured: csvBool(row.featured, false),
        specifications: csvPairs(row.specifications).map(([label, value]) => ({ label, value })),
        careInstructions: row.care || null,
        shippingNote: row.shipping_note || null,
        seoTitle: row.seo_title || null,
        seoDescription: row.seo_description || null,
        imageUrls: csvList(row.images),
        attributes: csvPairs(row.attributes),
        variants: [variant],
      });
    }
    return [...byHandle.values()];
  }
}
