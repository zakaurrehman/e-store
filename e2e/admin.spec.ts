import { expect, test } from "@playwright/test";
import { addToBag, ADMIN_STATE, fillCheckout, orderNumberOn, PLATFORM_URL, STORE_URL, toast, unique } from "./helpers";

test.use({ storageState: ADMIN_STATE, baseURL: PLATFORM_URL });

test.describe.serial("admin operations", () => {
  const stamp = unique().toUpperCase();
  const name = `E2E Canvas Tote ${stamp}`;
  const sku = `E2E-${stamp}`;
  let productUrl = "";
  let slug = "";

  test("product create: a new active product is saved from the editor", async ({ page }) => {
    await page.goto("/admin/products/new");
    await page.locator("#p-name:visible").fill(name);
    await page.locator("#p-short:visible").fill("A sturdy canvas tote created by the end-to-end suite.");
    await page.getByLabel("SKU").filter({ visible: true }).first().fill(sku);
    await page.getByLabel("Price", { exact: true }).filter({ visible: true }).first().fill("58.00");
    await page.getByLabel("Stock", { exact: true }).filter({ visible: true }).first().fill("12");
    await page.locator("#p-status:visible").selectOption("ACTIVE");
    await page.getByRole("button", { name: "Create product" }).click();

    await page.waitForURL(/\/admin\/products\/(?!new)[a-z0-9]+$/);
    productUrl = page.url();
    slug = await page.locator("#p-slug:visible").inputValue();
    expect(slug).toContain("e2e-canvas-tote");
  });

  test("product edit: a price change is saved and shown on the storefront", async ({ page, browser }) => {
    await page.goto(productUrl);
    await page.getByLabel("Price", { exact: true }).filter({ visible: true }).first().fill("64.00");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(toast(page, /saved/i)).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Price", { exact: true }).filter({ visible: true }).first()).toHaveValue("64.00");

    const shopperContext = await browser.newContext({ storageState: undefined, baseURL: STORE_URL });
    const shopper = await shopperContext.newPage();
    await shopper.goto(`/p/${slug}`);
    await expect(shopper.getByRole("heading", { level: 1 })).toHaveText(name);
    await expect(shopper.locator("main")).toContainText("$64.00");
    await shopperContext.close();
  });

  test("inventory update: a stock adjustment is recorded in the ledger", async ({ page }) => {
    await page.goto(`/admin/inventory?q=${sku}`);
    await page.getByRole("button", { name: /Adjust stock for/ }).first().click();
    await page.locator("#stock-qty:visible").fill("7");
    await page.locator("#stock-note:visible").fill("E2E cycle count");
    await page.getByRole("dialog").filter({ visible: true }).getByRole("button", { name: "Save" }).click();
    await expect(toast(page, "Stock updated")).toBeVisible();

    await page.getByRole("link", { name: "Ledger" }).first().click();
    await expect(page.getByRole("heading", { name: "Inventory ledger" })).toBeVisible();
    await expect(page.getByText("E2E cycle count").first()).toBeVisible();
    await expect(page.getByText("→ 7").first()).toBeVisible();
  });

  test("order management: a paid order waits to be accepted; accepting it starts processing, and the tracker records it", async ({ page, browser }) => {
    // A customer pays in Zendropship's own demo store — the one store whose orders staff accept.
    const shopper = await browser.newContext({ baseURL: STORE_URL, storageState: { cookies: [], origins: [] } });
    const shop = await shopper.newPage();
    await addToBag(shop, "amber-wood-wick-candle");
    await fillCheckout(shop, `e2e.accept.${stamp.toLowerCase()}@example.com`);
    await shop.getByRole("button", { name: "Continue to payment" }).click();
    await shop.waitForURL(/\/checkout\/sandbox\//);
    await shop.getByRole("button", { name: /^Pay \$/ }).click();
    await shop.waitForURL(/\/checkout\/confirmation\//);
    const orderNumber = await orderNumberOn(shop);
    await shopper.close();

    // Paid, and still waiting: a payment never accepts an order by itself.
    await page.goto(`/admin/orders?q=${orderNumber}`);
    const row = page.locator("tbody tr", { hasText: orderNumber });
    await expect(row).toContainText("Confirmed");
    await expect(row).toContainText("Next: Accepted");
    await page.getByRole("link", { name: orderNumber }).click();
    await page.waitForURL(/\/admin\/orders\/[a-z0-9]+$/);
    await page.getByRole("button", { name: "Accept for fulfilment" }).click();
    await page.getByRole("dialog").filter({ visible: true }).getByRole("button", { name: "Accept for fulfilment" }).click();
    await expect(toast(page, /Order accepted/)).toBeVisible();

    await page.reload();
    const tracker = page.locator("section").filter({ has: page.getByRole("heading", { name: "Fulfilment", exact: true }) }).first();
    await expect(tracker.getByText("Accepted").first()).toBeVisible();
    await expect(tracker.getByText("Processing").first()).toBeVisible();
    await expect(tracker.getByText("Store Owner").first()).toBeVisible();
    // The next step is offered, and the step just taken is not repeated.
    await expect(page.getByRole("button", { name: "Mark packed" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Accept for fulfilment" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Start processing" })).toHaveCount(0);
  });
});
