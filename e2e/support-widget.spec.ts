import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { addToBag, ADMIN_STATE, PLATFORM_URL, toast, unique } from "./helpers";

/**
 * The floating customer-service button, which every page carries. What it writes must be an ordinary
 * support conversation: staff answer it from the same inbox, and the answer comes back to the panel.
 */
test.describe.serial("customer service widget", () => {
  const stamp = unique();
  const customerEmail = `e2e.widget.${stamp}@example.com`;
  const password = "Zendropship-E2E-2026!";
  const guestSubject = `Do you ship to Dubai ${stamp}`;
  const customerSubject = `Where is my parcel ${stamp}`;

  let context: BrowserContext;
  let page: Page;
  let adminContext: BrowserContext;
  let admin: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    adminContext = await browser.newContext({ storageState: ADMIN_STATE, baseURL: PLATFORM_URL });
    admin = await adminContext.newPage();
  });

  test.afterAll(async () => {
    await context.close();
    await adminContext.close();
  });

  const launcher = (target: Page) => target.getByRole("button", { name: /Customer Service/i });

  test("a visitor who is not signed in writes from the platform site and staff get it in the inbox", async () => {
    await page.goto(`${PLATFORM_URL}/`);
    await launcher(page).click();
    await page.locator("#widget-name").fill("Nadia Visitor");
    await page.locator("#widget-email").fill(`guest.${stamp}@example.com`);
    await page.locator("#widget-message").fill(`${guestSubject}\nI want to know before I open a store.`);
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText(/we have your message/i)).toBeVisible();

    // The first line becomes the subject, so the inbox is searchable without asking for one.
    await admin.goto(`/admin/messages?q=${encodeURIComponent(guestSubject)}`);
    await admin.getByRole("link", { name: new RegExp(guestSubject) }).click();
    await expect(admin.getByText("Written to Zendropship")).toBeVisible();
    await expect(admin.getByText("I want to know before I open a store.")).toBeVisible();
  });

  test("the launcher is on the storefront too, clear of the mobile tab bar", async () => {
    await page.goto("/");
    await expect(launcher(page)).toBeVisible();
    const small = await context.newPage();
    await small.setViewportSize({ width: 390, height: 844 });
    await small.goto("/");
    const button = await launcher(small).boundingBox();
    const tabBar = await small.getByRole("navigation", { name: "Quick navigation" }).boundingBox();
    expect(button).not.toBeNull();
    if (button && tabBar) expect(button.y + button.height).toBeLessThanOrEqual(tabBar.y + 1);
    await small.close();
  });

  test("the call option is the support phone staff configured in settings", async () => {
    const phone = `+971 4 555 0${String(Date.now()).slice(-3)}`;
    await admin.goto("/admin/settings?section=store");
    await admin.locator("#store-supportPhone").fill(phone);
    await admin.getByRole("button", { name: "Save settings" }).click();
    await expect(toast(admin, /saved/i)).toBeVisible();

    await page.goto("/");
    await launcher(page).click();
    const call = page.getByRole("link", { name: new RegExp(`Call \\${phone}`) });
    await expect(call).toBeVisible();
    await expect(call).toHaveAttribute("href", `tel:${phone.replace(/[^\d+]/g, "")}`);
    await page.keyboard.press("Escape");
  });

  test("it clears the sticky buy bar on a product page and stays out of checkout", async () => {
    const small = await context.newPage();
    await small.setViewportSize({ width: 390, height: 844 });
    await addToBag(small, "amber-wood-wick-candle");

    // The buy bar slides in as the page scrolls; the launcher rides above it rather than over it.
    await small.keyboard.press("Escape");
    await small.mouse.wheel(0, 2000);
    await small.waitForTimeout(600);
    const buyBar = await small.locator("div.fixed.inset-x-0.bottom-0").last().boundingBox();
    const button = await launcher(small).boundingBox();
    if (buyBar && button) expect(button.y + button.height).toBeLessThanOrEqual(buyBar.y + 1);

    await small.goto("/checkout");
    await expect(small.getByRole("heading", { name: /Checkout|Contact/ }).first()).toBeVisible();
    await expect(launcher(small)).toHaveCount(0);
    await small.close();
  });

  test("a signed-in customer writes from the storefront, staff reply, and the panel carries the thread both ways", async () => {
    await page.goto("/register");
    await page.locator("#field-firstName").fill("Wren");
    await page.locator("#field-lastName").fill("Shopper");
    await page.locator("#field-email").fill(customerEmail);
    await page.locator("#register-password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/account/);

    // Signed in, the panel asks for nothing but the message.
    await page.goto("/");
    await launcher(page).click();
    await expect(page.locator("#widget-name")).toHaveCount(0);
    await page.locator("#widget-message").fill(`${customerSubject}\nIt was due on Tuesday.`);
    await page.getByRole("button", { name: "Send message" }).click();
    // Sending opens the thread it just created.
    await expect(page.getByText("It was due on Tuesday.")).toBeVisible();

    // Staff answer from the inbox, in the store's conversation.
    await admin.goto(`/admin/messages?q=${encodeURIComponent(customerSubject)}`);
    await admin.getByRole("link", { name: new RegExp(customerSubject) }).click();
    await admin.getByLabel(/Reply to Wren/).fill("It is out for delivery today — sorry about the wait.");
    await admin.getByRole("button", { name: "Send", exact: true }).click();
    await expect(toast(admin, /Reply sent/)).toBeVisible();

    // The customer is told there is something new, reads it in the panel and writes back there.
    await page.reload();
    await expect(launcher(page).getByText("1")).toBeVisible();
    await launcher(page).click();
    await page.getByRole("button", { name: new RegExp(customerSubject) }).click();
    await expect(page.getByText("It is out for delivery today")).toBeVisible();
    await page.locator("#widget-reply").fill("Thank you — I will keep an eye out.");
    await page.getByRole("button", { name: "Send reply" }).click();
    await expect(page.getByText("Thank you — I will keep an eye out.")).toBeVisible();

    // Same conversation on the staff side: one thread, not a new message.
    await admin.reload();
    await expect(admin.getByText("Thank you — I will keep an eye out.")).toBeVisible();

    // And the reply mark is gone now that it has been read.
    await page.reload();
    await expect(launcher(page).getByText("1")).toHaveCount(0);
  });
});
