/**
 * Registered-customer journey: register → verify email (from var/mail) → wishlist → order → account pages → logout.
 *   node scripts/qa/account-flow.mjs --base http://localhost:3456 --out var/qa
 */
import { chromium } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const base = flag("base", "http://localhost:3456");
const out = path.resolve(flag("out", "var/qa"));
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = [];
page.on("console", (message) => {
  if (message.type() === "error") problems.push(`console.error: ${message.text().slice(0, 500)}`);
});
page.on("pageerror", (error) => problems.push(`pageerror: ${error.message.slice(0, 300)}`));
page.on("response", (response) => {
  if (response.status() >= 500) problems.push(`http ${response.status()}: ${response.url()}`);
});
const shot = (name) => page.screenshot({ path: path.join(out, `d-account-${name}.png`), caret: "initial" });
const step = (label) => console.log(`→ ${label}`);
const email = `qa.customer.${Date.now()}@example.com`;
const password = "Veyora-QA-2026!";

async function latestMail(predicate) {
  const lines = (await readFile(path.resolve("var/mail/mailbox.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  return lines.reverse().find(predicate);
}

try {
  step("add to bag as guest, then register (cart should merge)");
  await page.goto(`${base}/p/harness-leather-belt`, { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: "M" }).check({ force: true });
  await page.getByRole("button", { name: "Add to bag" }).first().click();
  await page.getByRole("dialog").getByText("Your bag").waitFor();

  await page.goto(`${base}/register`, { waitUntil: "networkidle" });
  await page.locator("#field-firstName").fill("Ava");
  await page.locator("#field-lastName").fill("Customer");
  await page.locator("#field-email").fill(email);
  await page.locator("#register-password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/account/, { timeout: 60_000 });
  await page.waitForLoadState("networkidle");
  await shot("1-overview");
  console.log("   registered, bag badge:", await page.locator("header button[aria-label^='Open bag']").getAttribute("aria-label"));

  step("verify email from log mailbox");
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const welcome = await latestMail((mail) => mail.to === email && /Welcome/.test(mail.subject));
  const verifyLink = welcome?.links.find((link) => link.includes("/verify-email"));
  console.log("   welcome email:", welcome?.subject, "| verify link:", verifyLink ? "yes" : "NO");
  await page.goto(verifyLink, { waitUntil: "networkidle" });
  console.log("   verify heading:", await page.getByRole("heading", { level: 1 }).innerText());

  step("wishlist toggle");
  await page.goto(`${base}/c/jewellery`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Save .* to wishlist/ }).first().click();
  await page.getByText(/Saved .* to your wishlist/).waitFor();
  await page.goto(`${base}/account/wishlist`, { waitUntil: "networkidle" });
  console.log("   wishlist items:", await page.locator("article").count());
  await shot("2-wishlist");

  step("addresses: add one");
  await page.goto(`${base}/account/addresses`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Add address" }).first().click();
  await page.locator("#addr-firstName").fill("Ava");
  await page.locator("#addr-lastName").fill("Customer");
  await page.locator("#addr-line1").fill("12 Harbour Lane");
  await page.locator("#addr-city").fill("Seattle");
  await page.locator("#addr-region").fill("WA");
  await page.locator("#addr-postalCode").fill("98101");
  await page.getByRole("dialog").getByRole("button", { name: "Add address" }).click();
  await page.getByText("12 Harbour Lane").waitFor();
  await shot("3-addresses");

  step("checkout with saved address + COD");
  await page.goto(`${base}/checkout`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Continue to delivery" }).click();
  await page.getByRole("radio", { name: /Standard/ }).waitFor();
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await page.getByRole("radio", { name: /Cash on delivery/ }).check({ force: true });
  await page.getByRole("button", { name: "Review order" }).click();
  await page.getByRole("button", { name: "Place order" }).click();
  await page.waitForURL(/\/checkout\/confirmation\//, { timeout: 60_000 });
  await page.waitForLoadState("networkidle");
  console.log("   COD heading:", await page.getByRole("heading", { level: 1 }).innerText());
  await shot("4-cod-confirmation");

  step("account orders + detail");
  await page.goto(`${base}/account/orders`, { waitUntil: "networkidle" });
  await shot("5-orders");
  await page.getByRole("link", { name: "View order" }).first().click();
  await page.waitForURL(/\/account\/orders\/VY-/, { timeout: 60_000 });
  await page.waitForLoadState("networkidle");
  await shot("6-order-detail");

  step("profile + security + notifications + reviews + recently viewed");
  await page.goto(`${base}/account/profile`, { waitUntil: "networkidle" });
  await page.locator("#profile-phone").fill("+1 206 555 0100");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText("Profile updated.").waitFor();
  await page.goto(`${base}/account/security`, { waitUntil: "networkidle" });
  await page.locator("#current-password").fill(password);
  await page.locator("#new-password").fill(`${password}x`);
  await page.locator("#confirm-password").fill(`${password}x`);
  await page.getByRole("button", { name: "Update password" }).click();
  await page.getByText(/Password updated/).waitFor();
  await page.goto(`${base}/account/notifications`, { waitUntil: "networkidle" });
  console.log("   notifications:", await page.locator("li").filter({ hasText: /Order VY-/ }).count());
  await shot("7-notifications");
  await page.goto(`${base}/account/reviews`, { waitUntil: "networkidle" });
  await shot("8-reviews");
  await page.goto(`${base}/account/recently-viewed`, { waitUntil: "networkidle" });
  console.log("   recently viewed:", await page.locator("article").count());

  step("static pages");
  for (const route of ["/pages/returns", "/faq", "/contact?order=VY-TEST", "/brands", "/brands/orovia", "/collections/sale", "/shop?view=list", "/does-not-exist"]) {
    const response = await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
    console.log(`   ${route} → ${response?.status()} "${(await page.title()).slice(0, 50)}"`);
  }
  await shot("9-404");
  const sitemap = await page.goto(`${base}/sitemap.xml`);
  console.log("   sitemap:", sitemap?.status(), (await sitemap?.text())?.match(/<url>/g)?.length, "urls");
  const robots = await page.goto(`${base}/robots.txt`);
  console.log("   robots:", robots?.status());

  step("logout");
  await page.goto(`${base}/account`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(`${base}/`, { timeout: 60_000 });
  const account = await page.goto(`${base}/account`, { waitUntil: "networkidle" });
  console.log("   after logout /account →", page.url().replace(base, ""), account?.status());

  step("login with new password + forgot password email");
  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  await page.locator("#field-email").fill(email);
  await page.locator("#login-password").fill(`${password}x`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/account/, { timeout: 60_000 });
  console.log("   login ok:", page.url().replace(base, ""));
  await page.goto(`${base}/forgot-password`, { waitUntil: "networkidle" });
  await page.locator("#field-email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await page.getByText(/we've sent a link/).waitFor();
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const reset = await latestMail((mail) => mail.to === email && /Reset/.test(mail.subject));
  console.log("   reset email:", reset?.subject, "| link:", reset?.links.find((link) => link.includes("/reset-password")) ? "yes" : "NO");
} catch (error) {
  console.error("FLOW FAILED:", error.message);
  await shot("error");
} finally {
  problems.forEach((problem) => console.log(`   ⚠ ${problem}`));
  await browser.close();
}
