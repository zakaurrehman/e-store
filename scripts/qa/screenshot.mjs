/**
 * Visual QA helper: captures screenshots and reports console errors, failed requests and broken images.
 *   node scripts/qa/screenshot.mjs --out var/qa --base http://localhost:3000 --mobile /,/c/women
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const base = flag("base", "http://localhost:3000");
const out = path.resolve(flag("out", "var/qa"));
const full = args.includes("--full");
const mobile = args.includes("--mobile");
const paths = (args.find((arg) => arg.startsWith("/")) ?? "/").split(",");

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext(
  mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148" }
    : { viewport: { width: 1440, height: 900 } },
);

for (const route of paths) {
  const page = await context.newPage();
  const problems = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") problems.push(`console.${message.type()}: ${message.text().slice(0, 300)}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message.slice(0, 300)}`));
  page.on("requestfailed", (request) => problems.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`));
  page.on("response", (response) => {
    if (response.status() >= 400) problems.push(`http ${response.status()}: ${response.url()}`);
  });
  const started = Date.now();
  const response = await page.goto(base + route, { waitUntil: "networkidle", timeout: 120_000 });
  if (full) {
    // Scroll through the page so lazy-loaded images render before a full-page capture.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 700) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForLoadState("networkidle");
  }
  await page.waitForTimeout(600);
  const broken = await page.evaluate(() =>
    Array.from(document.images)
      .filter((img) => img.complete && img.naturalWidth === 0 && img.loading !== "lazy")
      .map((img) => img.currentSrc || img.src),
  );
  broken.forEach((src) => problems.push(`broken image: ${src}`));
  const name = `${mobile ? "m" : "d"}-${route.replace(/[^a-z0-9]+/gi, "_") || "home"}.png`;
  await page.screenshot({ path: path.join(out, name), fullPage: full, caret: "initial" });
  console.log(`${route} → ${response?.status()} in ${Date.now() - started}ms → ${name}`);
  problems.forEach((problem) => console.log(`   ⚠ ${problem}`));
  await page.close();
}
await browser.close();
