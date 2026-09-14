import { expect, test } from "@playwright/test";
import { addToBag } from "./helpers";

test("cart: add an item, change its quantity and remove it", async ({ page }) => {
  // Add to cart
  await addToBag(page, "amber-wood-wick-candle");
  const name = (await page.getByRole("heading", { level: 1 }).innerText()).trim();

  await page.goto("/cart");
  // The bag drawer renders the same line controls, so scope to the cart page's list.
  const items = page.getByRole("region", { name: "Items in your bag" });
  // exact: the Increase/Decrease buttons' labels also contain "quantity for …".
  const quantity = items.getByLabel(`Quantity for ${name}`, { exact: true });
  await expect(quantity).toHaveValue("1");

  // Update quantity
  await items.getByRole("button", { name: `Increase quantity for ${name}` }).click();
  await expect(quantity).toHaveValue("2");
  await expect(page.getByLabel("Order summary")).toContainText("Subtotal (2 items)");

  // Remove from cart
  await items.getByRole("button", { name: `Remove ${name}` }).click();
  await expect(page.getByLabel(`Quantity for ${name}`)).toHaveCount(0);
});
