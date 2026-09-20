import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

export const ADMIN_STATE = "e2e/.auth/admin.json";

/** The platform site (marketing, catalogue, owner dashboard, admin). */
export const PLATFORM_URL = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3456").replace(/\/$/, "");

/** A store's own address: <slug>.<platform host>, e.g. http://demo.localhost:3456. */
export function storeUrlFor(slug: string) {
  const url = new URL(PLATFORM_URL);
  return `${url.protocol}//${slug}.${url.host.replace(/^www\./, "")}`;
}

/** The platform-run demo store, where the storefront specs shop. */
export const STORE_URL = storeUrlFor("demo");

export const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const SHIPPING = { firstName: "Quinn", lastName: "Tester", line1: "500 Market Street", city: "San Francisco", region: "CA", postalCode: "94105" };

/** Adds a seeded product to the bag from its product page and waits for the bag drawer. */
export async function addToBag(page: Page, slug: string, option?: string) {
  await page.goto(`/p/${slug}`);
  if (option) await page.getByRole("radio", { name: option }).check({ force: true });
  await page.getByRole("button", { name: "Add to bag" }).first().click();
  await expect(page.getByRole("dialog").getByText("Your bag")).toBeVisible();
}

/** Fills contact, shipping, delivery and payment (sandbox test card) and stops at the review step. */
export async function fillCheckout(page: Page, email: string) {
  await page.goto("/checkout");
  await page.locator("#field-email").fill(email);
  await page.getByRole("button", { name: "Continue to shipping" }).click();
  for (const [field, value] of Object.entries(SHIPPING)) await page.locator(`#ship-${field}`).fill(value);
  await page.getByRole("button", { name: "Continue to delivery" }).click();
  await expect(page.getByRole("radio", { name: /Standard/ }).first()).toBeAttached();
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await page.getByRole("radio", { name: /Test card/ }).check({ force: true });
  await page.getByRole("button", { name: "Review order" }).click();
}

export async function orderNumberOn(page: Page) {
  const text = await page.locator("text=/VY-[A-Z2-9]{4}-[A-Z2-9]{4}/").first().innerText();
  const number = text.match(/VY-[A-Z2-9]{4}-[A-Z2-9]{4}/)?.[0];
  if (!number) throw new Error("No order number on the page");
  return number;
}

export type Mail = { to: string; subject: string; links: string[]; text?: string };

/** Reads the development mailbox written by EMAIL_DRIVER=log. */
export async function waitForMail(predicate: (mail: Mail) => boolean, timeoutMs = 30_000): Promise<Mail> {
  const file = path.resolve("var/mail/mailbox.jsonl");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const text = await readFile(file, "utf8").catch(() => "");
    const found = text
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Mail)
      .reverse()
      .find(predicate);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Expected email not found in var/mail/mailbox.jsonl — the server under test must use EMAIL_DRIVER=log.");
}

export const pathOf = (link: string) => {
  const url = new URL(link);
  return url.pathname + url.search;
};

/** Toasts render as role="status" (errors as role="alert"). */
export const toast = (page: Page, text: string | RegExp) => page.getByRole("status").filter({ hasText: text }).first();
