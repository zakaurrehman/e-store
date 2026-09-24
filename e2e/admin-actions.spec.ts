import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { addToBag, ADMIN_STATE, fillCheckout, orderNumberOn, PLATFORM_URL, STORE_URL, toast, unique } from "./helpers";
import { clearRateLimits } from "./rate-limits";

/**
 * The three things staff do that have to work without anyone reloading anything: put money into an
 * owner's wallet, answer a conversation while the other side is looking at it, and take an order that is
 * still waiting for its payment and move it on.
 */
test.describe.serial("what staff do", () => {
  const stamp = unique();
  const storeName = `Action Studio ${stamp}`;
  const ownerEmail = `e2e.actions.${stamp}@example.com`;
  const password = "Correct-horse-battery-7";
  const subject = `Live reply ${stamp}`;

  let ownerContext: BrowserContext;
  let owner: Page;
  let adminContext: BrowserContext;
  let admin: Page;

  test.beforeAll(async ({ browser }) => {
    await clearRateLimits();
    ownerContext = await browser.newContext({ baseURL: PLATFORM_URL });
    owner = await ownerContext.newPage();
    adminContext = await browser.newContext({ storageState: ADMIN_STATE, baseURL: PLATFORM_URL });
    admin = await adminContext.newPage();
  });

  test.afterAll(async () => {
    await ownerContext.close();
    await adminContext.close();
  });

  const openStorePage = async () => {
    await admin.goto(`/admin/stores?q=${encodeURIComponent(storeName)}`);
    await admin.getByRole("link", { name: storeName, exact: true }).click();
    await admin.waitForURL(/\/admin\/stores\/[a-z0-9]+/);
  };

  test("an invited owner opens a store", async () => {
    await admin.goto("/admin/referrals");
    await admin.getByLabel("Label").fill(`Actions ${stamp}`);
    await admin.getByRole("button", { name: "Generate" }).click();
    const message = toast(admin, /Invitation ZD-[0-9A-Z]{8} is ready/);
    await expect(message).toBeVisible();
    const code = /ZD-[0-9A-Z]{8}/.exec(await message.innerText())![0];

    await owner.goto("/start");
    await owner.getByLabel("Store name").fill(storeName);
    await owner.getByLabel("First name").fill("Ada");
    await owner.getByLabel("Last name").fill("Owner");
    await owner.getByLabel("Email address").fill(ownerEmail);
    await owner.locator("#start-password").fill(password);
    await owner.locator("#referral-code").fill(code);
    await expect(owner.getByText("Invitation accepted.")).toBeVisible();
    await owner.getByRole("button", { name: "Create my store" }).click();
    await owner.waitForURL(/\/dashboard\?welcome=1/);
  });

  test("staff put money into the owner's wallet from the store's page", async () => {
    await openStorePage();
    await admin.getByRole("button", { name: "Add money" }).click();
    const dialog = admin.getByRole("dialog").filter({ visible: true });
    await dialog.locator("#credit-amount").fill("75.00");
    await dialog.locator("#credit-reference").fill(`STAFF-${stamp}`);
    await dialog.locator("#credit-reason").fill("Bank transfer arrived without a record");
    // The button says exactly what will be credited.
    await expect(dialog.getByRole("button", { name: "Credit $75.00" })).toBeVisible();
    await dialog.getByRole("button", { name: "Credit $75.00" }).click();
    await expect(toast(admin, /\$75\.00 credited to/)).toBeVisible();

    // It is on the ledger, not written over a balance.
    await admin.reload();
    await expect(admin.getByText("Deposit received").first()).toBeVisible();
    await expect(admin.getByText(`STAFF-${stamp}`).first()).toBeVisible();

    // And the owner sees it on their own money screens.
    await owner.goto("/dashboard/balance");
    await expect(owner.getByText("$75.00").first()).toBeVisible();
    await expect(owner.getByText("Credited", { exact: true }).first()).toBeVisible();
    await expect(owner.getByText(`STAFF-${stamp}`)).toBeVisible();
  });

  test("a staff reply reaches the owner's open thread without them reloading it", async () => {
    await owner.goto("/dashboard/support/tickets/new");
    await owner.getByLabel("Subject").fill(subject);
    await owner.locator("#ticket-message").fill("Is the money you added available to withdraw?");
    await owner.getByRole("button", { name: "Send to Zendropship" }).click();
    await owner.waitForURL(/\/dashboard\/support\/tickets\/[a-z0-9]+\?sent=1/);
    const threadUrl = owner.url();

    // Staff answer from the inbox while the owner sits on the thread.
    await admin.goto(`/admin/messages?q=${encodeURIComponent(subject)}`);
    await admin.getByRole("link", { name: new RegExp(subject) }).click();
    await admin.getByLabel(/Reply to Ada/).fill("Yes — it is available straight away.");
    await admin.getByRole("button", { name: "Send", exact: true }).click();
    await expect(toast(admin, /Reply sent/)).toBeVisible();

    // The owner is looking at the thread — a tab in the background stops asking, by design.
    await owner.bringToFront();
    // No reload, no click: the page fetches the reply and shows it.
    expect(owner.url()).toBe(threadUrl);
    await expect(owner.getByText("it is available straight away")).toBeVisible({ timeout: 30000 });
    expect(owner.url()).toBe(threadUrl);
  });

  test("and the owner's reply reaches the open inbox the same way", async () => {
    const inboxUrl = admin.url();
    await owner.bringToFront();
    await owner.locator("#ticket-reply").fill("Thank you, that is clear.");
    await owner.getByRole("button", { name: "Send reply" }).click();
    await expect(toast(owner, /Message sent to Zendropship/)).toBeVisible();

    await admin.bringToFront();
    expect(admin.url()).toBe(inboxUrl);
    await expect(admin.getByText("Thank you, that is clear.")).toBeVisible({ timeout: 30000 });
  });

  test("a customer's open conversation in a store gets the reply the same way", async ({ browser }) => {
    const shopperContext = await browser.newContext({ baseURL: STORE_URL });
    const shopper = await shopperContext.newPage();
    await shopper.goto("/register");
    await shopper.locator("#field-firstName").fill("Cleo");
    await shopper.locator("#field-lastName").fill("Shopper");
    await shopper.locator("#field-email").fill(`e2e.live.${stamp}@example.com`);
    await shopper.locator("#register-password").fill("Zendropship-E2E-2026!");
    await shopper.getByRole("button", { name: "Create account" }).click();
    await shopper.waitForURL(/\/account/);

    const question = `Live store reply ${stamp}`;
    await shopper.goto("/support/new");
    await shopper.getByLabel("Subject").fill(question);
    await shopper.locator("#support-message").fill("Can I change the colour before it ships?");
    await shopper.getByRole("button", { name: "Send message" }).click();
    await shopper.waitForURL(/\/support\/[a-z0-9]+\?sent=1/);
    const threadUrl = shopper.url();

    await admin.bringToFront();
    await admin.goto(`/admin/messages?q=${encodeURIComponent(question)}`);
    await admin.getByRole("link", { name: new RegExp(question) }).click();
    await admin.getByLabel(/Reply to Cleo/).fill("Yes — tell us the colour and we will swap it.");
    await admin.getByRole("button", { name: "Send", exact: true }).click();
    await expect(toast(admin, /Reply sent/)).toBeVisible();

    await shopper.bringToFront();
    await expect(shopper.getByText("tell us the colour and we will swap it")).toBeVisible({ timeout: 30000 });
    expect(shopper.url()).toBe(threadUrl);
    await shopperContext.close();
  });

  test("an order still waiting for payment can be confirmed from the queue, then walked to delivered", async ({ browser }) => {
    // A card that never paid leaves the order awaiting payment — the case staff have to sort out.
    const shopper = await browser.newContext({ baseURL: STORE_URL });
    const page = await shopper.newPage();
    await addToBag(page, "matte-porcelain-mug-set");
    await fillCheckout(page, `e2e.unpaid.${stamp}@example.com`);
    await page.getByRole("button", { name: "Continue to payment" }).click();
    await page.waitForURL(/\/checkout\/sandbox\//);
    await page.getByRole("button", { name: /declined/ }).click();
    await page.waitForURL(/\/checkout\/confirmation\//);
    const orderNumber = await orderNumberOn(page);
    await shopper.close();

    await admin.goto(`/admin/orders?q=${orderNumber}`);
    const row = admin.locator("tbody tr", { hasText: orderNumber });
    await expect(row).toContainText("Awaiting payment");

    // One button, where the order is, that says what it does.
    await row.getByRole("button", { name: "Confirm payment" }).first().click();
    await admin.getByRole("dialog").filter({ visible: true }).getByRole("button", { name: "Confirm payment" }).click();
    await expect(toast(admin, /paid|confirmed/i)).toBeVisible();

    // Paying for it confirms it, and nothing more: it waits to be accepted. This is Zendropship's own demo
    // store, so accepting is staff's to do (in an owner's store it is the owner's alone).
    const row0 = admin.locator("tbody tr", { hasText: orderNumber });
    await admin.goto(`/admin/orders?q=${orderNumber}`);
    await expect(row0).toContainText("Confirmed");
    await expect(row0).toContainText("Next: Accepted");

    // From there the ladder runs to delivered, one step at a time. Each button is the one visible at this
    // width (the row carries a second copy for phones), and each step is checked by what the row says next.
    // Accepting puts it straight into processing, so packing is what follows.
    const ladder: Array<[button: string, after: string, confirms: boolean]> = [
      ["Accept", "Next: Packed", true],
      ["Packed", "Next: Shipped", false],
      ["Shipped", "Next: Out for delivery", true],
      ["Out for delivery", "Next: Delivered", false],
      ["Delivered", "Fulfilment complete", true],
    ];
    for (const [label, after, confirms] of ladder) {
      await admin.goto(`/admin/orders?q=${orderNumber}`);
      const row = admin.locator("tbody tr", { hasText: orderNumber });
      await row.getByRole("button", { name: label, exact: true }).filter({ visible: true }).click();
      if (confirms) {
        const dialog = admin.getByRole("dialog").filter({ visible: true });
        await dialog.getByRole("button", { name: /^(Mark |Accept for fulfilment)/ }).click();
      }
      await expect(row, `after "${label}"`).toContainText(after);
    }

    // Nothing is left to press once it has arrived, and it cannot be walked backwards.
    await admin.goto(`/admin/orders?q=${orderNumber}`);
    const done = admin.locator("tbody tr", { hasText: orderNumber });
    await expect(done).toContainText("Complete");
    await expect(done.getByRole("button")).toHaveCount(0);
  });
});
