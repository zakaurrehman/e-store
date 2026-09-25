import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { Client } from "pg";
import { ADMIN_STATE, orderNumberOn, PLATFORM_URL, SHIPPING, storeUrlFor, toast, unique } from "./helpers";
import { clearRateLimits } from "./rate-limits";

/**
 * Store reviews end to end: a customer's order in an owner's store is delivered, the customer rates the
 * store from their order page, staff publish it, the store shows it near the top of its home page, the
 * owner replies and reports it, and staff hide it. Demo reviews are always labelled as such.
 */
test.describe.serial("store reviews", () => {
  const stamp = unique();
  const storeName = `Review Studio ${stamp}`;
  const ownerEmail = `e2e.reviews.${stamp}@example.com`;
  const reviewText = `Arrived in three days, beautifully wrapped — ${stamp}`;
  let adminContext: BrowserContext;
  let admin: Page;
  let owner: Page;
  let storeUrl = "";
  let slug = "";
  let trackingUrl = "";
  let orderNumber = "";

  test.beforeAll(async ({ browser }) => {
    await clearRateLimits();
    adminContext = await browser.newContext({ storageState: ADMIN_STATE, baseURL: PLATFORM_URL });
    admin = await adminContext.newPage();
    owner = await (await browser.newContext({ baseURL: PLATFORM_URL })).newPage();
  });

  test.afterAll(async () => {
    await adminContext.close();
    await owner.context().close();
  });

  test("an invited owner opens a store and stocks it", async () => {
    await admin.goto("/admin/referrals");
    await admin.getByLabel("Label").fill(`Reviews ${stamp}`);
    await admin.getByRole("button", { name: "Generate" }).click();
    const message = toast(admin, /Invitation ZD-[0-9A-Z]{8} is ready/);
    await expect(message).toBeVisible();
    const code = /ZD-[0-9A-Z]{8}/.exec(await message.innerText())![0];

    await owner.goto("/start");
    await owner.getByLabel("Store name").fill(storeName);
    await expect(owner.getByText(/is available$/)).toBeVisible();
    slug = await owner.locator("#store-slug").inputValue();
    await owner.getByLabel("First name").fill("Rhea");
    await owner.getByLabel("Last name").fill("Owner");
    await owner.getByLabel("Email address").fill(ownerEmail);
    await owner.locator("#start-password").fill("Correct-horse-battery-7");
    await owner.locator("#referral-code").fill(code);
    await expect(owner.getByText("Invitation accepted.")).toBeVisible();
    await owner.getByRole("button", { name: "Create my store" }).click();
    await owner.waitForURL(/\/dashboard\?welcome=1/);
    storeUrl = storeUrlFor(slug);

    await owner.goto("/catalog/p/amber-wood-wick-candle");
    await owner.getByRole("button", { name: "Add to my store" }).first().click();
    await expect(toast(owner, "Added to your store.")).toBeVisible();
  });

  test("a customer's order is delivered, and only then can they review the store — once", async ({ browser }) => {
    const shopper = await browser.newContext({ baseURL: storeUrl });
    const page = await shopper.newPage();
    await expect(async () => {
      await page.goto("/p/amber-wood-wick-candle");
      await expect(page.getByRole("button", { name: "Add to bag" }).first()).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 60000 });
    await page.getByRole("button", { name: "Add to bag" }).first().click();
    await expect(page.getByRole("dialog").getByText("Your bag (1)")).toBeVisible();
    await page.goto("/checkout");
    await page.locator("#field-email").fill(`e2e.reviewer.${stamp}@example.com`);
    await page.getByRole("button", { name: "Continue to shipping" }).click();
    for (const [field, value] of Object.entries(SHIPPING)) await page.locator(`#ship-${field}`).fill(value);
    await page.getByRole("button", { name: "Continue to delivery" }).click();
    await expect(page.getByRole("radio", { name: /Standard/ }).first()).toBeAttached();
    await page.getByRole("button", { name: "Continue to payment" }).click();
    await page.getByRole("radio", { name: /Test card/ }).check({ force: true });
    await page.getByRole("button", { name: "Review order" }).click();
    await page.getByRole("button", { name: "Continue to payment" }).click();
    await page.waitForURL(/\/checkout\/sandbox\//);
    await page.getByRole("button", { name: /^Pay \$/ }).click();
    await page.waitForURL(/\/checkout\/confirmation\//);
    orderNumber = await orderNumberOn(page);
    const token = new URL(page.url()).searchParams.get("token")!;
    trackingUrl = `/orders/${orderNumber}?token=${token}`;

    // Paid but not delivered: there is nothing to review yet.
    await page.goto(trackingUrl);
    await expect(page.getByRole("heading", { name: `Order ${orderNumber}` })).toBeVisible();
    await expect(page.getByRole("heading", { name: `Review ${storeName}` })).toHaveCount(0);

    // The owner accepts it, and staff take it to the customer's door.
    await owner.goto(`/dashboard/orders/${orderNumber}`);
    await owner.getByRole("button", { name: "Accept", exact: true }).click();
    await owner.getByRole("dialog").filter({ visible: true }).getByRole("button", { name: "Accept order" }).click();
    await expect(toast(owner, new RegExp(`Order ${orderNumber} accepted`))).toBeVisible();
    await admin.goto(`/admin/orders?q=${orderNumber}`);
    await admin.getByRole("link", { name: orderNumber }).click();
    await admin.waitForURL(/\/admin\/orders\/[a-z0-9]+$/);
    for (const [button, confirm] of [
      ["Mark packed", null],
      ["Mark shipped", "Mark shipped"],
      ["Out for delivery", null],
      ["Mark delivered", "Mark delivered"],
    ] as Array<[string, string | null]>) {
      await admin.getByRole("button", { name: button, exact: true }).first().click();
      if (confirm) await admin.getByRole("dialog").filter({ visible: true }).getByRole("button", { name: confirm }).click();
      await expect(toast(admin, /Order status updated/)).toBeVisible();
      await admin.reload();
    }

    // Delivered: the customer rates the store from the link in their email.
    await page.goto(trackingUrl);
    const panel = page.locator("section").filter({ has: page.getByRole("heading", { name: `Review ${storeName}` }) });
    await expect(panel).toBeVisible();
    // No stars chosen: the server asks for them.
    await panel.getByLabel("Your review").fill(reviewText);
    await panel.getByRole("button", { name: "Post review" }).click();
    await expect(panel.getByText("Choose a star rating.").first()).toBeVisible();
    await panel.locator("label").filter({ hasText: "4 stars" }).click();
    await panel.getByRole("button", { name: "Post review" }).click();
    // The page refreshes into the review they left, waiting to be checked.
    await expect(page.getByRole("heading", { name: "Your review" })).toBeVisible();
    await expect(page.getByText(/it will appear on the store once it has been checked/)).toBeVisible();

    // A refresh shows their review, waiting to be checked, and no way to write a second one.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Your review" })).toBeVisible();
    await expect(page.getByText(reviewText)).toBeVisible();
    await expect(page.getByText(/it will appear on the store once it has been checked/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Post review" })).toHaveCount(0);
    await shopper.close();
  });

  test("staff publish it, and the store shows its rating near the top of its home page", async ({ browser }) => {
    await admin.goto("/admin/store-reviews?status=PENDING");
    const row = admin.locator("li", { hasText: reviewText });
    await expect(row).toContainText(storeName);
    await expect(row).toContainText(orderNumber);
    await row.getByRole("button", { name: "Publish" }).click();
    await expect(toast(admin, "Review published.")).toBeVisible();

    const shopper = await browser.newContext({ baseURL: storeUrl });
    const page = await shopper.newPage();
    await expect(async () => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "What customers say" })).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 60000 });
    const section = page.locator("section#reviews");
    await expect(section.getByText("4.0")).toBeVisible();
    await expect(section.getByText("Based on 1 review")).toBeVisible();
    await expect(section.getByText(reviewText)).toBeVisible();
    await expect(section.getByText("Verified order")).toBeVisible();
    await expect(section.getByText("Demo review")).toHaveCount(0);

    await expect(section.getByRole("link", { name: /Read all 1 review/ })).toHaveAttribute("href", "/reviews");
    await page.goto("/reviews");
    await expect(page.getByRole("heading", { name: "Reviews", level: 1 })).toBeVisible();
    await expect(page.getByText(reviewText)).toBeVisible();
    await shopper.close();
  });

  test("the owner replies in public and reports it; staff hide it and it leaves the store", async ({ browser }) => {
    await owner.goto("/dashboard");
    await owner.getByRole("navigation", { name: "Store dashboard" }).getByRole("link", { name: "Reviews" }).click();
    await owner.waitForURL(/\/dashboard\/reviews/);
    const item = owner.locator("li", { hasText: reviewText });
    await expect(item).toContainText("On your store");
    await item.getByLabel("Your public reply").fill("Thank you so much — enjoy the candle!");
    await item.getByRole("button", { name: "Save reply" }).click();
    await expect(owner.getByText("Your reply is on the review.").first()).toBeVisible();

    const shopper = await browser.newContext({ baseURL: storeUrl });
    const page = await shopper.newPage();
    await expect(async () => {
      await page.goto("/reviews");
      await expect(page.getByText(`Reply from ${storeName}`)).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 60000 });
    await expect(page.getByText("Thank you so much — enjoy the candle!")).toBeVisible();

    // Owners cannot hide a review themselves: they report it, and staff decide.
    await owner.reload();
    await owner.locator("li", { hasText: reviewText }).getByRole("button", { name: "Report" }).click();
    const report = owner.getByRole("dialog").filter({ visible: true });
    await report.getByLabel("What is wrong with it?").fill("Testing the report flow");
    await report.getByRole("button", { name: "Send report" }).click();
    await expect(toast(owner, /Reported/)).toBeVisible();
    await expect(owner.locator("li", { hasText: reviewText })).toContainText("Reported — Zendropship is checking it");

    await admin.goto("/admin/store-reviews?reported=1");
    const row = admin.locator("li", { hasText: reviewText });
    await expect(row).toContainText("Reported by the owner: Testing the report flow");
    await row.getByRole("button", { name: "Hide" }).click();
    await expect(toast(admin, "Review hidden from the store.")).toBeVisible();

    await expect(async () => {
      await page.goto("/reviews");
      await expect(page.getByText(/No reviews yet/)).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 60000 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "What customers say" })).toHaveCount(0);
    await shopper.close();
  });

  test("a demo review is labelled as demo data wherever it appears", async ({ browser }) => {
    // Demo reviews come from the seed; one is written straight into this store for the check.
    const db = new Client({ connectionString: process.env.DATABASE_URL });
    const url = new URL(process.env.DATABASE_URL!);
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Refusing to write demo data outside a local database.");
    await db.connect();
    try {
      await db.query(
        `INSERT INTO "StoreReview" ("id", "storeId", "rating", "body", "authorName", "status", "isDemo", "createdAt", "updatedAt")
         SELECT $1, "id", 5, 'Sample review for the demo — lovely shop.', 'Demo D.', 'APPROVED', true, now(), now() FROM "Store" WHERE "slug" = $2`,
        [`e2edemo${stamp}`, slug],
      );
    } finally {
      await db.end();
    }
    // The row went in behind the app's back, so staff hide and publish it once — which is what refreshes the
    // store's cached reviews. The Demo filter finds it, badge and all.
    await admin.goto("/admin/store-reviews?demo=1");
    const demoRow = admin.locator("li", { hasText: "Sample review for the demo" }).filter({ hasText: storeName });
    await expect(demoRow.getByText("Demo review")).toBeVisible();
    await demoRow.getByRole("button", { name: "Hide" }).click();
    await expect(toast(admin, "Review hidden from the store.")).toBeVisible();
    await admin.reload();
    await admin.locator("li", { hasText: "Sample review for the demo" }).filter({ hasText: storeName }).getByRole("button", { name: "Publish" }).click();
    await expect(toast(admin, "Review published.")).toBeVisible();

    const shopper = await browser.newContext({ baseURL: storeUrl });
    const page = await shopper.newPage();
    await expect(async () => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "What customers say" })).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 60000 });
    const section = page.locator("section#reviews");
    await expect(section.getByText("Demo review").first()).toBeVisible();
    await expect(section.getByText(/All of these are demo reviews — sample data for demonstration, not real customers/)).toBeVisible();
    await expect(section.getByText("Verified order")).toHaveCount(0);
    await shopper.close();
  });
});
