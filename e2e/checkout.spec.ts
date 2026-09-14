import { expect, test } from "@playwright/test";
import { ADMIN_STATE, addToBag, fillCheckout, orderNumberOn, toast, unique } from "./helpers";

test.describe("checkout, payment and orders", () => {
  test("checkout: a guest pays with the sandbox card, gets a confirmed order and can track it", async ({ page }) => {
    const email = `e2e.guest.${unique()}@example.com`;
    await addToBag(page, "amber-wood-wick-candle");
    await fillCheckout(page, email);
    await expect(page.getByLabel("Order summary")).toContainText("Total");

    // Payment: the order is only confirmed after the gateway's signed webhook.
    await page.getByRole("button", { name: "Continue to payment" }).click();
    await page.waitForURL(/\/checkout\/sandbox\//);
    await page.getByRole("button", { name: /^Pay \$/ }).click();

    // Order creation
    await page.waitForURL(/\/checkout\/confirmation\//);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Thank you — your order is confirmed");
    const number = await orderNumberOn(page);

    // Order tracking
    await page.goto("/track-order");
    await page.getByLabel("Order number").fill(number);
    await page.getByLabel("Email address used at checkout").fill(email);
    await page.getByRole("button", { name: "Track order" }).click();
    await page.waitForURL(/\/orders\//);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Order ${number}`);
  });

  test("payment: a declined card leaves the order unpaid and the customer can retry", async ({ page }) => {
    await addToBag(page, "matte-porcelain-mug-set");
    await fillCheckout(page, `e2e.declined.${unique()}@example.com`);
    await page.getByRole("button", { name: "Continue to payment" }).click();
    await page.waitForURL(/\/checkout\/sandbox\//);
    await page.getByRole("button", { name: /declined/ }).click();

    await page.waitForURL(/\/checkout\/confirmation\//);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Almost there");
    await page.getByRole("button", { name: "Complete payment" }).click();
    await page.waitForURL(/\/checkout\/sandbox\//);
    await page.getByRole("button", { name: /^Pay \$/ }).click();
    await page.waitForURL(/\/checkout\/confirmation\//);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Thank you — your order is confirmed");
  });

  test("coupon: a code created in the admin takes 10% off the bag", async ({ browser }) => {
    const code = `E2E${unique().toUpperCase()}`;
    const adminContext = await browser.newContext({ storageState: ADMIN_STATE });
    const admin = await adminContext.newPage();
    await admin.goto("/admin/discounts");
    await admin.getByRole("button", { name: "New coupon" }).click();
    await admin.locator("#code:visible").fill(code);
    await admin.locator("#value:visible").fill("10");
    await admin.getByRole("dialog").filter({ visible: true }).getByRole("button", { name: "Create coupon" }).click();
    await expect(toast(admin, "Coupon created.")).toBeVisible();
    await adminContext.close();

    const shopperContext = await browser.newContext();
    const shopper = await shopperContext.newPage();
    await addToBag(shopper, "amber-wood-wick-candle");
    await shopper.goto("/cart");
    await shopper.getByRole("button", { name: "Add a promo code" }).click();
    await shopper.locator("#coupon-code").fill(code);
    await shopper.getByRole("button", { name: "Apply" }).click();

    const summary = shopper.getByLabel("Order summary");
    await expect(summary).toContainText(code);
    await expect(summary).toContainText("Discount");
    const text = await summary.innerText();
    const subtotal = Number(text.match(/Subtotal[^$]*\$([\d,.]+)/)?.[1].replace(/,/g, ""));
    const discount = Number(text.match(/Discount\s*[−-]\$([\d,.]+)/)?.[1].replace(/,/g, ""));
    expect(discount).toBeCloseTo(subtotal * 0.1, 2);
    await shopperContext.close();
  });
});
