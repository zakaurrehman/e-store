import { describe, expect, it } from "vitest";
import { PRODUCT_CSV_COLUMNS, toProductCsv, type ProductCsvRow } from "@/features/import/csv";
import { runImport } from "@/features/import/importer";
import { CsvSource } from "@/features/import/sources";
import { db } from "@/server/db";

function row(values: Partial<ProductCsvRow>): ProductCsvRow {
  const empty = Object.fromEntries(PRODUCT_CSV_COLUMNS.map((column) => [column, ""])) as ProductCsvRow;
  return { ...empty, ...values };
}

const baseRow = row({ handle: "field-tote", name: "Field Tote", status: "ACTIVE", category: "imported-bags", tags: "canvas|everyday", price: "48.00", stock: "30", sku: "TOTE-001", track_inventory: "true" });
const csv = (...rows: ProductCsvRow[]) => new CsvSource(toProductCsv(rows), "test.csv");
const run = (source: CsvSource, dryRun = false) => runImport({ source, entity: "all", dryRun, skipImages: true });

describe("catalogue import", () => {
  it("does not write anything during a dry run", async () => {
    const { runId, stats } = await run(csv(baseRow), true);
    expect(runId).toBeNull();
    expect(stats.products.created).toBe(1);
    expect(await db.product.count()).toBe(0);
    expect(await db.importRun.count()).toBe(0);
  });

  it("creates products once and skips unchanged records when run again", async () => {
    const first = await run(csv(baseRow));
    expect(first.stats.products).toMatchObject({ created: 1, failed: 0 });

    const second = await run(csv(baseRow));
    expect(second.stats.products).toMatchObject({ created: 0, updated: 0, skipped: 1 });
    expect(await db.product.count({ where: { slug: "field-tote" } })).toBe(1);

    const product = await db.product.findUniqueOrThrow({ where: { slug: "field-tote" }, include: { variants: true, primaryCategory: true } });
    expect(product.priceCents).toBe(4800);
    expect(product.variants).toHaveLength(1);
    expect(product.primaryCategory?.slug).toBe("imported-bags");
  });

  it("updates the existing product in place when a changed row is re-imported", async () => {
    await run(csv({ ...baseRow, price: "52.00", stock: "12" }));
    const product = await db.product.findUniqueOrThrow({ where: { slug: "field-tote" }, include: { variants: true } });
    expect(await db.product.count({ where: { slug: "field-tote" } })).toBe(1);
    expect(product.variants).toHaveLength(1);
    expect(product.priceCents).toBe(5200);
    expect(product.variants[0].stockQuantity).toBe(12);
  });
});
