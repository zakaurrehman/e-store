# Catalogue import and export

Zendropship imports categories, products (with variants and attributes) and images from a **CSV file** or a **WooCommerce store's public Store API**, from the command line or from **Admin → Import & export**.

> **Only import content you have the right to use.** Product names, descriptions and photographs belong to their authors. Every import requires an explicit confirmation (`--yes` or `IMPORT_AUTHORIZED=true` on the CLI, a checkbox in the admin), and every imported image records its source. The reference site reviewed in REQUIREMENTS.md was deliberately **not** imported.

## How imports stay safe to repeat

- Each run is recorded as an `ImportRun`. Every external record is mapped to its Zendropship entity through `ImportRecord` (source + type + external id) together with a checksum of the source data.
- Re-running an import **updates** mapped records and **skips** unchanged ones (same checksum); it never creates duplicates.
- CSV imports also match existing products by handle (slug), and variants by the exported `variant_id`, so *export → edit in a spreadsheet → re-import* updates products in place.
- Images are de-duplicated: an image URL already imported is reused, Zendropship's own `/media/...` URLs map back to the existing asset, and identical files are stored once.
- Categories are matched by slug or name before new ones are created; unknown brands and attributes are created automatically.
- **Dry run** reports what would be created or updated and writes nothing.

## Command line

```bash
npm run import:all        -- --source csv --file ./products.csv --dry-run --yes
npm run import:all        -- --source csv --file ./products.csv --yes
npm run import:categories -- --source woocommerce --url https://shop.example.com --yes
npm run import:products   -- --source woocommerce --url https://shop.example.com --draft --skip-images --yes
npm run import:images     -- --source woocommerce --url https://shop.example.com --yes
```

| Flag | Meaning |
| --- | --- |
| `--source csv \| woocommerce` | Source type (default from `IMPORT_SOURCE_TYPE`, otherwise `csv`) |
| `--file <path>` | CSV file (or `IMPORT_CSV_PATH`) |
| `--url <store url>` | WooCommerce store (or `IMPORT_SOURCE_URL`) |
| `--dry-run` | Report without writing |
| `--draft` | Import products as drafts so they can be reviewed before publishing |
| `--skip-images` | Skip image downloads; run the `images` entity later |
| `--yes` | Confirm you hold the rights to the content (or `IMPORT_AUTHORIZED=true`) |

Entities: `categories`, `products` (also brings in the categories it needs), `images` (refreshes images of already-imported products) and `all`. The CLI prints progress and a summary table, and the run appears under Admin → Import & export.

## Admin

**Admin → Import & export** (permission `products.import`) offers the same CSV import (file up to 20 MB) and WooCommerce import with dry-run, draft, skip-images and rights-confirmation options, and lists recent runs with their results. **Admin → Products → Export CSV** (permission `products.export`) downloads the whole catalogue in the import format.

## CSV format

One row per variant; rows with the same `handle` belong to one product, and product-level columns are read from its first row. Headers are case-insensitive. Lists use `|` (or `;`); pairs are written `Name: Value`.

| Column | Notes |
| --- | --- |
| `handle` | Product slug and grouping key (falls back to `name`) |
| `name`, `status` | `status` is `ACTIVE`, `DRAFT` or `ARCHIVED` (default `ACTIVE`) |
| `brand` | Brand name; created if missing |
| `category`, `categories` | Primary category slug; additional category slugs |
| `collections`, `tags` | Collection slugs or names; tag names |
| `short_description`, `description` | Plain text / Markdown |
| `featured` | `true` / `false` |
| `specifications` | `Material: Linen \| Fit: Relaxed` |
| `care`, `shipping_note`, `seo_title`, `seo_description` | Text |
| `images` | Image URLs, first is the main image |
| `attributes` | Filterable product facts, e.g. `Colour: Navy` |
| `variant_id` | Zendropship variant id (present in exports; leave empty for new variants) |
| `variant_options` | Variant-defining options, e.g. `Size: M \| Colour: Navy` |
| `sku`, `barcode` | SKUs must be unique within a product |
| `price`, `sale_price`, `cost` | Decimal amounts; `sale_price` must be lower than `price` |
| `stock`, `low_stock_threshold` | Whole numbers; stock changes are recorded in the inventory ledger |
| `track_inventory`, `allow_backorder`, `variant_active` | `true` / `false` |
| `weight_grams`, `length_mm`, `width_mm`, `height_mm` | Whole numbers |
| `variant_image` | Image URL for this variant |

## WooCommerce Store API

The adapter reads `/wp-json/wc/store/v1` without credentials: categories, then products page by page; variable products are expanded by fetching each variation. HTML descriptions are converted to text. Stock is exact only where the store exposes it (otherwise in-stock items are imported without inventory tracking), and prices respect the store's currency minor unit. Reviews, customers and orders are **not** imported.

## Troubleshooting

- **"Refusing to import"** — add `--yes` or tick the rights confirmation.
- **Row errors** — the run lists the failing product and reason (for example an invalid price or duplicate SKU); the other rows still import.
- **Image failures** — reported per URL; the product is still saved. Re-run with the `images` entity once the source is reachable.
- **Unexpected duplicates** — a CSV with a *new* handle creates a new product. To update, keep the exported handles and `variant_id` values.
