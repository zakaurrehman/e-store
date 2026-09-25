import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { ADMIN_STATE, PLATFORM_URL, storeUrlFor, toast, unique } from "./helpers";
import { clearRateLimits } from "./rate-limits";

/**
 * Opening several stores in a row, and deleting one. Rate limits are cleared once, before the first store,
 * and never again: the openings must all go through on their own, one after another from the same network.
 */
test.describe.serial("opening and deleting stores", () => {
  const stamp = unique();
  const label = `Batch ${stamp}`;
  const password = "Correct-horse-battery-7";
  const stores: Array<{ name: string; slug: string; email: string; owner: Page }> = [];
  let codes: string[] = [];
  let adminContext: BrowserContext;
  let admin: Page;

  test.beforeAll(async ({ browser }) => {
    await clearRateLimits();
    adminContext = await browser.newContext({ storageState: ADMIN_STATE, baseURL: PLATFORM_URL });
    admin = await adminContext.newPage();
  });

  test.afterAll(async () => {
    await adminContext.close();
  });

  test("staff generate four invitation codes at once", async () => {
    await admin.goto("/admin/referrals");
    await admin.getByLabel("Label").fill(label);
    await admin.locator("#ref-count").fill("4");
    await admin.getByRole("button", { name: "Generate" }).click();
    await expect(toast(admin, /4 invitation codes are ready/)).toBeVisible();
    await admin.goto(`/admin/referrals?q=${encodeURIComponent(label)}`);
    await expect(admin.locator("tbody tr")).toHaveCount(4);
    codes = (await admin.locator("tbody tr").allInnerTexts()).map((row) => /ZD-[0-9A-Z]{8}/.exec(row)![0]);
    expect(new Set(codes).size).toBe(4);
  });

  test("four invited owners open their stores one after another — nobody is told to wait", async ({ browser }) => {
    for (const [index, code] of codes.entries()) {
      const context = await browser.newContext({ baseURL: PLATFORM_URL });
      const owner = await context.newPage();
      const name = `Batch Store ${stamp} ${index + 1}`;
      const email = `e2e.batch.${index + 1}.${stamp}@example.com`;
      await owner.goto("/start");
      await owner.getByLabel("Store name").fill(name);
      await expect(owner.getByText(/is available$/)).toBeVisible();
      const slug = await owner.locator("#store-slug").inputValue();
      await owner.getByLabel("First name").fill("Bea");
      await owner.getByLabel("Last name").fill(`Owner${index + 1}`);
      await owner.getByLabel("Email address").fill(email);
      await owner.locator("#start-password").fill(password);
      await owner.locator("#referral-code").fill(code);
      await expect(owner.getByText("Invitation accepted.")).toBeVisible();
      await owner.getByRole("button", { name: "Create my store" }).click();
      await owner.waitForURL(/\/dashboard\?welcome=1/);
      await expect(owner.getByText(/Too many attempts/)).toHaveCount(0);
      await expect(owner.getByText(`${name} is live`)).toBeVisible();
      stores.push({ name, slug, email, owner });
    }
    expect(stores).toHaveLength(4);

    // Every one of them is open, and the others still work.
    for (const store of stores) {
      const visitor = await browser.newContext();
      const page = await visitor.newPage();
      await page.goto(`${storeUrlFor(store.slug)}/`);
      await expect(page.locator("header").first()).toContainText(store.name);
      await visitor.close();
    }
  });

  test("a store with money in it cannot be deleted, and the dialog says why", async () => {
    const [store] = stores;
    await admin.goto(`/admin/stores?q=${encodeURIComponent(store.name)}`);
    await admin.getByRole("link", { name: store.name, exact: true }).click();
    await admin.waitForURL(/\/admin\/stores\/[a-z0-9]+/);
    await admin.getByRole("button", { name: "Add money" }).click();
    const credit = admin.getByRole("dialog").filter({ visible: true });
    await credit.locator("#credit-amount").fill("12.00");
    await credit.locator("#credit-reason").fill("Test funds before deletion");
    await credit.getByRole("button", { name: "Credit $12.00" }).click();
    await expect(toast(admin, /\$12\.00 credited to/)).toBeVisible();

    await admin.goto(`/admin/stores?q=${encodeURIComponent(store.name)}`);
    await admin.locator("tbody tr", { hasText: store.name }).getByRole("button", { name: "Delete" }).click();
    const dialog = admin.getByRole("dialog").filter({ visible: true });
    await expect(dialog.getByText("This store can’t be deleted yet")).toBeVisible();
    await expect(dialog.getByText(/still has \$12\.00 in their balance/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Delete store permanently" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Back" }).click();
  });

  test("suspending still hides a store, and reopening brings it back", async ({ browser }) => {
    const store = stores[2];
    await admin.goto(`/admin/stores?q=${encodeURIComponent(store.name)}`);
    await admin.locator("tbody tr", { hasText: store.name }).getByRole("button", { name: "Suspend" }).click();
    await admin.getByRole("dialog").filter({ visible: true }).getByRole("button", { name: "Suspend store" }).click();
    await expect(toast(admin, /is suspended/)).toBeVisible();
    const visitor = await browser.newContext();
    const page = await visitor.newPage();
    await expect(async () => {
      await page.goto(`${storeUrlFor(store.slug)}/`);
      await expect(page.getByRole("heading", { name: /can.t find that page/ })).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 60000 });
    await admin.reload();
    await admin.locator("tbody tr", { hasText: store.name }).getByRole("button", { name: "Reopen" }).click();
    await expect(toast(admin, /is open again/)).toBeVisible();
    await expect(async () => {
      await page.goto(`${storeUrlFor(store.slug)}/`);
      await expect(page.locator("header").first()).toContainText(store.name, { timeout: 5000 });
    }).toPass({ timeout: 60000 });
    await visitor.close();
  });

  test("deleting a store takes a typed confirmation, then it is gone for everyone", async ({ browser }) => {
    const store = stores[3];
    await admin.goto(`/admin/stores?q=${encodeURIComponent(store.name)}`);
    await admin.locator("tbody tr", { hasText: store.name }).getByRole("button", { name: "Delete" }).click();
    const dialog = admin.getByRole("dialog").filter({ visible: true });
    await expect(dialog.getByRole("heading", { name: `Delete ${store.name} permanently?` })).toBeVisible();
    await expect(dialog.getByText("This cannot be undone.")).toBeVisible();
    await expect(dialog.getByText("Removed for good")).toBeVisible();
    await expect(dialog.getByText("Kept for the records")).toBeVisible();

    // One click is never enough: the button waits for the store's address, typed exactly.
    const confirm = dialog.getByRole("button", { name: "Delete store permanently" });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel(/Type .* to confirm/).fill(`${store.slug}x`);
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel(/Type .* to confirm/).fill(store.slug);
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(toast(admin, new RegExp(`${store.name} has been deleted`))).toBeVisible();

    // Gone from Admin → Stores…
    await admin.goto(`/admin/stores?q=${encodeURIComponent(store.name)}`);
    await expect(admin.locator("tbody tr", { hasText: store.name })).toHaveCount(0);
    // …from its address…
    const visitor = await browser.newContext();
    const page = await visitor.newPage();
    await expect(async () => {
      await page.goto(`${storeUrlFor(store.slug)}/`);
      await expect(page.getByRole("heading", { name: /can.t find that page/ })).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 60000 });
    await visitor.close();
    // …and from its owner, who is sent to open a store instead of reaching the old dashboard.
    await store.owner.goto("/dashboard");
    await store.owner.waitForURL(/\/start/);

    // The other stores carry on as before.
    const other = stores[1];
    const shopper = await browser.newContext();
    const shop = await shopper.newPage();
    await shop.goto(`${storeUrlFor(other.slug)}/`);
    await expect(shop.locator("header").first()).toContainText(other.name);
    await shopper.close();
    await admin.goto(`/admin/stores?q=${encodeURIComponent(other.name)}`);
    await expect(admin.locator("tbody tr", { hasText: other.name })).toContainText("Open");
  });

  test.afterAll(async () => {
    for (const store of stores) await store.owner.context().close();
  });
});
