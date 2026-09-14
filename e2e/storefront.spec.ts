import { expect, test } from "@playwright/test";

test.describe("storefront discovery", () => {
  test("search: the command palette tolerates typos and opens full results", async ({ page }) => {
    await page.goto("/");
    const dialog = page.getByRole("dialog", { name: "Search" });
    // The "/" shortcut listens once the page has hydrated, so retry the key press until the dialog opens.
    await expect(async () => {
      await page.keyboard.press("/");
      await expect(dialog).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 30_000 });

    const input = dialog.getByLabel("Search the store");
    await input.fill("lether");
    await expect(dialog.locator("[role=option]").first()).toBeVisible();
    await expect(dialog.getByText(/Showing results for/)).toBeVisible();

    await input.press("Enter");
    await page.waitForURL(/\/search\?q=lether/);
    await expect(dialog).toBeHidden();
    await expect(page.locator("main a[href^='/p/']").first()).toBeVisible();
  });

  test("browse: a department lists products and links to product pages", async ({ page }) => {
    await page.goto("/c/women");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Women");
    const firstProduct = page.locator("main a[href^='/p/']").first();
    await expect(firstProduct).toBeVisible();

    await page.goto("/c/women?sort=newest");
    await expect(page.locator("main a[href^='/p/']").first()).toBeVisible();
  });

  test("product: the page shows price, variants and an add-to-bag action", async ({ page }) => {
    await page.goto("/p/heavyweight-organic-tee");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("main").getByText(/\$\d+\.\d{2}/).first()).toBeVisible();
    await page.getByRole("radio", { name: "M" }).check({ force: true });
    await expect(page.getByRole("button", { name: "Add to bag" }).first()).toBeEnabled();
  });
});
