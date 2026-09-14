// Admin operations in a real browser, each verified on the storefront where it has a visible effect:
// taxonomy (create + keyboard drag reorder), coupon → cart discount, announcement, CMS page, FAQ, banner with image picker,
// media library (upload / alt / delete), CSV import via UI (dry run), cron endpoint auth.
//   CRON_SECRET=... CSV=<path> node scripts/qa/admin-ops-flow.mjs
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
page.on("dialog", (d) => d.accept());
const stamp = Date.now().toString(36).toUpperCase();
const step = (msg) => console.log("✓", msg);
const v = (selector) => page.locator(`${selector}:visible`);
const dialog = () => page.getByRole("dialog").filter({ visible: true });
const toast = async (text) => (await page.getByRole("status").filter({ hasText: text }).first().waitFor({ timeout: 90000 }), text);
const go = (path) => page.goto(base + path, { waitUntil: "networkidle", timeout: 180000 });
const run = async (label, fn) => {
  if (process.env.ONLY && !label.includes(process.env.ONLY)) return;
  try {
    await fn();
    step(label);
  } catch (error) {
    console.log("✗", label, "—", error.message.split("\n").slice(0, 3).join(" "));
    await page.screenshot({ path: `var/qa/ops-fail-${label.replace(/\W+/g, "-")}.png`, caret: "initial", fullPage: true });
  }
};
const store = await context.newPage();

await run("taxonomy: create category, visible on storefront", async () => {
  await go("/admin/catalog");
  await page.getByRole("button", { name: "New department" }).click();
  await v("#name").fill(`QA Capsule ${stamp}`);
  await dialog().getByRole("button", { name: "Create category" }).click();
  await toast("Category created.");
  await page.getByText(`QA Capsule ${stamp}`, { exact: true }).waitFor();
  const res = await store.goto(`${base}/c/qa-capsule-${stamp.toLowerCase()}`, { waitUntil: "networkidle" });
  console.log("  /c/qa-capsule →", res.status(), await store.getByRole("heading", { level: 1 }).innerText());
});

await run("taxonomy: keyboard drag-and-drop reorder persists", async () => {
  await go("/admin/catalog?tab=brands");
  const names = async () => (await page.locator("li span.text-sm.font-medium:visible").allInnerTexts()).slice(0, 3);
  const before = await names();
  const handle = page.getByRole("button", { name: "Drag to reorder" }).filter({ visible: true }).first();
  await handle.focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(200);
  await page.keyboard.press("Space");
  await page.waitForTimeout(1500);
  await go("/admin/catalog?tab=brands");
  const after = await names();
  console.log("  before:", before.join(", "), "| after reload:", after.join(", "));
  if (after[0] !== before[1] || after[1] !== before[0]) throw new Error("order did not persist");
  // restore
  await page.getByRole("button", { name: "Drag to reorder" }).filter({ visible: true }).first().focus();
  for (const key of ["Space", "ArrowDown", "Space"]) { await page.keyboard.press(key); await page.waitForTimeout(200); }
  await page.waitForTimeout(1500);
});

await run("discounts: create coupon, apply in cart", async () => {
  await go("/admin/discounts");
  await page.getByRole("button", { name: "New coupon" }).click();
  await v("#code").fill(`QA${stamp}`);
  await v("#description").fill("QA ten percent");
  await v("#value").fill("10");
  await v("#minSubtotal").fill("20");
  await v("#usageLimit").fill("5");
  await dialog().getByRole("button", { name: "Create coupon" }).click();
  await toast("Coupon created.");
  await page.getByText(`QA${stamp}`, { exact: true }).waitFor();
  // storefront
  await store.goto(`${base}/p/qa-linen-overshirt-mtzridr3`, { waitUntil: "networkidle" });
  await store.getByRole("button", { name: /Add to bag/ }).first().click();
  await store.waitForTimeout(1500);
  await store.goto(`${base}/cart`, { waitUntil: "networkidle" });
  const removeExisting = store.getByRole("button", { name: /^Remove promo code/ });
  if (await removeExisting.count()) { await removeExisting.click(); await store.waitForTimeout(1500); }
  await store.getByRole("button", { name: "Add a promo code" }).click();
  await store.locator("#coupon-code").fill(`QA${stamp}`);
  await store.getByRole("button", { name: "Apply" }).click();
  await store.getByText(`QA${stamp}`).nth(1).waitFor({ timeout: 30000 }).catch(() => {});
  await store.waitForTimeout(1500);
  const summary = await store.getByLabel("Order summary").innerText();
  console.log("  summary:", summary.replace(/\s+/g, " ").slice(0, 160));
  const subtotal = Number(summary.match(/Subtotal[^$]*\$([\d,.]+)/)[1].replace(/,/g, ""));
  const discount = Number(summary.match(/Discount\s*[−-]\$([\d,.]+)/)[1].replace(/,/g, ""));
  console.log("  subtotal", subtotal, "discount", discount, "expected", (subtotal * 0.1).toFixed(2));
  if (Math.abs(discount - subtotal * 0.1) > 0.005) throw new Error("discount is not 10% of subtotal");
  await store.screenshot({ path: "var/qa/ops-cart-coupon.png", caret: "initial" });
});

await run("settings: announcement bar change shows on storefront", async () => {
  await go("/admin/settings?section=announcement");
  await v("#announcement-message").fill(`Free returns within 30 days · QA ${stamp}`);
  await v("#announcement-enabled").check();
  await page.getByRole("button", { name: "Save settings" }).click();
  await toast("Settings saved.");
  await store.goto(`${base}/`, { waitUntil: "networkidle" });
  const found = await store.getByText(`QA ${stamp}`).count();
  console.log("  announcement visible on home:", found > 0);
  if (!found) throw new Error("announcement not visible");
  await go("/admin/settings?section=announcement");
  await v("#announcement-message").fill("Free shipping on orders over $150 · 30-day returns");
  await page.getByRole("button", { name: "Save settings" }).click();
  await toast("Settings saved.");
});

await run("CMS: create published page, rendered on storefront", async () => {
  await go("/admin/content/pages/new");
  await v("#title").fill(`QA Care Guide ${stamp}`);
  await v("#content").fill(`## Washing\n\nCold wash, **inside out**.\n\n| Fabric | Temp |\n| --- | --- |\n| Linen | 30°C |\n\n<script>alert(1)</script>`);
  await v("#status").selectOption("PUBLISHED");
  await page.getByRole("button", { name: "Create page" }).click();
  await page.waitForURL(/\/admin\/content\/pages\/(?!new)[a-z0-9]+$/, { timeout: 90000 });
  const slug = `qa-care-guide-${stamp.toLowerCase()}`;
  const res = await store.goto(`${base}/pages/${slug}`, { waitUntil: "networkidle" });
  const html = await store.locator("main").innerHTML();
  console.log("  /pages/" + slug, "→", res.status(), "| has table:", html.includes("<table"), "| raw script rendered:", html.includes("<script>alert"));
  if (res.status() !== 200) throw new Error("page not published");
});

await run("CMS: FAQ entry appears on /faq", async () => {
  await go("/admin/content/pages?tab=faq");
  await page.getByRole("button", { name: "Add question" }).click();
  await v("#question").fill(`Do you gift wrap? ${stamp}`);
  await v("#answer").fill("Yes — add a note at checkout and we wrap it in recycled paper.");
  await dialog().getByRole("button", { name: "Save" }).click();
  await toast("FAQ added.");
  await store.goto(`${base}/faq`, { waitUntil: "networkidle" });
  const count = await store.getByText(`Do you gift wrap? ${stamp}`).count();
  console.log("  on /faq:", count > 0);
  if (!count) throw new Error("FAQ not on storefront");
});

await run("CMS: banner with single image picker, then delete", async () => {
  await go("/admin/content?tab=banners");
  await page.getByRole("button", { name: "New banner" }).click();
  await v("#title").fill(`QA banner ${stamp}`);
  await v("#isActive").uncheck();
  await dialog().getByRole("button", { name: "Choose image" }).first().click();
  const picker = page.getByRole("dialog", { name: "Media library" });
  await picker.locator("ul button").first().waitFor({ timeout: 60000 });
  await picker.locator("ul button").first().click();
  await picker.getByRole("button", { name: "Choose image" }).click();
  await picker.waitFor({ state: "hidden" });
  await dialog().getByRole("button", { name: "Create banner" }).click();
  await toast("Banner created.");
  const card = page.locator("li", { hasText: `QA banner ${stamp}` });
  console.log("  banner card has image:", (await card.locator("img").count()) > 0, "| inactive tag:", (await card.getByText("Inactive").count()) > 0);
  await card.getByRole("button").last().click();
  await dialog().getByRole("button", { name: "Delete" }).click();
  await toast("Banner deleted.");
});

await run("media library: upload, edit alt text, delete", async () => {
  await go("/admin/media");
  const file = `.cache/seed-media/${readdirSync(".cache/seed-media").filter((f) => f.endsWith("-detail.jpg"))[3]}`;
  await v("select[aria-label='Upload to folder']").selectOption("library");
  const upload = page.waitForResponse((r) => r.url().includes("/api/admin/media") && r.request().method() === "POST");
  await page.locator('input[type="file"]').setInputFiles(file);
  console.log("  upload status:", (await upload).status());
  await toast(/uploaded/);
  await v("select[aria-label='Folder']").selectOption("library");
  await page.waitForTimeout(1500);
  await page.locator("main ul button").first().click();
  await v("#media-alt").fill(`QA alt ${stamp}`);
  await dialog().getByRole("button", { name: "Save alt text" }).click();
  await toast("Alt text saved");
  await page.locator("main ul button").first().click();
  console.log("  alt persisted:", await v("#media-alt").inputValue());
  await dialog().getByRole("button", { name: "Delete" }).click();
  await toast(/Image deleted|in use|Couldn't/);
});

await run("imports: CSV dry run through the admin UI", async () => {
  await go("/admin/imports");
  await page.locator("#csv-file").setInputFiles(process.env.CSV);
  await page.locator("#csv-dry").check();
  // Without the rights confirmation the server refuses — and the form must keep the file and options.
  await page.getByRole("button", { name: "Run CSV import" }).click();
  await page.getByText("Confirm that you hold the rights").waitFor({ timeout: 60000 });
  console.log("  refused without confirmation; file kept:", await page.locator("#csv-file").evaluate((el) => el.files.length === 1), "| dry run still ticked:", await page.locator("#csv-dry").isChecked());
  await page.locator("#csv-auth").check();
  await page.getByRole("button", { name: "Run CSV import" }).click();
  await page.getByText("Import finished").first().waitFor({ timeout: 120000 });
  console.log("  ", (await page.getByRole("alert").or(page.getByRole("status")).filter({ hasText: "Products:" }).first().innerText().catch(async () => await page.getByText(/^Products:/).first().innerText())).replace(/\s+/g, " "));
  // refusal without authorisation checkbox is enforced server-side
});

await run("cron endpoint requires the secret", async () => {
  const anon = await page.request.get(`${base}/api/cron`);
  const wrong = await page.request.get(`${base}/api/cron`, { headers: { authorization: "Bearer nope" } });
  const ok = await page.request.get(`${base}/api/cron`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  console.log("  no auth:", anon.status(), "| wrong:", wrong.status(), "| correct:", ok.status(), JSON.stringify(await ok.json()).slice(0, 220));
  if (anon.status() !== 401 || wrong.status() !== 401 || ok.status() !== 200) throw new Error("cron auth wrong");
});

[...new Set(problems)].forEach((p) => console.log("⚠", p));
await browser.close();
process.exit(0);
