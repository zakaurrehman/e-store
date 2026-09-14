/**
 * Drives the guest purchase journey in a real browser and reports problems.
 *   node scripts/qa/flow.mjs --base http://localhost:3456 --out var/qa [--mobile]
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const base = flag("base", "http://localhost:3456");
const out = path.resolve(flag("out", "var/qa"));
const mobile = args.includes("--mobile");
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const problems = [];
page.on("console", (message) => {
  if (message.type() === "error") problems.push(`console.error: ${message.text().slice(0, /hydrat/i.test(message.text()) ? 6000 : 400)}`);
});
page.on("pageerror", (error) => problems.push(`pageerror: ${error.message.slice(0, 300)}`));
page.on("response", (response) => {
  if (response.status() >= 500) problems.push(`http ${response.status()}: ${response.url()}`);
});
// caret: "initial" avoids Playwright injecting inline caret styles (which would show up as false hydration mismatches).
const shot = (name) => page.screenshot({ path: path.join(out, `${mobile ? "m" : "d"}-flow-${name}.png`), caret: "initial" });
const step = (label) => console.log(`→ ${label}`);

try {
  step("open product");
  await page.goto(`${base}/p/heavyweight-organic-tee`, { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: "M" }).check({ force: true });
  await page.getByRole("button", { name: "Add to bag" }).first().click();
  await page.getByRole("dialog").getByText("Your bag").waitFor();
  await shot("1-drawer");

  step("open second product, quick add");
  await page.goto(`${base}/p/amber-wood-wick-candle`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Add to bag" }).first().click();
  await page.getByRole("dialog").getByText("Your bag").waitFor();

  step("cart page");
  await page.goto(`${base}/cart`, { waitUntil: "networkidle" });
  await page.getByText("Order summary").waitFor();
  await shot("2-cart");
  const summaryText = await page.locator("aside[aria-label='Order summary']").innerText();
  console.log("   subtotal line:", summaryText.split("\n").find((line) => line.startsWith("Subtotal")));

  step("checkout");
  await page.goto(`${base}/checkout`, { waitUntil: "networkidle" });
  await page.locator("#field-email").fill("qa.guest@example.com");
  await page.getByRole("button", { name: "Continue to shipping" }).click();
  await page.locator("#ship-firstName").fill("Quinn");
  await page.locator("#ship-lastName").fill("Tester");
  await page.locator("#ship-line1").fill("500 Market Street");
  await page.locator("#ship-city").fill("San Francisco");
  await page.locator("#ship-region").fill("CA");
  await page.locator("#ship-postalCode").fill("94105");
  await page.getByRole("button", { name: "Continue to delivery" }).click();
  await page.getByRole("radio", { name: /Standard/ }).waitFor();
  await shot("3-delivery");
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await page.getByRole("radio", { name: /Test card/ }).check({ force: true });
  await page.getByRole("button", { name: "Review order" }).click();
  await shot("4-review");
  const totalText = await page.locator("aside[aria-label='Order summary']").innerText().catch(() => "");
  console.log("   totals:", totalText.split("\n").filter((line) => /Subtotal|Shipping|Tax|Total/.test(line)).join(" | "));
  await page.getByRole("button", { name: "Continue to payment" }).click();

  step("sandbox payment");
  await page.waitForURL(/\/checkout\/sandbox\//, { timeout: 60_000 });
  await shot("5-sandbox");
  await page.getByRole("button", { name: /^Pay \$/ }).click();

  step("confirmation");
  await page.waitForURL(/\/checkout\/confirmation\//, { timeout: 60_000 });
  await page.waitForLoadState("networkidle");
  await shot("6-confirmation");
  const heading = await page.getByRole("heading", { level: 1 }).innerText();
  const orderNumber = (await page.locator("text=/VY-[A-Z2-9]{4}-[A-Z2-9]{4}/").first().innerText()).match(/VY-[A-Z2-9]{4}-[A-Z2-9]{4}/)?.[0];
  console.log("   heading:", heading, "| order:", orderNumber);
  console.log("   payment status badge:", await page.locator("aside section").first().innerText().then((t) => t.split("\n").slice(-2).join(" ")));

  step("failed payment path");
  await page.goto(`${base}/p/matte-porcelain-mug-set`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Add to bag" }).first().click();
  await page.getByRole("dialog").getByText("Your bag").waitFor();
  await page.goto(`${base}/checkout`, { waitUntil: "networkidle" });
  await page.locator("#field-email").fill("qa.guest@example.com");
  await page.getByRole("button", { name: "Continue to shipping" }).click();
  await page.locator("#ship-firstName").fill("Quinn");
  await page.locator("#ship-lastName").fill("Tester");
  await page.locator("#ship-line1").fill("500 Market Street");
  await page.locator("#ship-city").fill("San Francisco");
  await page.locator("#ship-region").fill("CA");
  await page.locator("#ship-postalCode").fill("94105");
  await page.getByRole("button", { name: "Continue to delivery" }).click();
  await page.getByRole("radio", { name: /Standard/ }).waitFor();
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await page.getByRole("radio", { name: /Test card/ }).check({ force: true });
  await page.getByRole("button", { name: "Review order" }).click();
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await page.waitForURL(/\/checkout\/sandbox\//, { timeout: 60_000 });
  await page.getByRole("button", { name: /declined/ }).click();
  await page.waitForURL(/\/checkout\/confirmation\//, { timeout: 60_000 });
  await page.waitForLoadState("networkidle");
  await shot("7-failed");
  console.log("   failed heading:", await page.getByRole("heading", { level: 1 }).innerText());
  console.log("   retry button present:", await page.getByRole("button", { name: "Complete payment" }).count());

  step("COD order");
  await page.getByRole("button", { name: "Complete payment" }).click();
  await page.waitForURL(/\/checkout\/sandbox\//, { timeout: 60_000 });
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await page.waitForURL(/\/checkout\/confirmation\//, { timeout: 60_000 });
  console.log("   retry → heading:", await page.getByRole("heading", { level: 1 }).innerText());

  step("track order (guest lookup)");
  await page.goto(`${base}/track-order`, { waitUntil: "networkidle" });
  await page.getByLabel("Order number").fill(orderNumber ?? "");
  await page.getByLabel("Email address used at checkout").fill("qa.guest@example.com");
  await page.getByRole("button", { name: "Track order" }).click();
  await page.waitForURL(/\/orders\//, { timeout: 60_000 });
  await page.waitForLoadState("networkidle");
  await shot("8-track");
  console.log("   track heading:", await page.getByRole("heading", { level: 1 }).innerText());
} catch (error) {
  console.error("FLOW FAILED:", error.message);
  await shot("error");
} finally {
  problems.forEach((problem) => console.log(`   ⚠ ${problem}`));
  await browser.close();
}
