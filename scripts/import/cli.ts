/**
 * Catalogue import CLI.
 *
 *   npm run import:categories -- --source woocommerce --url https://shop.example.com
 *   npm run import:products   -- --source csv --file ./products.csv --draft
 *   npm run import:images     -- --source woocommerce --url https://shop.example.com
 *   npm run import:all        -- --source csv --file ./products.csv --dry-run
 *
 * Flags: --source woocommerce|csv, --url, --file, --dry-run, --draft, --skip-images, --yes
 * Environment fallbacks: IMPORT_SOURCE_TYPE, IMPORT_SOURCE_URL, IMPORT_CSV_PATH, IMPORT_AUTHORIZED.
 *
 * You must confirm you are authorised to reuse the source content (--yes or IMPORT_AUTHORIZED=true).
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { runImport, type ImportEntity } from "@/features/import/importer";
import { CsvSource, WooCommerceStoreSource } from "@/features/import/sources";
import { db } from "@/server/db";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const entity = (process.argv[2] ?? "all") as ImportEntity;
  if (!["categories", "products", "images", "all"].includes(entity)) throw new Error(`Unknown entity "${entity}". Use categories | products | images | all.`);
  const sourceType = flag("source") ?? process.env.IMPORT_SOURCE_TYPE ?? "csv";
  const authorised = has("yes") || process.env.IMPORT_AUTHORIZED === "true";
  if (!authorised) {
    throw new Error("Refusing to import: confirm you hold the rights to the source content with --yes or IMPORT_AUTHORIZED=true.");
  }

  let source;
  if (sourceType === "woocommerce") {
    const url = flag("url") ?? process.env.IMPORT_SOURCE_URL;
    if (!url) throw new Error("Provide --url or IMPORT_SOURCE_URL for the WooCommerce store.");
    source = new WooCommerceStoreSource(url);
  } else if (sourceType === "csv") {
    const file = flag("file") ?? process.env.IMPORT_CSV_PATH;
    if (!file) throw new Error("Provide --file or IMPORT_CSV_PATH for the CSV file.");
    source = new CsvSource(await readFile(file, "utf8"), file.split(/[\\/]/).pop());
  } else {
    throw new Error(`Unknown source type "${sourceType}".`);
  }

  const dryRun = has("dry-run");
  console.log(`Import ${entity} from ${source.key}${dryRun ? " (dry run — nothing is written)" : ""}`);
  const started = Date.now();
  const { runId, stats } = await runImport({ source, entity, dryRun, asDraft: has("draft"), skipImages: has("skip-images"), log: (message) => console.log(message) });
  console.log("\nSummary");
  console.table({
    categories: stats.categories,
    products: { created: stats.products.created, updated: stats.products.updated, skipped: stats.products.skipped, failed: stats.products.failed },
    images: stats.images,
    brands: stats.brands,
  });
  console.log(`${runId ? `Run ${runId} · ` : ""}finished in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main()
  .catch((error) => {
    console.error(`\n✖ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
