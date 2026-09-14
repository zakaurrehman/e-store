// Loads every admin route as the seeded super admin; reports h1, server errors and console errors.
//   PW=<SEED_ADMIN_PASSWORD> node scripts/qa/admin-sweep.mjs
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = "http://localhost:3456";
mkdirSync("var/qa", { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
let problems = [];
page.on("console", (m) => { if (m.type() === "error") problems.push(m.text().slice(0, 300)); });
page.on("pageerror", (e) => problems.push("pageerror " + e.message.slice(0, 300)));
page.on("response", (r) => { if (r.status() >= 500) problems.push(`http ${r.status()} ${r.url()}`); });

await page.goto(`${base}/login?next=/admin`, { waitUntil: "networkidle" });
await page.locator("#field-email").fill("admin@veyora.local");
await page.locator("#login-password").fill(process.env.PW);
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL((u) => u.pathname === "/admin", { timeout: 120000 });
await context.storageState({ path: "var/qa/admin-state.json" });

const routes = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["/admin/products", "/admin/products/new", "/admin/inventory", "/admin/inventory?filter=low", "/admin/catalog", "/admin/catalog?tab=brands", "/admin/catalog?tab=collections", "/admin/catalog?tab=tags", "/admin/catalog?tab=attributes", "/admin/customers", "/admin/customers?staff=1", "/admin/discounts", "/admin/reviews", "/admin/messages", "/admin/notifications", "/admin/content", "/admin/content?tab=banners", "/admin/content?tab=menus", "/admin/content/pages", "/admin/content/pages?tab=faq", "/admin/content/pages/new", "/admin/media", "/admin/settings", "/admin/settings?section=commerce", "/admin/settings/shipping", "/admin/settings/staff", "/admin/settings/audit", "/admin/imports"];

for (const route of routes) {
  problems = [];
  const response = await page.goto(base + route, { waitUntil: "networkidle", timeout: 180000 }).catch((e) => ({ status: () => "ERR " + e.message.slice(0, 80) }));
  const h1 = await page.getByRole("heading", { level: 1 }).first().innerText({ timeout: 60000 }).catch(() => "(no h1)");
  await page.waitForTimeout(300);
  const name = route.replace(/[/?=&]+/g, "_").replace(/^_admin_?/, "") || "root";
  await page.screenshot({ path: `var/qa/sweep-${name}.png`, caret: "initial", fullPage: true });
  console.log(`${response.status()}  ${route.padEnd(36)} ${h1.replace(/\s+/g, " ").slice(0, 50)}${problems.length ? "\n    ⚠ " + [...new Set(problems)].join("\n    ⚠ ") : ""}`);
}
await browser.close();
