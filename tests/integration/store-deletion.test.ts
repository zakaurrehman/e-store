import { describe, expect, it } from "vitest";
import { addItem, createGuestCart } from "@/features/cart/service";
import { acceptOrder, placeOrder, processWebhook, updateOrderStatus } from "@/features/orders/service";
import { deleteStore, storeDeletionPreview } from "@/features/stores/deletion";
import { openStoreForNewOwner, openStoreForUser } from "@/features/stores/onboarding";
import { getOwnedStore } from "@/features/stores/queries";
import { addProductsToStore } from "@/features/stores/service";
import { confirmDeposit, getBalanceCents, markPayoutPaid, recordDeposit, requestPayout, setPayoutStatus } from "@/features/wallet/service";
import { DiscountType, OrderStatus, PayoutStatus, StoreStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { isDomainError } from "@/server/errors";
import { createProduct, invitation, orderContext, orderInput, sandboxGateway } from "./helpers";

const TRC20_ADDRESS = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
let sequence = 0;

async function staff() {
  const role = await db.role.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } });
  return db.user.upsert({ where: { email: "deletion.staff@example.com" }, create: { email: "deletion.staff@example.com", firstName: "Del", lastName: "Staff", roleId: role.id }, update: {} });
}

/** An owner's store with one product: $100 retail, $50 wholesale, so a delivered order leaves $40 profit. */
async function ownerStore() {
  sequence += 1;
  const { user, store } = await openStoreForNewOwner({
    storeName: `Deletion Store ${sequence}`,
    firstName: "Dee",
    lastName: "Owner",
    email: `deletion.${sequence}.${Date.now()}@example.com`,
    password: "Correct-horse-battery-7",
    referralCode: await invitation(),
  });
  const { product, variant } = await createProduct({ priceCents: 10000, stock: 20 });
  await db.productVariant.update({ where: { id: variant.id }, data: { costCents: 5000 } });
  await addProductsToStore(store.id, [product.id], { userId: user.id, asOwner: true });
  return { user, store, variant };
}

async function place(storeId: string, variantId: string, paymentProvider: "sandbox" | "cod" = "sandbox") {
  const { cart } = await createGuestCart(storeId);
  await addItem(cart.id, variantId, 1);
  const outcome = await placeOrder(await orderInput({ paymentProvider }), orderContext(cart.id));
  return db.order.findUniqueOrThrow({ where: { id: outcome.result.orderId } });
}

async function pay(orderId: string) {
  const payment = await db.payment.findFirstOrThrow({ where: { orderId } });
  await processWebhook("sandbox", await sandboxGateway().buildWebhookRequest({ id: `evt_${payment.id}`, type: "succeeded", providerReference: payment.providerReference!, amountCents: payment.amountCents, currency: "USD" }));
}

/** Paid, accepted by the owner and delivered: the profit lands in the owner's balance. */
async function deliveredOrder(store: { id: string; ownerId: string | null }, variantId: string) {
  const order = await place(store.id, variantId);
  await pay(order.id);
  await acceptOrder(order.id, { userId: store.ownerId!, as: "owner" });
  const admin = await staff();
  for (const status of [OrderStatus.PACKED, OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED]) await updateOrderStatus(order.id, status, admin.id);
  return order;
}

/** The owner withdraws everything and staff pay it: the balance is back to zero. */
async function settle(store: { id: string }, userId: string) {
  const balance = await getBalanceCents(store.id);
  const admin = await staff();
  const payout = await requestPayout({ storeId: store.id, amountCents: balance, method: "USDT_TRC20", destination: TRC20_ADDRESS, requestedById: userId });
  await setPayoutStatus(payout.id, PayoutStatus.APPROVED, admin.id);
  await setPayoutStatus(payout.id, PayoutStatus.PROCESSING, admin.id);
  await markPayoutPaid(payout.id, admin.id, "b".repeat(64));
}

const errorOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return null;
  } catch (error) {
    return isDomainError(error) ? { code: error.code, message: error.message } : { code: "UNEXPECTED", message: String(error) };
  }
};

describe("deleting a store", () => {
  it("is refused while the store has business to settle, and says what", async () => {
    const { user, store, variant } = await ownerStore();
    const admin = await staff();

    // An order still being handled.
    const open = await place(store.id, variant.id, "cod");
    expect((await storeDeletionPreview(store.id)).blockers.join(" ")).toMatch(/1 order still open/);
    expect((await errorOf(deleteStore(store.id, store.slug, admin.id)))?.code).toBe("STORE_NOT_DELETABLE");

    // Money the owner has not withdrawn.
    await db.order.update({ where: { id: open.id }, data: { status: OrderStatus.CANCELLED } });
    const deposit = await recordDeposit({ storeId: store.id, amountCents: 3000, method: "BANK_TRANSFER", reference: "DEL-1", createdById: user.id });
    expect((await storeDeletionPreview(store.id)).blockers.join(" ")).toMatch(/1 deposit waiting for review/);
    await confirmDeposit(deposit.id, admin.id);
    expect((await storeDeletionPreview(store.id)).blockers.join(" ")).toMatch(/still has \$30\.00 in their balance/);

    // A withdrawal on its way.
    const payout = await requestPayout({ storeId: store.id, amountCents: 3000, method: "USDT_TRC20", destination: TRC20_ADDRESS, requestedById: user.id });
    expect((await storeDeletionPreview(store.id)).blockers.join(" ")).toMatch(/1 withdrawal in progress/);
    await setPayoutStatus(payout.id, PayoutStatus.APPROVED, admin.id);
    await markPayoutPaid(payout.id, admin.id);

    // Settled: nothing blocks any more — but the store's address still has to be typed exactly.
    expect((await storeDeletionPreview(store.id)).blockers).toEqual([]);
    expect((await errorOf(deleteStore(store.id, "", admin.id)))?.code).toBe("CONFIRMATION_MISMATCH");
    expect((await errorOf(deleteStore(store.id, `${store.slug}-x`, admin.id)))?.code).toBe("CONFIRMATION_MISMATCH");
    expect((await db.store.findUniqueOrThrow({ where: { id: store.id } })).deletedAt).toBeNull();
  });

  it("will not delete Zendropship's own store", async () => {
    const platform = await db.store.findFirstOrThrow({ where: { ownerId: null, deletedAt: null }, orderBy: { createdAt: "asc" } });
    expect((await storeDeletionPreview(platform.id)).blockers).toEqual(["Zendropship's own store can't be deleted."]);
    expect((await errorOf(deleteStore(platform.id, platform.slug, (await staff()).id)))?.code).toBe("STORE_NOT_DELETABLE");
  });

  it("removes a settled store and everything that made it a store, keeps its money records, and leaves nothing orphaned", async () => {
    const { user, store, variant } = await ownerStore();
    const admin = await staff();

    // A delivered, paid-out order: real money records that must survive.
    const delivered = await deliveredOrder(store, variant.id);
    await settle(store, user.id);
    expect(await getBalanceCents(store.id)).toBe(0);
    // Things that belong to the store alone.
    const unpaid = await place(store.id, variant.id); // a card order never paid
    const stockBefore = (await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stockQuantity;
    const { cart } = await createGuestCart(store.id);
    await addItem(cart.id, variant.id, 1);
    await db.coupon.create({ data: { storeId: store.id, code: `DEL${sequence}${Date.now()}`.slice(0, 20), type: DiscountType.PERCENTAGE, value: 10 } });
    const conversation = await db.contactMessage.create({ data: { storeId: store.id, name: "Cus Tomer", email: "customer@example.com", subject: "Where is my parcel?", message: "Hello" } });
    await db.contactReply.create({ data: { messageId: conversation.id, body: "On its way." } });
    const customer = await db.user.create({ data: { email: `signup.${Date.now()}@example.com`, firstName: "Sig", lastName: "Nup", roleId: (await db.role.findUniqueOrThrow({ where: { key: "CUSTOMER" } })).id, registeredStoreId: store.id } });
    const keptBefore = {
      orders: await db.order.count({ where: { storeId: store.id, status: { not: OrderStatus.PENDING } } }),
      ledger: await db.walletEntry.count({ where: { storeId: store.id } }),
      deposits: await db.deposit.count({ where: { storeId: store.id } }),
      payouts: await db.payout.count({ where: { storeId: store.id } }),
    };

    const preview = await storeDeletionPreview(store.id);
    expect(preview.blockers).toEqual([]);
    // Every checkout leaves its (emptied) bag behind, as well as the one still holding an item.
    expect(preview.removes).toMatchObject({ products: 1, carts: await db.cart.count({ where: { storeId: store.id } }), coupons: 1, conversations: 1, unpaidOrders: 1, signups: 1 });
    expect(preview.removes.carts).toBeGreaterThanOrEqual(1);
    expect(preview.keeps).toMatchObject({ orders: 1, ledgerEntries: keptBefore.ledger, payouts: 1 });

    const oldSlug = store.slug;
    await deleteStore(store.id, oldSlug.toUpperCase(), admin.id);

    // The store is a record now: marked deleted, its address freed, its owner released but remembered.
    const record = await db.store.findUniqueOrThrow({ where: { id: store.id } });
    expect(record.deletedAt).not.toBeNull();
    expect(record.status).toBe(StoreStatus.SUSPENDED);
    expect(record.slug).toBe(`deleted-${store.id}`);
    expect(record.ownerId).toBeNull();
    expect(record.formerOwnerId).toBe(user.id);
    // Nobody reaches it: not shoppers at its old address, not its owner.
    expect(await db.store.findFirst({ where: { slug: oldSlug, status: StoreStatus.ACTIVE, deletedAt: null } })).toBeNull();
    expect(await getOwnedStore(user.id)).toBeNull();

    // What made it a store is gone.
    expect(await db.storeProduct.count({ where: { storeId: store.id } })).toBe(0);
    expect(await db.cart.count({ where: { storeId: store.id } })).toBe(0);
    expect(await db.cartItem.count({ where: { cartId: cart.id } })).toBe(0);
    expect(await db.contactMessage.count({ where: { storeId: store.id } })).toBe(0);
    expect(await db.contactReply.count({ where: { messageId: conversation.id } })).toBe(0);
    expect(await db.coupon.count({ where: { storeId: store.id, deletedAt: null } })).toBe(0);
    expect((await db.user.findUniqueOrThrow({ where: { id: customer.id } })).registeredStoreId).toBeNull();
    // The unpaid order is cancelled, and its stock is back on the shelf.
    expect((await db.order.findUniqueOrThrow({ where: { id: unpaid.id } })).status).toBe(OrderStatus.CANCELLED);
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stockQuantity).toBe(stockBefore + 1);

    // The money records are all still there, untouched, and still add up.
    expect(await db.order.count({ where: { storeId: store.id, status: { not: OrderStatus.PENDING }, id: { not: unpaid.id } } })).toBe(keptBefore.orders);
    expect((await db.order.findUniqueOrThrow({ where: { id: delivered.id } })).status).toBe(OrderStatus.DELIVERED);
    expect(await db.walletEntry.count({ where: { storeId: store.id } })).toBe(keptBefore.ledger);
    expect(await db.deposit.count({ where: { storeId: store.id } })).toBe(keptBefore.deposits);
    expect(await db.payout.count({ where: { storeId: store.id } })).toBe(keptBefore.payouts);
    expect(await getBalanceCents(store.id)).toBe(0);
    expect(await db.auditLog.count({ where: { entityId: store.id, action: "store.delete" } })).toBe(1);

    // Nothing anywhere points at a store, order, conversation or bag that no longer exists.
    const orphans = await db.$queryRaw<Array<{ table: string; count: bigint }>>`
      SELECT 'Order' AS "table", count(*) FROM "Order" o LEFT JOIN "Store" s ON s."id" = o."storeId" WHERE s."id" IS NULL
      UNION ALL SELECT 'WalletEntry', count(*) FROM "WalletEntry" w LEFT JOIN "Store" s ON s."id" = w."storeId" WHERE s."id" IS NULL
      UNION ALL SELECT 'Payout', count(*) FROM "Payout" p LEFT JOIN "Store" s ON s."id" = p."storeId" WHERE s."id" IS NULL
      UNION ALL SELECT 'Deposit', count(*) FROM "Deposit" d LEFT JOIN "Store" s ON s."id" = d."storeId" WHERE s."id" IS NULL
      UNION ALL SELECT 'ContactReply', count(*) FROM "ContactReply" r LEFT JOIN "ContactMessage" m ON m."id" = r."messageId" WHERE m."id" IS NULL
      UNION ALL SELECT 'CartItem', count(*) FROM "CartItem" i LEFT JOIN "Cart" c ON c."id" = i."cartId" WHERE c."id" IS NULL
      UNION ALL SELECT 'OrderItem', count(*) FROM "OrderItem" i LEFT JOIN "Order" o ON o."id" = i."orderId" WHERE o."id" IS NULL`;
    expect(orphans.filter((row) => Number(row.count) > 0)).toEqual([]);

    // Deleting it again finds nothing to delete.
    expect((await errorOf(deleteStore(store.id, oldSlug, admin.id)))?.code).toBe("NOT_FOUND");

    // The address can be taken by a new store…
    const reuse = await openStoreForNewOwner(
      { storeName: "Taken Again", slug: oldSlug, firstName: "Re", lastName: "Use", email: `reuse.${Date.now()}@example.com`, password: "Correct-horse-battery-7", referralCode: await invitation() },
      { ipAddress: "local" },
    );
    expect(reuse.store.slug).toBe(oldSlug);
    // …and the former owner can open another store, but only with a new invitation.
    expect((await errorOf(openStoreForUser(user.id, { storeName: "Second Try" })))?.code).toBe("REFERRAL_REQUIRED");
    const again = await openStoreForUser(user.id, { storeName: "Second Try", referralCode: await invitation() });
    expect(again.ownerId).toBe(user.id);
  });
});
