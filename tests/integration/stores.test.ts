import { describe, expect, it } from "vitest";
import { addItem, createGuestCart, loadCart } from "@/features/cart/service";
import { validateCoupon } from "@/features/checkout/coupons";
import { placeOrder } from "@/features/orders/service";
import { openStoreForNewOwner, openStoreForUser } from "@/features/stores/onboarding";
import { addProductsToStore, setStoreStatus, updateStoreProduct, updateStoreSettings } from "@/features/stores/service";
import { DiscountType, StoreStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { isDomainError } from "@/server/errors";
import { createProduct, invitation, orderContext, orderInput, testStore } from "./helpers";

const password = "Correct-horse-battery-7";
let sequence = 0;

async function openStore(name = "Maya Studio") {
  sequence += 1;
  return openStoreForNewOwner({ storeName: name, firstName: "Maya", lastName: "Okafor", email: `owner.${sequence}.${Date.now()}@example.com`, password, referralCode: await invitation() });
}

/** A product that costs the owner $30 and is suggested at $50. */
async function wholesaleProduct() {
  const { product, variant } = await createProduct({ priceCents: 5000, stock: 20 });
  await db.productVariant.update({ where: { id: variant.id }, data: { costCents: 3000 } });
  return { product, variant };
}

const errorCode = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return null;
  } catch (error) {
    return isDomainError(error) ? error.code : "UNEXPECTED";
  }
};

describe("stores", () => {
  it("opening a store creates a store-owner account and a live store at a unique address", async () => {
    const first = await openStore("Maya Studio");
    const second = await openStore("Maya Studio");
    expect(first.store.slug).toBe("maya-studio");
    expect(second.store.slug).toBe("maya-studio-2");
    expect(first.store.status).toBe(StoreStatus.ACTIVE);
    const owner = await db.user.findUniqueOrThrow({ where: { id: first.user.id }, include: { role: true } });
    expect(owner.role.key).toBe("STORE_OWNER");
    expect(owner.role.isStaff).toBe(false);

    expect(await errorCode(openStoreForNewOwner({ storeName: "Another", firstName: "A", lastName: "B", email: owner.email, password, referralCode: await invitation() }))).toBe("EMAIL_TAKEN");
    expect(await errorCode(openStoreForUser(owner.id, { storeName: "Second store" }))).toBe("STORE_EXISTS");
    expect(await errorCode(openStoreForNewOwner({ storeName: "Reserved", slug: "admin", firstName: "A", lastName: "B", email: "reserved@example.com", password, referralCode: await invitation() }))).toBe("SLUG_INVALID");
  });

  it("new catalogue products appear in the platform store, but an owner's store sells only what the owner added", async () => {
    const { store } = await openStore();
    const { product, variant } = await wholesaleProduct();
    expect(await db.storeProduct.count({ where: { storeId: (await testStore()).id, productId: product.id } })).toBe(1);

    const { cart } = await createGuestCart(store.id);
    expect(await errorCode(addItem(cart.id, variant.id, 1))).toBe("NOT_FOUND");

    const { added } = await addProductsToStore(store.id, [product.id], { userId: store.ownerId, asOwner: true });
    expect(added).toBe(1);
    await addItem(cart.id, variant.id, 1);
    expect((await loadCart(cart.id))?.lines).toHaveLength(1);
  });

  it("prices follow the store's markup and per-product overrides, and orders keep the price and wholesale cost", async () => {
    const { store } = await openStore();
    const { product, variant } = await wholesaleProduct();
    await addProductsToStore(store.id, [product.id], { userId: store.ownerId, asOwner: true });
    await updateStoreSettings(store.id, { pricingMode: "MARKUP", markupBps: 5000 }, { userId: store.ownerId, asOwner: true });

    const { cart } = await createGuestCart(store.id);
    await addItem(cart.id, variant.id, 2);
    let line = (await loadCart(cart.id))!.lines[0];
    expect(line.unitPriceCents).toBe(4499); // $30 + 50% = $45.00, shown as $44.99
    expect(line.unitCostCents).toBe(3000);

    await updateStoreProduct(store.id, product.id, { fixedPriceCents: 5500 }, { userId: store.ownerId, asOwner: true });
    line = (await loadCart(cart.id))!.lines[0];
    expect(line.unitPriceCents).toBe(5500);

    const outcome = await placeOrder(await orderInput(), orderContext(cart.id));
    const order = await db.order.findUniqueOrThrow({ where: { id: outcome.result.orderId }, include: { items: true } });
    expect(order.storeId).toBe(store.id);
    expect(order.subtotalCents).toBe(11000);
    expect(order.items[0]).toMatchObject({ unitPriceCents: 5500, unitCostCents: 3000, quantity: 2 });
  });

  it("a hidden product stays in the bag but cannot be bought", async () => {
    const { store } = await openStore();
    const { product, variant } = await wholesaleProduct();
    await addProductsToStore(store.id, [product.id], { userId: store.ownerId, asOwner: true });
    const { cart } = await createGuestCart(store.id);
    await addItem(cart.id, variant.id, 1);
    await updateStoreProduct(store.id, product.id, { isActive: false }, { userId: store.ownerId, asOwner: true });
    const view = await loadCart(cart.id);
    expect(view?.lines[0].available).toBe(false);
    expect(view?.hasUnavailableItems).toBe(true);
  });

  it("platform coupons work only in platform stores; a store's coupon works only in that store", async () => {
    const { store } = await openStore();
    const other = await openStore("Other Shop");
    const { product, variant } = await wholesaleProduct();
    await addProductsToStore(store.id, [product.id], { userId: store.ownerId, asOwner: true });
    const lines = [{ key: variant.id, productId: product.id, categoryIds: [], unitPriceCents: 5000, quantity: 1 }];
    await db.coupon.create({ data: { code: "PLATFORM10", type: DiscountType.PERCENTAGE, value: 10 } });
    await db.coupon.create({ data: { code: "MAYA10", type: DiscountType.PERCENTAGE, value: 10, storeId: store.id } });
    const context = (storeId: string) => ({ lines, userId: null, email: null, storeId });

    await expect(validateCoupon("PLATFORM10", context((await testStore()).id))).resolves.toMatchObject({ code: "PLATFORM10" });
    expect(await errorCode(validateCoupon("PLATFORM10", context(store.id)))).toBe("COUPON_INVALID");
    await expect(validateCoupon("MAYA10", context(store.id))).resolves.toMatchObject({ code: "MAYA10" });
    expect(await errorCode(validateCoupon("MAYA10", context(other.store.id)))).toBe("COUPON_INVALID");
  });

  it("a suspended store can no longer be changed by its owner", async () => {
    const { store } = await openStore();
    await setStoreStatus(store.id, StoreStatus.SUSPENDED, null);
    expect(await errorCode(updateStoreSettings(store.id, { name: "Renamed" }, { userId: store.ownerId, asOwner: true }))).toBe("STORE_SUSPENDED");
  });

  it("owners can only change their own store", async () => {
    const mine = await openStore();
    const theirs = await openStore("Their Shop");
    expect(await errorCode(updateStoreSettings(theirs.store.id, { name: "Taken over" }, { userId: mine.user.id, asOwner: true }))).toBe("NOT_FOUND");
  });
});
