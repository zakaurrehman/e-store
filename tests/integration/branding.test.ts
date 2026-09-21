import { describe, expect, it } from "vitest";
import { addItem, createGuestCart } from "@/features/cart/service";
import { getOrderByAccessToken, getOrderForCustomer } from "@/features/orders/queries";
import { placeOrder } from "@/features/orders/service";
import { openStoreForNewOwner } from "@/features/stores/onboarding";
import { toStoreContext } from "@/features/stores/queries";
import { addProductsToStore, updateStoreSettings } from "@/features/stores/service";
import { db } from "@/server/db";
import { dispatchNotification } from "@/server/notifications";
import { createProduct, invitation, orderContext, orderInput } from "./helpers";

let sequence = 0;

async function brandedStore(withLogo: boolean) {
  sequence += 1;
  const { user, store } = await openStoreForNewOwner({ storeName: `Brand Store ${sequence}`, firstName: "Bea", lastName: "Brand", email: `brand.${sequence}.${Date.now()}@example.com`, password: "Correct-horse-battery-7", referralCode: await invitation() });
  if (withLogo) {
    const logo = await db.mediaAsset.create({
      data: { storageKey: `stores/test/logo-${sequence}-${Date.now()}.webp`, url: `/media/stores/test/logo-${sequence}.webp`, filename: "logo.webp", mimeType: "image/webp", sizeBytes: 1200, width: 400, height: 100, folder: "stores" },
    });
    await updateStoreSettings(store.id, { logoId: logo.id }, { userId: user.id, asOwner: true });
  }
  const { product, variant } = await createProduct({ priceCents: 2500, stock: 10 });
  await addProductsToStore(store.id, [product.id], { userId: user.id, asOwner: true });
  return { user, store, variant };
}

async function codOrder(storeId: string, variantId: string, email = "guest.buyer@example.com") {
  const { cart } = await createGuestCart(storeId);
  await addItem(cart.id, variantId, 1);
  return placeOrder(await orderInput({ email, paymentProvider: "cod" }), orderContext(cart.id));
}

describe("store identity and the order confirmation", () => {
  it("each store's context and emails carry its own logo — never another store's", async () => {
    const withLogo = await brandedStore(true);
    const without = await brandedStore(false);

    const row = await db.store.findUniqueOrThrow({
      where: { id: withLogo.store.id },
      select: { id: true, slug: true, name: true, status: true, ownerId: true, pricingMode: true, markupBps: true, currency: true, tagline: true, announcement: true, aboutText: true, supportEmail: true, accentColor: true, heroTitle: true, heroSubtitle: true, logo: { select: { url: true, width: true, height: true } }, heroImage: { select: { url: true } } },
    });
    expect(toStoreContext(row).logo).toEqual({ url: `/media/stores/test/logo-${sequence - 1}.webp`, width: 400, height: 100 });

    const first = await codOrder(withLogo.store.id, withLogo.variant.id);
    const second = await codOrder(without.store.id, without.variant.id);

    const mailFor = async (orderId: string) => {
      const ids = await dispatchNotification({ type: "order.confirmed", orderId });
      const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
      const mail = await db.notificationDelivery.findFirstOrThrow({ where: { id: { in: ids }, recipient: order.email, template: "order.confirmed" } });
      return (mail.payload as { html: string }).html;
    };
    const logoMail = await mailFor(first.result.orderId);
    const plainMail = await mailFor(second.result.orderId);

    expect(logoMail).toContain(`/media/stores/test/logo-${sequence - 1}.webp`);
    expect(logoMail).toContain(`alt="${withLogo.store.name}"`);
    // The store without a logo is named as a wordmark, and borrows nobody's image.
    expect(plainMail).not.toContain("/media/stores/test/");
    expect(plainMail).toContain(without.store.name.toUpperCase());
  });

  it("sends a guest to a confirmation page that can be opened, refreshed and revisited — never a 404", async () => {
    const { store, variant } = await brandedStore(false);
    const outcome = await codOrder(store.id, variant.id, "no.account@example.com");

    expect(outcome.result.next.kind).toBe("confirmation");
    const url = new URL(outcome.result.next.url, "http://store.test");
    expect(url.pathname).toBe(`/checkout/confirmation/${outcome.result.orderNumber}`);
    const token = url.searchParams.get("token");
    expect(token).toBeTruthy();

    // What the confirmation page reads, on the first load and on every refresh after it.
    for (let load = 0; load < 3; load += 1) {
      const order = await getOrderByAccessToken(outcome.result.orderNumber, token, store.id);
      expect(order?.id).toBe(outcome.result.orderId);
    }
    // A wrong token, a missing token or another store's address shows nothing.
    expect(await getOrderByAccessToken(outcome.result.orderNumber, "0".repeat(64), store.id)).toBeNull();
    expect(await getOrderByAccessToken(outcome.result.orderNumber, null, store.id)).toBeNull();
    const elsewhere = await db.store.findFirstOrThrow({ where: { ownerId: null } });
    expect(await getOrderByAccessToken(outcome.result.orderNumber, token, elsewhere.id)).toBeNull();
  });

  it("shows a signed-in customer their order by session, and nobody else's", async () => {
    const { store, variant } = await brandedStore(false);
    const role = await db.role.findUniqueOrThrow({ where: { key: "CUSTOMER" } });
    const buyer = await db.user.create({ data: { email: `signed.${Date.now()}@example.com`, firstName: "Sig", lastName: "Ned", roleId: role.id } });
    const stranger = await db.user.create({ data: { email: `stranger.${Date.now()}@example.com`, firstName: "Str", lastName: "Anger", roleId: role.id } });
    const { cart } = await createGuestCart(store.id);
    await addItem(cart.id, variant.id, 1);
    const outcome = await placeOrder(await orderInput({ email: buyer.email, paymentProvider: "cod" }), orderContext(cart.id, buyer.id));

    expect((await getOrderForCustomer(buyer.id, outcome.result.orderNumber, store.id))?.id).toBe(outcome.result.orderId);
    expect(await getOrderForCustomer(stranger.id, outcome.result.orderNumber, store.id)).toBeNull();
  });

  it("stores the customer's phone number in international form", async () => {
    const { store, variant } = await brandedStore(false);
    const { cart } = await createGuestCart(store.id);
    await addItem(cart.id, variant.id, 1);
    const input = await orderInput({ paymentProvider: "cod" });
    const outcome = await placeOrder({ ...input, phone: "+1 (415) 555-2671" }, orderContext(cart.id));
    const order = await db.order.findUniqueOrThrow({ where: { id: outcome.result.orderId } });
    expect(order.phone).toBe("+14155552671");
  });
});
