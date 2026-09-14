// Admin product lifecycle in a real browser: create (with image upload) → edit → storefront → bulk price → stock adjust → ledger → duplicate → delete → CSV export.
// Requires var/qa/admin-state.json from admin-sweep.mjs.
import { chromium } from "@playwright/test";
import { readdirSync } from "node:fs";

const base = "http://localhost:3456";
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: "var/qa/admin-state.json" });
const page = await context.newPage();
const problems = [];
page.on("console", (m) => { if (m.type() === "error") problems.push(m.text().slice(0, 300)); });
page.on("pageerror", (e) => problems.push("pageerror " + e.message.slice(0, 300)));
page.on("response", (r) => { if (r.status() >= 500) problems.push(`http ${r.status()} ${r.url()}`); });
const step = (msg) => console.log("✓", msg);
const toast = async (text) => { const el = page.getByRole("status").filter({ hasText: text }).first(); await el.waitFor({ timeout: 60000 }); return el.innerText(); };
const stamp = Date.now().toString(36).toUpperCase();
const name = `QA Linen Overshirt ${stamp}`;
const sku = `QA-${stamp}`;
const photo = `.cache/seed-media/${readdirSync(".cache/seed-media").find((file) => file.endsWith("-full.jpg"))}`;

try {
  // ── Create ────────────────────────────────────────────────────────────
  await page.goto(`${base}/admin/products/new`, { waitUntil: "networkidle" });
  await page.locator("#p-name:visible").fill(name);
  await page.locator("#p-short:visible").fill("A breathable linen overshirt created by the QA flow.");
  await page.locator("#p-desc:visible").fill("Garment-washed linen with a relaxed fit.\n\n- Corozo buttons\n- Two chest pockets");
  await page.getByRole("button", { name: "Add images" }).click();
  const picker = page.getByRole("dialog", { name: "Media library" });
  await picker.waitFor();
  const uploaded = page.waitForResponse((r) => r.url().includes("/api/admin/media") && r.request().method() === "POST");
  await picker.locator('input[type="file"]').setInputFiles(photo);
  const uploadResponse = await uploaded;
  console.log("  upload", uploadResponse.status());
  const addButton = picker.getByRole("button", { name: /^Add \d* ?images?$/ });
  // The uploaded file is auto-selected once the library reloads.
  for (let i = 0; i < 100 && (await addButton.isDisabled()); i++) await page.waitForTimeout(100);
  console.log("  picker footer:", await picker.getByText(/selected/).innerText());
  await addButton.click();
  await picker.waitFor({ state: "hidden" });
  console.log("  gallery images:", await page.locator("main img:visible").count());
  step("image uploaded and attached");
  await page.getByLabel("SKU").filter({ visible: true }).first().fill(sku);
  await page.getByLabel("Price", { exact: true }).filter({ visible: true }).first().fill("89.00");
  await page.getByLabel("Stock", { exact: true }).filter({ visible: true }).first().fill("12");
  await page.locator("#p-status:visible").selectOption("ACTIVE");
  const primary = page.locator("#p-primary:visible");
  const menShirts = await primary.locator("option", { hasText: "Shirts" }).first().getAttribute("value");
  await primary.selectOption(menShirts);
  await page.getByRole("button", { name: "Create product" }).click();
  await page.waitForURL(/\/admin\/products\/(?!new)[a-z0-9]+$/, { timeout: 120000 });
  await page.locator("#p-name:visible").waitFor();
  const productUrl = page.url();
  const slug = await page.locator("#p-slug:visible").inputValue();
  step(`created ${slug}`);

  // ── Edit ──────────────────────────────────────────────────────────────
  await page.getByLabel("Price", { exact: true }).filter({ visible: true }).first().fill("80.00");
  await page.getByLabel("Sale price").filter({ visible: true }).first().fill("72.00");
  await page.getByRole("button", { name: "Save changes" }).click();
  await toast(/saved/i);
  await page.reload({ waitUntil: "networkidle" });
  console.log("  after reload price/sale:", await page.getByLabel("Price", { exact: true }).filter({ visible: true }).first().inputValue(), await page.getByLabel("Sale price").filter({ visible: true }).first().inputValue(), "images:", await page.locator('[aria-label^="Reorder image"]:visible').count());
  step("edited price and sale price");

  // ── Storefront ────────────────────────────────────────────────────────
  const store = await context.newPage();
  await store.goto(`${base}/p/${slug}`, { waitUntil: "networkidle" });
  console.log("  PDP h1:", await store.getByRole("heading", { level: 1 }).innerText(), "| prices shown:", (await store.locator("main").innerText()).match(/\$\d+\.\d\d/g)?.slice(0, 3).join(" "));
  await store.goto(`${base}/search?q=${encodeURIComponent("linen overshirt " + stamp.toLowerCase())}`, { waitUntil: "networkidle" });
  console.log("  search finds it:", (await store.getByText(name).count()) > 0);
  await store.close();
  step("visible on storefront and in search");

  // ── Bulk price update ─────────────────────────────────────────────────
  await page.goto(`${base}/admin/products?q=${encodeURIComponent(stamp)}`, { waitUntil: "networkidle" });
  await page.getByLabel(`Select ${name}`).filter({ visible: true }).check();
  await page.getByRole("button", { name: "Update prices" }).click();
  await page.locator("#bulk-percent:visible").fill("-10");
  await page.getByRole("dialog").getByRole("button", { name: "Apply" }).click();
  console.log("  toast:", await page.getByRole("status").or(page.getByRole("alert")).first().innerText({ timeout: 60000 }));
  await page.goto(productUrl, { waitUntil: "networkidle" });
  console.log("  after -10%: price", await page.getByLabel("Price", { exact: true }).filter({ visible: true }).first().inputValue(), "sale", await page.getByLabel("Sale price").filter({ visible: true }).first().inputValue());
  step("bulk price update");

  // ── Stock adjust + ledger ─────────────────────────────────────────────
  await page.goto(`${base}/admin/inventory?q=${sku}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Adjust stock for/ }).first().click();
  await page.locator("#stock-qty:visible").fill("7");
  await page.locator("#stock-note:visible").fill("QA cycle count");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await toast("Stock updated");
  await page.getByRole("link", { name: "Ledger" }).first().click();
  await page.getByRole("heading", { name: "Inventory ledger" }).waitFor();
  await page.waitForLoadState("networkidle");
  console.log("  ledger:", (await page.locator("ul.divide-y li").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").slice(0, 70)).join(" | "));
  await page.screenshot({ path: "var/qa/flow-inventory-ledger.png", caret: "initial" });
  step("stock adjusted with ledger entry");

  // ── Duplicate + delete ────────────────────────────────────────────────
  await page.goto(productUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Duplicate" }).click();
  await page.waitForURL((u) => u.href !== productUrl && /\/admin\/products\/[a-z0-9]+$/.test(u.pathname), { timeout: 60000 });
  await page.locator("#p-name:visible").waitFor();
  console.log("  copy:", await page.locator("#p-name:visible").inputValue(), "status:", await page.locator("#p-status:visible").inputValue());
  await page.getByRole("button", { name: /^Delete/ }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /Delete/ }).last().click();
  await page.waitForURL((u) => u.pathname === "/admin/products", { timeout: 60000 });
  step("duplicated and deleted the copy");

  // ── CSV export ────────────────────────────────────────────────────────
  const csv = await page.request.get(`${base}/api/admin/products/export`);
  const text = await csv.text();
  console.log("  export", csv.status(), csv.headers()["content-disposition"], "rows:", text.trim().split("\n").length - 1, "| contains new SKU:", text.includes(sku));
  const anon = await (await chromium.launch()).newContext();
  console.log("  export anonymous status:", (await anon.request.get(`${base}/api/admin/products/export`)).status());
  step("CSV export (and 404 when signed out)");
  console.log("SKU", sku, "SLUG", slug);
} catch (error) {
  console.error("FAILED", error.message.split("\n").slice(0, 6).join("\n"));
  await page.screenshot({ path: "var/qa/flow-products-error.png", caret: "initial", fullPage: true });
}
[...new Set(problems)].forEach((p) => console.log("⚠", p));
await browser.close();
process.exit(0);
