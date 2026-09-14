import Papa from "papaparse";

/**
 * Product CSV format (one row per variant). Columns are case-insensitive; unknown columns are ignored.
 * Export and import share this definition so a round trip is lossless.
 */
export const PRODUCT_CSV_COLUMNS = [
  "handle",
  "name",
  "status",
  "brand",
  "category",
  "categories",
  "collections",
  "tags",
  "short_description",
  "description",
  "featured",
  "specifications",
  "care",
  "shipping_note",
  "seo_title",
  "seo_description",
  "images",
  "attributes",
  "variant_id",
  "variant_options",
  "sku",
  "barcode",
  "price",
  "sale_price",
  "cost",
  "stock",
  "low_stock_threshold",
  "track_inventory",
  "allow_backorder",
  "weight_grams",
  "length_mm",
  "width_mm",
  "height_mm",
  "variant_image",
  "variant_active",
] as const;

export type ProductCsvRow = Record<(typeof PRODUCT_CSV_COLUMNS)[number], string>;

export function parseProductCsv(text: string): { rows: ProductCsvRow[]; errors: string[] } {
  const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: "greedy", transformHeader: (header) => header.trim().toLowerCase().replace(/[\s-]+/g, "_") });
  const errors = result.errors.filter((error) => error.code !== "TooFewFields" && error.code !== "TooManyFields").map((error) => `Row ${(error.row ?? 0) + 2}: ${error.message}`);
  const rows = result.data.map((row) => {
    const normalised = {} as ProductCsvRow;
    for (const column of PRODUCT_CSV_COLUMNS) normalised[column] = (row[column] ?? "").trim();
    return normalised;
  });
  return { rows, errors };
}

export function toProductCsv(rows: ProductCsvRow[]) {
  return Papa.unparse({ fields: [...PRODUCT_CSV_COLUMNS], data: rows.map((row) => PRODUCT_CSV_COLUMNS.map((column) => row[column] ?? "")) });
}

export const csvBool = (value: string, fallback = false) => (value === "" ? fallback : /^(1|true|yes|y)$/i.test(value));
export const csvList = (value: string) => value.split(/[|;]/).map((item) => item.trim()).filter(Boolean);
/** "Size: M | Colour: Navy" → [["Size","M"],["Colour","Navy"]] */
export const csvPairs = (value: string) => csvList(value).map((pair) => pair.split(":").map((part) => part.trim())).filter((pair) => pair.length === 2 && pair[0] && pair[1]) as Array<[string, string]>;
