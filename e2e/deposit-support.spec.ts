import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import sharp from "sharp";
import { ADMIN_STATE, PLATFORM_URL, toast, unique } from "./helpers";
import { clearRateLimits } from "./rate-limits";

/**
 * The chain a real deposit goes through, and the conversation that usually follows it: the owner sends
 * money and uploads the proof, staff read the proof and credit what actually arrived, the owner's balance
 * and history show it straight away, and the two of them then talk it over in one thread.
 */
test.describe.serial("deposit, then support", () => {
  const stamp = unique();
  const storeName = `Deposit Studio ${stamp}`;
  const ownerEmail = `e2e.deposit.${stamp}@example.com`;
  const password = "Correct-horse-battery-7";
  const reference = `WIRE-${stamp}`;
  const subject = `About my deposit ${stamp}`;
  const DECLARED = "60.00";
  const ARRIVED = "55.00";

  let ownerContext: BrowserContext;
  let owner: Page;
  let adminContext: BrowserContext;
  let admin: Page;
  let invitationCode = "";

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

  test("an invited owner opens a store", async () => {
    await admin.goto("/admin/referrals");
    await admin.getByLabel("Label").fill(`Deposit E2E ${stamp}`);
    await admin.getByRole("button", { name: "Generate" }).click();
    const message = toast(admin, /Invitation ZD-[0-9A-Z]{8} is ready/);
    await expect(message).toBeVisible();
    invitationCode = /ZD-[0-9A-Z]{8}/.exec(await message.innerText())![0];

    await owner.goto("/start");
    await owner.getByLabel("Store name").fill(storeName);
    await owner.getByLabel("First name").fill("Nadia");
    await owner.getByLabel("Last name").fill("Owner");
    await owner.getByLabel("Email address").fill(ownerEmail);
    await owner.locator("#start-password").fill(password);
    await owner.locator("#referral-code").fill(invitationCode);
    await expect(owner.getByText("Invitation accepted.")).toBeVisible();
    await owner.getByRole("button", { name: "Create my store" }).click();
    await owner.waitForURL(/\/dashboard\?welcome=1/);
  });

  test("the owner sends money and uploads the screenshot as proof", async () => {
    const screenshot = await sharp({ create: { width: 600, height: 400, channels: 4, background: { r: 28, g: 120, b: 90, alpha: 1 } } })
      .png()
      .toBuffer();

    await owner.goto("/dashboard/balance");
    await expect(owner.getByText("$0.00").first()).toBeVisible();
    await owner.getByRole("button", { name: "Deposit" }).first().click();
    const dialog = owner.getByRole("dialog");
    await dialog.locator("#field-amount").fill(DECLARED);
    await dialog.locator("#field-reference").fill(reference);
    const [chooser] = await Promise.all([owner.waitForEvent("filechooser"), dialog.getByRole("button", { name: /Upload screenshot/ }).click()]);
    await chooser.setFiles({ name: "transfer.png", mimeType: "image/png", buffer: screenshot });
    await dialog.getByRole("button", { name: "Record deposit" }).click();
    await expect(toast(owner, new RegExp(`Deposit of \\$${DECLARED.replace(".", "\\.")} recorded`))).toBeVisible();

    // It is only a claim until staff check it: nothing is credited yet.
    await owner.reload();
    await expect(owner.getByText(reference)).toBeVisible();
    await expect(owner.getByText("Waiting for confirmation", { exact: true }).first()).toBeVisible();
  });

  test("staff read the proof and credit the amount that actually arrived", async () => {
    await admin.goto(`/admin/deposits?q=${reference}`);
    const row = admin.locator("tbody tr", { hasText: reference });
    // Who sent it, how to reach them, and what they attached — all in the row.
    await expect(row).toContainText(storeName);
    await expect(row).toContainText(ownerEmail);
    await expect(row).toContainText("$60.00");
    await expect(row).toContainText("Pending");
    await expect(row.getByRole("button", { name: /open full size/ })).toBeVisible();

    await row.getByRole("button", { name: "Review" }).click();
    const review = admin.getByRole("dialog").filter({ visible: true });
    await expect(review.getByRole("img", { name: "Deposit proof" })).toBeVisible();
    // The bank shows less than was declared, so that is what gets credited.
    await review.locator("#deposit-amount").fill(ARRIVED);
    await expect(review.getByRole("button", { name: `Approve & credit $${ARRIVED}` })).toBeVisible();
    await review.getByRole("button", { name: /Approve & credit/ }).click();
    await expect(toast(admin, new RegExp(`\\$${ARRIVED.replace(".", "\\.")} credited`))).toBeVisible();

    await admin.goto(`/admin/deposits?q=${reference}`);
    await expect(admin.locator("tbody tr", { hasText: reference })).toContainText("Approved");
    await expect(admin.locator("tbody tr", { hasText: reference })).toContainText(`$${ARRIVED} credited`);
  });

  test("the owner's balance and history show the credit straight away", async () => {
    await owner.goto("/dashboard/balance");
    await expect(owner.getByText(`$${ARRIVED}`).first()).toBeVisible();
    // The ledger carries the movement, not just a number that changed.
    await expect(owner.getByText("Deposit received").first()).toBeVisible();
    await expect(owner.getByText("Credited", { exact: true }).first()).toBeVisible();
    await expect(owner.getByText(reference)).toBeVisible();

    // And the same figure on the dashboard overview.
    await owner.goto("/dashboard");
    await expect(owner.getByText(`$${ARRIVED}`).first()).toBeVisible();
  });

  test("an owner who opens the admin lands in their own dashboard, not a dead end", async () => {
    await owner.goto("/admin");
    await owner.waitForURL(/\/dashboard/);
    await expect(owner.getByRole("heading", { name: /Welcome/ })).toBeVisible();
    // Nothing from the admin renders on the way.
    await expect(owner.getByRole("link", { name: "Deposit requests" })).toHaveCount(0);
  });

  test("staff see the whole picture on the store's page", async () => {
    await admin.goto(`/admin/stores?q=${encodeURIComponent(storeName)}`);
    await admin.getByRole("link", { name: storeName, exact: true }).click();
    await admin.waitForURL(/\/admin\/stores\/[a-z0-9]+/);
    await expect(admin.getByText(ownerEmail).first()).toBeVisible();
    await expect(admin.getByText(`$${ARRIVED} credited`).first()).toBeVisible();
    await expect(admin.getByText("Deposit received").first()).toBeVisible();
    await expect(admin.getByRole("heading", { name: "Support conversations" })).toBeVisible();
    await expect(admin.getByRole("button", { name: "Send password reset" })).toBeVisible();
  });

  test("the owner asks about it from the floating button, and the two of them talk in one thread", async () => {
    await owner.goto("/dashboard");
    await owner.getByRole("button", { name: /Customer Service/i }).click();
    await owner.locator("#widget-message").fill(`${subject}\nYou credited $55 but I sent $60 — can you check?`);
    await owner.getByRole("button", { name: "Send message" }).click();
    // Sending opens the thread it just created.
    await expect(owner.getByText("You credited $55 but I sent $60")).toBeVisible();

    // It reaches the support inbox as an ordinary conversation, and staff answer there.
    await admin.goto(`/admin/messages?q=${encodeURIComponent(subject)}`);
    await admin.getByRole("link", { name: new RegExp(subject) }).click();
    await expect(admin.getByText("Written to Zendropship")).toBeVisible();
    await admin.getByLabel(/Reply to Nadia/).fill("The bank received $55 after their transfer fee — that is what we credited.");
    await admin.getByRole("button", { name: "Send", exact: true }).click();
    await expect(toast(admin, /Reply sent/)).toBeVisible();

    // The owner is told there is something new and reads it in the same thread.
    await owner.reload();
    await expect(owner.getByRole("button", { name: /Customer Service/i }).getByText("1")).toBeVisible();
    await owner.getByRole("button", { name: /Customer Service/i }).click();
    await owner.getByRole("button", { name: new RegExp(subject) }).click();
    await expect(owner.getByText("after their transfer fee")).toBeVisible();
    await expect(owner.getByText("You credited $55 but I sent $60")).toBeVisible();

    // And carries on in it.
    await owner.locator("#widget-reply").fill("Understood — thank you for checking.");
    await owner.getByRole("button", { name: "Send reply" }).click();
    await expect(owner.getByText("Understood — thank you for checking.")).toBeVisible();
    await admin.reload();
    await expect(admin.getByText("Understood — thank you for checking.")).toBeVisible();

    // The same conversation is listed on the store's page in the admin.
    await admin.goto(`/admin/stores?q=${encodeURIComponent(storeName)}`);
    await admin.getByRole("link", { name: storeName, exact: true }).click();
    await expect(admin.getByText(subject)).toBeVisible();
  });
});
