import { expect, test as setup } from "@playwright/test";
import { ADMIN_STATE } from "./helpers";

// Flow: admin login. Signs in once and saves the session for the admin specs.
setup("admin signs in to the dashboard", async ({ page }) => {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (see .env.example) to run the E2E suite.");

  await page.goto("/login?next=/admin");
  await page.locator("#field-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname === "/admin");
  await expect(page.getByRole("navigation", { name: "Admin" }).first()).toBeVisible();
  await page.context().storageState({ path: ADMIN_STATE });
});
