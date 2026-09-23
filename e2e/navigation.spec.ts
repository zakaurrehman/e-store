import { expect, test, type Page } from "@playwright/test";
import { ADMIN_STATE, PLATFORM_URL, STORE_URL } from "./helpers";

/**
 * Every route the app serves, opened directly the way a refresh or a pasted link opens it, plus the
 * redirects that keep old and cross-host links working. A page that answers with the not-found screen is
 * a failure here, so a route that disappears or a link that outlives it cannot go unnoticed.
 */

/** Streamed pages keep a 200 status, so the not-found screen is recognised by its heading. */
const notFound = (page: Page) => page.getByRole("heading", { name: /can.t find that page/ });

async function open(page: Page, url: string) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  expect(response?.status(), `HTTP status for ${url}`).toBeLessThan(400);
  await expect(notFound(page), `${url} shows the 404 page`).toHaveCount(0);
}

const PUBLIC_PLATFORM = ["/", "/catalog", "/catalog/c/women", "/catalog/p/amber-wood-wick-candle", "/contact", "/start", "/login", "/register", "/forgot-password", "/pages/shipping", "/pages/privacy"];

const STOREFRONT = [
  "/",
  "/shop",
  "/search?q=candle",
  "/c/women",
  "/c/womens-dresses",
  "/p/amber-wood-wick-candle",
  "/collections/new-arrivals",
  "/brands",
  "/brands/common-thread",
  "/cart",
  "/track-order",
  "/contact",
  "/faq",
  "/pages/shipping",
  "/login",
  "/register",
  "/forgot-password",
];

const ADMIN = [
  "/admin",
  "/admin/analytics",
  "/admin/catalog",
  "/admin/content",
  "/admin/content/pages",
  "/admin/customers",
  "/admin/deposits",
  "/admin/deposits?status=PENDING",
  "/admin/discounts",
  "/admin/imports",
  "/admin/inventory",
  "/admin/media",
  "/admin/messages",
  "/admin/notifications",
  "/admin/orders",
  "/admin/payouts",
  "/admin/products",
  "/admin/products/new",
  "/admin/referrals",
  "/admin/reviews",
  "/admin/settings",
  "/admin/settings/audit",
  "/admin/settings/shipping",
  "/admin/settings/staff",
  "/admin/stores",
];

test.describe("every route opens", () => {
  test("the platform site, for a visitor", async ({ page }) => {
    for (const path of PUBLIC_PLATFORM) await open(page, `${PLATFORM_URL}${path}`);
  });

  test("a storefront, for a visitor", async ({ page }) => {
    for (const path of STOREFRONT) await open(page, `${STORE_URL}${path}`);
  });

  test("the admin, for staff", async ({ browser }) => {
    const context = await browser.newContext({ storageState: ADMIN_STATE, baseURL: PLATFORM_URL });
    const page = await context.newPage();
    for (const path of ADMIN) await open(page, `${PLATFORM_URL}${path}`);

    // The detail pages behind the lists, reached the way staff reach them.
    for (const [list, link] of [
      ["/admin/orders", /^VY-/],
      ["/admin/customers", /@/],
      ["/admin/products", /.+/],
      ["/admin/stores", /.+/],
    ] as const) {
      await page.goto(`${PLATFORM_URL}${list}`);
      const first = page.locator("tbody tr").first().getByRole("link", { name: link }).first();
      if ((await first.count()) === 0) continue;
      await first.click();
      await page.waitForLoadState("domcontentloaded");
      await expect(notFound(page), `a detail page from ${list}`).toHaveCount(0);
    }
    await context.close();
  });
});

test.describe("links that cross hosts keep working", () => {
  const followed = async (page: Page, url: string) => {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    // A cross-host hop on the development server arrives as a meta refresh, which the browser follows.
    await page.waitForLoadState("domcontentloaded");
    return page.url();
  };

  test("storefront paths on the platform host land on their platform equivalent", async ({ page }) => {
    expect(await followed(page, `${PLATFORM_URL}/p/amber-wood-wick-candle`)).toContain("/catalog/p/amber-wood-wick-candle");
    expect(await followed(page, `${PLATFORM_URL}/c/women`)).toContain("/catalog/c/women");
    expect(await followed(page, `${PLATFORM_URL}/search`)).toContain("/catalog");
    await expect(notFound(page)).toHaveCount(0);
  });

  test("a bag or checkout on the platform host goes to the demo store", async ({ page }) => {
    const landed = await followed(page, `${PLATFORM_URL}/cart`);
    expect(landed).toContain("/cart");
    await expect(notFound(page)).toHaveCount(0);
  });

  test("an /s/ path on the platform host goes to the store's own address", async ({ page }) => {
    const landed = await followed(page, `${PLATFORM_URL}/s/demo/shop`);
    expect(landed).toContain("/shop");
    await expect(notFound(page)).toHaveCount(0);
  });

  test("the admin and the dashboard are not served on a store host", async ({ page }) => {
    for (const path of ["/admin", "/dashboard"]) {
      await page.goto(`${STORE_URL}${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("domcontentloaded");
      // Signed out, the platform answers with its sign-in page rather than a dead end.
      await expect(notFound(page), `${path} on a store host`).toHaveCount(0);
    }
  });

  test("signed-out visitors are sent to sign in, not to a 404", async ({ page }) => {
    for (const path of ["/admin", "/admin/stores", "/dashboard", "/dashboard/balance"]) {
      await page.goto(`${PLATFORM_URL}${path}`);
      await expect(page, `${path} while signed out`).toHaveURL(/\/login/);
    }
  });
});

test.describe("the not-found page offers a way out that works", () => {
  test("on the platform site it points at the platform", async ({ page }) => {
    await page.goto(`${PLATFORM_URL}/no-such-page-${Date.now()}`);
    await expect(notFound(page)).toBeVisible();
    await page.getByRole("link", { name: "Browse the catalogue" }).click();
    await page.waitForLoadState("domcontentloaded");
    await expect(notFound(page)).toHaveCount(0);
    expect(page.url()).toContain("/catalog");
  });

  test("on a storefront it points at the shop", async ({ page }) => {
    await page.goto(`${STORE_URL}/no-such-page-${Date.now()}`);
    await expect(notFound(page)).toBeVisible();
    await page.getByRole("link", { name: "Shop everything" }).click();
    await page.waitForLoadState("domcontentloaded");
    await expect(notFound(page)).toHaveCount(0);
    expect(page.url()).toContain("/shop");
  });

  test("on an address with no store it leaves for the platform", async ({ page }) => {
    const host = STORE_URL.replace("//demo.", "//no-such-store.");
    await page.goto(`${host}/`);
    await expect(notFound(page)).toBeVisible();
    const home = page.getByRole("link", { name: "Back to home" });
    await expect(home).toHaveAttribute("href", new RegExp(PLATFORM_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
});
