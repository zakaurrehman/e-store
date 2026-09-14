import { expect, test } from "@playwright/test";
import { ADMIN_STATE, toast, unique } from "./helpers";

test.use({ storageState: ADMIN_STATE });

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

    const shopperContext = await browser.newContext({ storageState: undefined });
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

  test("order management: staff move an order to its next status", async ({ page }) => {
    await page.goto("/admin/orders");
    await page.getByRole("link", { name: /VY-/ }).first().click();
    await page.waitForURL(/\/admin\/orders\/[a-z0-9]+$/);
    await page.getByRole("button", { name: "Update status" }).click();
    await page.locator("#next-status").selectOption({ index: 1 });
    await page.getByRole("dialog").filter({ visible: true }).getByRole("button", { name: "Update" }).click();
    await expect(page.getByText("Order status updated.").first()).toBeVisible();
  });
});
