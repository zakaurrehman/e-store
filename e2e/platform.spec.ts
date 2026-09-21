import { expect, test, type Browser, type Page } from "@playwright/test";
import { ADMIN_STATE, fillCheckout, orderNumberOn, pathOf, PLATFORM_URL, storeUrlFor, STORE_URL, toast, unique, waitForMail } from "./helpers";

/**
 * The dropshipping platform end to end: a visitor opens a store from the catalogue, stocks it, prices it,
 * a shopper buys in that store, the order reaches the owner's dashboard and the platform admin.
 */
test.describe.serial("dropshipping platform", () => {
  const stamp = unique();
  const storeName = `E2E Studio ${stamp}`;
  const ownerEmail = `e2e.owner.${stamp}@example.com`;
  const password = "Correct-horse-battery-7";
  const FIRST_PRODUCT = "amber-wood-wick-candle";
  const SECOND_PRODUCT = "heavyweight-organic-tee";
  let owner: Page;
  let slug = "";
  let storeUrl = "";
  let orderNumber = "";
  let storePrice = "";

  test.beforeAll(async ({ browser }) => {
    owner = await (await browser.newContext({ baseURL: PLATFORM_URL })).newPage();
  });

  test("landing and catalogue: visitors see the offer and every product's cost, price and margin before signing up", async () => {
    await owner.goto("/");
    await expect(owner.getByRole("heading", { level: 1 })).toContainText("Build your online store");
    await owner.goto(`/catalog/p/${FIRST_PRODUCT}`);
    await expect(owner.getByText("You pay").first()).toBeVisible();
    await expect(owner.getByText("You earn").first()).toBeVisible();
  });

  test("open a store: choosing a product first, then signing up, opens the store with that product on its shelf", async () => {
    await owner.getByRole("link", { name: "Add to my store" }).first().click();
    await owner.waitForURL(/\/start\?add=/);
    await owner.getByLabel("Store name").fill(storeName);
    await expect(owner.getByText(/is available$/)).toBeVisible();
    slug = await owner.locator("#store-slug").inputValue();
    expect(slug).toMatch(/^e2e-studio-/);
    await owner.getByLabel("First name").fill("Erin");
    await owner.getByLabel("Last name").fill("Owner");
    await owner.getByLabel("Email address").fill(ownerEmail);
    await owner.locator("#start-password").fill(password);
    await owner.getByRole("button", { name: "Create my store" }).click();
    await owner.waitForURL(/\/dashboard\?welcome=1/);
    await expect(owner.getByText(`${storeName} is live`)).toBeVisible();
    storeUrl = storeUrlFor(slug);

    await owner.goto("/dashboard/products");
    await expect(owner.locator("tbody tr")).toHaveCount(1);
  });

  test("add products and set a markup: the store shows only its products, at the owner's prices", async () => {
    await owner.goto(`/catalog/p/${SECOND_PRODUCT}`);
    await owner.getByRole("button", { name: "Add to my store" }).first().click();
    await expect(toast(owner, "Added to your store.")).toBeVisible();

    await owner.goto("/dashboard/pricing");
    await owner.getByText("My own markup").click();
    await owner.getByLabel("Markup (%)").fill("50");
    await owner.getByRole("button", { name: "Save pricing" }).click();
    await expect(toast(owner, /Pricing saved/)).toBeVisible();

    await owner.goto("/dashboard/products");
    const row = owner.locator("tbody tr", { hasText: "Amber" });
    storePrice = (await row.locator("td").nth(2).innerText()).trim();
    expect(storePrice).toMatch(/^\$\d+\.\d9$/);

    const shopper = await owner.context().browser()!.newContext({ baseURL: storeUrl });
    const page = await shopper.newPage();
    await page.goto("/shop");
    await expect(page.getByText("2 products")).toBeVisible();
    await expect(page.locator("header")).toContainText(storeName, { ignoreCase: true });
    await page.goto(`/p/${FIRST_PRODUCT}`);
    await expect(page.locator("main")).toContainText(storePrice);
    // A catalogue product this store does not sell is not reachable here.
    await page.goto("/p/harness-leather-belt");
    await expect(notFound(page)).toBeVisible();
    await shopper.close();
  });

  test("a shopper buys in the owner's store: the order confirms and the emails carry the store's name and address", async ({ browser }) => {
    const shopper = await browser.newContext({ baseURL: storeUrl });
    const page = await shopper.newPage();
    const email = `e2e.buyer.${stamp}@example.com`;
    await page.goto(`/p/${FIRST_PRODUCT}`);
    await page.getByRole("button", { name: "Add to bag" }).first().click();
    const bag = page.getByRole("dialog");
    await expect(bag.getByText("Your bag (1)")).toBeVisible();
    // Three units, so the owner's margin clears the minimum withdrawal in the next test.
    await bag.getByRole("button", { name: /Increase quantity/i }).first().click();
    await expect(bag.getByText("Your bag (2)")).toBeVisible();
    await bag.getByRole("button", { name: /Increase quantity/i }).first().click();
    await expect(bag.getByText("Your bag (3)")).toBeVisible();
    await fillCheckout(page, email);
    await page.getByRole("button", { name: "Continue to payment" }).click();
    await page.waitForURL(/\/checkout\/sandbox\//);
    expect(new URL(page.url()).host).toBe(new URL(storeUrl).host);
    await page.getByRole("button", { name: /^Pay \$/ }).click();
    await page.waitForURL(/\/checkout\/confirmation\//);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Thank you — your order is confirmed");
    orderNumber = await orderNumberOn(page);

    const confirmation = await waitForMail((mail) => mail.to === email && /confirmed|Payment received/i.test(mail.subject));
    expect(confirmation.text).toContain(storeName);
    expect(confirmation.links.some((link) => link.startsWith(storeUrl))).toBe(true);
    const ownerAlert = await waitForMail((mail) => mail.to === ownerEmail && mail.subject.includes("New order"));
    expect(ownerAlert.links.some((link) => pathOf(link).startsWith("/dashboard/orders/"))).toBe(true);
    await shopper.close();
  });

  test("the owner sees the order, its fulfilment status and their margin", async () => {
    await owner.goto("/dashboard/orders");
    await owner.getByRole("link", { name: orderNumber }).click();
    await expect(owner.getByRole("heading", { level: 1 })).toHaveText(`Order ${orderNumber}`);
    await expect(owner.getByText(/You don.t need to do anything to ship this order/)).toBeVisible();
    await expect(owner.getByText("Your margin", { exact: true })).toBeVisible();
    await owner.goto("/dashboard");
    await expect(owner.getByText("Orders").first()).toBeVisible();
  });

  test("the balance shows the margin earned, and a withdrawal is held then paid", async ({ browser }) => {
    await owner.goto("/dashboard/balance");
    const balance = owner.locator("p", { hasText: /^\$\d/ }).first();
    await expect(balance).toBeVisible();
    const earned = (await balance.innerText()).trim();
    expect(earned).not.toBe("$0.00");
    // The order's earning is listed in the ledger and counted in today's earnings.
    await expect(owner.getByText(`Earnings from order ${orderNumber}`)).toBeVisible();
    await expect(owner.getByRole("cell", { name: "Today" }).or(owner.getByText("Today", { exact: true })).first()).toBeVisible();

    await owner.getByRole("button", { name: "Withdraw" }).first().click();
    const dialog = owner.getByRole("dialog");
    await dialog.getByLabel("Amount (USD)").fill("20");
    await dialog.getByText("PayPal", { exact: true }).click();
    await dialog.getByLabel("PayPal email address").fill(ownerEmail);
    await dialog.getByRole("button", { name: "Request withdrawal" }).click();
    await expect(toast(owner, /Withdrawal of \$20.00 requested/)).toBeVisible();
    await expect(owner.getByText("Being sent").first()).toBeVisible();

    // Staff send the money and mark it paid; the amount stays out of the balance.
    const adminContext = await browser.newContext({ storageState: ADMIN_STATE, baseURL: PLATFORM_URL });
    const admin = await adminContext.newPage();
    await admin.goto("/admin/payouts");
    const row = admin.locator("tbody tr", { hasText: storeName }).first();
    await expect(row).toContainText("$20.00");
    await row.getByRole("button", { name: "Mark paid" }).click();
    await admin.getByRole("dialog").filter({ visible: true }).getByRole("button", { name: "Mark as paid" }).click();
    await expect(toast(admin, /marked as paid/)).toBeVisible();
    await adminContext.close();

    await owner.reload();
    await expect(owner.getByText("Paid").first()).toBeVisible();
    await expect(owner.getByText("Withdrawal", { exact: true }).first()).toBeVisible();
  });

  test("customer service: a message from the store reaches the owner, who replies by email", async ({ browser }) => {
    const shopper = await browser.newContext({ baseURL: storeUrl });
    const page = await shopper.newPage();
    const customerEmail = `e2e.support.${stamp}@example.com`;
    await page.goto("/contact");
    await page.locator("#field-name").fill("Sam Shopper");
    await page.locator("#field-email").fill(customerEmail);
    await page.locator("#field-subject").fill(`Where is my parcel ${stamp}`);
    await page.locator("#contact-message").fill("Hello, I ordered yesterday and would like to know when it ships. Thank you!");
    await page.getByRole("button", { name: /Send/ }).click();
    await expect(page.getByText(/we.ve received your message/i).first()).toBeVisible();
    await shopper.close();

    await owner.goto("/dashboard/support");
    await owner.getByRole("link", { name: new RegExp(`Where is my parcel ${stamp}`) }).click();
    await expect(owner.getByText("I ordered yesterday")).toBeVisible();
    await owner.getByLabel(/Reply to Sam/).fill("Hi Sam — your parcel leaves our warehouse today and you'll get tracking by email.");
    await owner.getByRole("button", { name: "Send reply" }).click();
    await expect(toast(owner, /Reply sent/)).toBeVisible();
    await expect(owner.getByText(/your parcel leaves our warehouse today/)).toBeVisible();

    const reply = await waitForMail((mail) => mail.to === customerEmail && mail.subject.startsWith("Re: Where is my parcel"));
    expect(reply.text).toContain("leaves our warehouse today");
    expect(reply.text).toContain(storeName);
  });

  test("stores are separate: the demo store's bag and orders never show in the owner's store", async ({ browser }) => {
    const shopper = await browser.newContext({ baseURL: STORE_URL });
    const page = await shopper.newPage();
    await page.goto(`/p/${FIRST_PRODUCT}`);
    await page.getByRole("button", { name: "Add to bag" }).first().click();
    await expect(page.getByRole("dialog").getByText("Your bag")).toBeVisible();
    await page.goto(`${storeUrl}/cart`);
    await expect(page.getByText(/Your bag is empty/i).first()).toBeVisible();
    await shopper.close();
  });

  test("admin: the new store is listed with its owner and can be suspended and reopened", async ({ browser }) => {
    await suspendAndReopen(browser, storeName, storeUrl);
  });
});

/** Streamed pages keep a 200 status (with a noindex tag), so the not-found page is recognised by its heading. */
const notFound = (page: Page) => page.getByRole("heading", { name: /can.t find that page/ });

async function suspendAndReopen(browser: Browser, storeName: string, storeUrl: string) {
  const adminContext = await browser.newContext({ storageState: ADMIN_STATE, baseURL: PLATFORM_URL });
  const admin = await adminContext.newPage();
  await admin.goto(`/admin/stores?q=${encodeURIComponent(storeName)}`);
  const row = admin.locator("tbody tr", { hasText: storeName });
  await expect(row).toContainText("Open");
  await row.getByRole("button", { name: "Suspend" }).click();
  await admin.getByRole("dialog").filter({ visible: true }).getByRole("button", { name: "Suspend store" }).click();
  await expect(toast(admin, /is suspended/)).toBeVisible();

  const visitor = await browser.newContext();
  const page = await visitor.newPage();
  await page.goto(`${storeUrl}/`);
  await expect(notFound(page)).toBeVisible();

  await admin.reload();
  await admin.locator("tbody tr", { hasText: storeName }).getByRole("button", { name: "Reopen" }).click();
  await expect(toast(admin, /is open again/)).toBeVisible();
  await page.goto(`${storeUrl}/`);
  await expect(page.locator("header")).toContainText(storeName, { ignoreCase: true });
  await visitor.close();
  await adminContext.close();
}
