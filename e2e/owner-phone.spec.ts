import { devices, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { ADMIN_STATE, PLATFORM_URL, toast, TRC20_ADDRESS, unique } from "./helpers";
import { clearRateLimits } from "./rate-limits";

// A phone, emulated in the suite's own browser: touch, a 390px screen and a mobile user agent.
const { defaultBrowserType: _browser, ...iPhone } = devices["iPhone 13"];

/**
 * A store owner on their phone. The profile page puts the store, the money and the ways to get help in
 * one place; the floating customer-service button opens a chat that fits the screen, takes a message and
 * shows Zendropship's answer as it arrives.
 */
test.describe.serial("the owner's profile and customer service on a phone", () => {
  const stamp = unique();
  const storeName = `Phone Studio ${stamp}`;
  const ownerEmail = `e2e.phone.${stamp}@example.com`;
  const password = "Correct-horse-battery-7";
  const question = `Phone question ${stamp}`;

  let phoneContext: BrowserContext;
  let phone: Page;
  let adminContext: BrowserContext;
  let admin: Page;

  test.beforeAll(async ({ browser }) => {
    await clearRateLimits();
    phoneContext = await browser.newContext({ ...iPhone, baseURL: PLATFORM_URL });
    phone = await phoneContext.newPage();
    adminContext = await browser.newContext({ storageState: ADMIN_STATE, baseURL: PLATFORM_URL });
    admin = await adminContext.newPage();
  });

  test.afterAll(async () => {
    await phoneContext.close();
    await adminContext.close();
  });

  const launcher = () => phone.getByRole("button", { name: /Customer Service/i });
  const noSideways = () => phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  test("an invited owner opens a store from their phone, and staff add money to it", async () => {
    await admin.goto("/admin/referrals");
    await admin.getByLabel("Label").fill(`Phone ${stamp}`);
    await admin.getByRole("button", { name: "Generate" }).click();
    const message = toast(admin, /Invitation ZD-[0-9A-Z]{8} is ready/);
    await expect(message).toBeVisible();
    const code = /ZD-[0-9A-Z]{8}/.exec(await message.innerText())![0];

    await phone.goto("/start");
    await phone.getByLabel("Store name").fill(storeName);
    await phone.getByLabel("First name").fill("Pia");
    await phone.getByLabel("Last name").fill("Owner");
    await phone.getByLabel("Email address").fill(ownerEmail);
    await phone.locator("#start-password").fill(password);
    await phone.locator("#referral-code").fill(code);
    await expect(phone.getByText("Invitation accepted.")).toBeVisible();
    await phone.getByRole("button", { name: "Create my store" }).tap();
    await phone.waitForURL(/\/dashboard\?welcome=1/);

    // Staff publish the Binance TRC20 address, and put $75 into the new store's wallet.
    await admin.goto("/admin/settings?section=deposits");
    await admin.locator("#deposits-trc20Address").fill(TRC20_ADDRESS);
    await admin.getByRole("button", { name: "Save settings" }).click();
    await expect(toast(admin, /saved/i)).toBeVisible();
    await admin.goto(`/admin/stores?q=${encodeURIComponent(storeName)}`);
    await admin.getByRole("link", { name: storeName, exact: true }).click();
    await admin.getByRole("button", { name: "Add money" }).click();
    const dialog = admin.getByRole("dialog").filter({ visible: true });
    await dialog.locator("#credit-amount").fill("75.00");
    await dialog.locator("#credit-reference").fill(`PHONE-${stamp}`);
    await dialog.locator("#credit-reason").fill("Test funds for the phone check");
    await dialog.getByRole("button", { name: "Credit $75.00" }).click();
    await expect(toast(admin, /\$75\.00 credited to/)).toBeVisible();
  });

  test("Profile is in the owner's menu and shows the store, the email, the balance and what to do next", async () => {
    await phone.goto("/dashboard");
    await phone.getByRole("button", { name: "Open menu" }).tap();
    await phone.getByRole("navigation", { name: "Store dashboard" }).getByRole("link", { name: "Profile" }).tap();
    await phone.waitForURL(/\/dashboard\/profile$/);

    await expect(phone.getByRole("heading", { name: "Profile", level: 1 })).toBeVisible();
    const main = phone.locator("main");
    await expect(main.getByText(storeName, { exact: true })).toBeVisible();
    await expect(main.getByText(ownerEmail, { exact: true })).toBeVisible();
    await expect(main.getByText("$75.00").first()).toBeVisible();
    await expect(main.getByRole("button", { name: "Deposit" })).toBeEnabled();
    await expect(main.getByRole("button", { name: "Withdraw" })).toBeEnabled();
    await expect(main.getByRole("link", { name: /Customer service/ })).toHaveAttribute("href", "/dashboard/support");
    await expect(main.getByRole("link", { name: /Balance & history/ })).toBeVisible();
    await expect(main.getByRole("button", { name: "Sign out" })).toBeVisible();
    expect(await noSideways()).toBe(true);
  });

  test("from the profile, a deposit shows the whole Binance TRC20 address, and a withdrawal is TRC20 only", async () => {
    await phone.goto("/dashboard/profile");
    await phone.locator("main").getByRole("button", { name: "Deposit" }).tap();
    const deposit = phone.getByRole("dialog").filter({ visible: true });
    await expect(deposit.getByRole("radio", { name: /Binance · USDT \(TRC20\)/ })).toBeChecked();
    const address = deposit.getByText(TRC20_ADDRESS, { exact: true });
    await expect(address).toBeVisible();
    // All 34 characters on screen, none cut off, and a way to copy them.
    expect(await address.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    const box = await address.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(iPhone.viewport.width);
    await expect(deposit.getByRole("button", { name: /Copy/ })).toBeVisible();
    await expect(deposit.getByText("TRON (TRC20)")).toBeVisible();
    await expect(deposit.getByLabel("Transaction id (TxID)")).toBeVisible();
    await phone.keyboard.press("Escape");

    await phone.locator("main").getByRole("button", { name: "Withdraw" }).tap();
    const withdraw = phone.getByRole("dialog").filter({ visible: true });
    await expect(withdraw.getByText("USDT (TRC20) · TRON network")).toBeVisible();
    await expect(withdraw.getByLabel("Your TRC20 wallet address")).toBeVisible();
    await expect(withdraw.getByText("PayPal")).toHaveCount(0);
    await phone.keyboard.press("Escape");
  });

  test("the Customer Service button opens a chat that works on a phone, and Zendropship's reply arrives without a refresh", async () => {
    await phone.goto("/dashboard/profile");
    await launcher().tap();
    const panel = phone.getByRole("dialog").filter({ visible: true });
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(iPhone.viewport.width + 1);
    // 16px or more, so Safari does not zoom the page in when the field is tapped.
    const size = await phone.locator("#widget-message").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(16);

    await phone.locator("#widget-message").tap();
    await phone.locator("#widget-message").fill(`${question}\nSent from my phone — can you check my last deposit?`);
    await panel.getByRole("button", { name: "Send message" }).tap();
    // Sending opens the thread it just created, in the same panel.
    await expect(panel.getByText("Sent from my phone")).toBeVisible();
    const pageUrl = phone.url();

    await admin.goto(`/admin/messages?q=${encodeURIComponent(question)}`);
    await admin.getByRole("link", { name: new RegExp(question) }).click();
    await admin.getByLabel(/Reply to Pia/).fill("Checked — your deposit is credited. Anything else?");
    await admin.getByRole("button", { name: "Send", exact: true }).click();
    await expect(toast(admin, /Reply sent/)).toBeVisible();

    // No reload and no tap: the open panel fetches the reply and shows it.
    await phone.bringToFront();
    await expect(panel.getByText("your deposit is credited")).toBeVisible({ timeout: 30000 });
    expect(phone.url()).toBe(pageUrl);

    // The owner answers from the panel, and staff see it in the same conversation.
    await phone.locator("#widget-reply").fill("No, that is all — thank you!");
    await panel.getByRole("button", { name: "Send reply" }).tap();
    await expect(panel.getByText("No, that is all — thank you!")).toBeVisible();
    await admin.bringToFront();
    await expect(admin.getByText("No, that is all — thank you!")).toBeVisible({ timeout: 30000 });
  });

  test("Sign out on the profile ends the session", async () => {
    await phone.bringToFront();
    await phone.goto("/dashboard/profile");
    await phone.locator("main").getByRole("button", { name: "Sign out" }).tap();
    await expect(phone).not.toHaveURL(/\/dashboard/);
    await phone.goto("/dashboard/profile");
    await expect(phone).toHaveURL(/\/login/);
  });
});
