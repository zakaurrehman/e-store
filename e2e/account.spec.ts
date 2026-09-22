import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { ADMIN_STATE, pathOf, PLATFORM_URL, toast, unique, waitForMail } from "./helpers";

test.describe.serial("customer account", () => {
  const email = `e2e.customer.${unique()}@example.com`;
  const password = "Zendropship-E2E-2026!";
  const reviewTitle = `Holds its shape ${unique()}`;
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("register: a new customer signs up and confirms their email", async () => {
    await page.goto("/register");
    await page.locator("#field-firstName").fill("Robin");
    await page.locator("#field-lastName").fill("Tester");
    await page.locator("#field-email").fill(email);
    await page.locator("#register-password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/account/);

    const welcome = await waitForMail((mail) => mail.to === email && /Welcome/.test(mail.subject));
    const verifyLink = welcome.links.find((link) => link.includes("/verify-email"));
    expect(verifyLink).toBeTruthy();
    await page.goto(pathOf(verifyLink!));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Email confirmed");
  });

  test("review: a customer review appears on the product after moderation", async ({ browser }) => {
    await page.goto("/p/harness-leather-belt");
    await page.getByText("Write a review").click();
    await page.getByRole("radio", { name: /4 stars/ }).check({ force: true });
    await page.locator("#review-title").fill(reviewTitle);
    await page.locator("#review-body").fill("Sturdy leather that has softened nicely after a month of daily wear.");
    await page.getByRole("button", { name: "Submit review" }).click();
    await expect(page.getByText(/will appear once it's been checked|awaiting moderation/).first()).toBeVisible();

    const adminContext = await browser.newContext({ storageState: ADMIN_STATE, baseURL: PLATFORM_URL });
    const admin = await adminContext.newPage();
    await admin.goto("/admin/reviews?status=PENDING");
    await admin.locator("li", { hasText: reviewTitle }).getByRole("button", { name: "Approve" }).click();
    await expect(toast(admin, "Review approved.")).toBeVisible();
    await adminContext.close();

    // The product page is cached, so the approved review appears on a re-fetch rather than instantly.
    await expect(async () => {
      await page.goto("/p/harness-leather-belt");
      await expect(page.locator("#reviews")).toContainText(reviewTitle, { timeout: 5000 });
    }).toPass({ timeout: 60000 });
  });

  test("logout: signing out ends access to the account area", async () => {
    await page.goto("/account");
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL((url) => url.pathname === "/");
    await page.goto("/account");
    await page.waitForURL(/\/login\?next=%2Faccount/);
  });

  test("login: the customer signs back in with their password", async () => {
    await page.goto("/login");
    await page.locator("#field-email").fill(email);
    await page.locator("#login-password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/account/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
