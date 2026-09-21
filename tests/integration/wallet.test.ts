import { describe, expect, it } from "vitest";
import { addItem, createGuestCart } from "@/features/cart/service";
import { cancelOrder, placeOrder, processWebhook, refundOrder, updateOrderStatus } from "@/features/orders/service";
import { openStoreForNewOwner } from "@/features/stores/onboarding";
import { addProductsToStore } from "@/features/stores/service";
import { getWalletSummary, listWalletEntries } from "@/features/wallet/queries";
import { confirmDeposit, getBalanceCents, markPayoutPaid, MIN_PAYOUT_CENTS, recordDeposit, rejectDeposit, rejectPayout, requestPayout } from "@/features/wallet/service";
import { DepositStatus, OrderStatus, PayoutStatus, WalletEntryType } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { isDomainError } from "@/server/errors";
import { createProduct, orderContext, orderInput, sandboxGateway } from "./helpers";

let sequence = 0;

/** The Zendropship staff member who settles withdrawals in these tests. */
async function staff() {
  const role = await db.role.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } });
  return db.user.upsert({
    where: { email: "wallet.staff@example.com" },
    create: { email: "wallet.staff@example.com", firstName: "Wall", lastName: "Staff", roleId: role.id },
    update: {},
  });
}

/** A store owned by a real owner, stocked with one product that costs $30 and sells at $50. */
async function storeWithProduct(priceCents = 5000, costCents = 3000) {
  sequence += 1;
  const { user, store } = await openStoreForNewOwner({
    storeName: `Wallet Store ${sequence}`,
    firstName: "Wal",
    lastName: "Owner",
    email: `wallet.${sequence}.${Date.now()}@example.com`,
    password: "Correct-horse-battery-7",
  });
  const { product, variant } = await createProduct({ priceCents, stock: 50 });
  await db.productVariant.update({ where: { id: variant.id }, data: { costCents } });
  await addProductsToStore(store.id, [product.id], { userId: user.id, asOwner: true });
  return { user, store, product, variant };
}

/** Places an order in the store and pays it through the sandbox gateway's signed webhook. */
async function paidOrder(store: { id: string }, variantId: string, quantity = 1) {
  const { cart } = await createGuestCart(store.id);
  await addItem(cart.id, variantId, quantity);
  const outcome = await placeOrder(await orderInput(), orderContext(cart.id));
  const payment = await db.payment.findFirstOrThrow({ where: { orderId: outcome.result.orderId } });
  const gateway = sandboxGateway();
  await processWebhook(
    "sandbox",
    gateway.buildWebhookRequest({ id: `evt_${payment.id}`, type: "succeeded", providerReference: payment.providerReference!, amountCents: payment.amountCents, currency: "USD" }),
  );
  return db.order.findUniqueOrThrow({ where: { id: outcome.result.orderId } });
}

const errorCode = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return null;
  } catch (error) {
    return isDomainError(error) ? error.code : "UNEXPECTED";
  }
};

describe("store wallet", () => {
  it("credits the owner's margin once the customer's payment is collected, and only once", async () => {
    const { store, variant } = await storeWithProduct();
    expect(await getBalanceCents(store.id)).toBe(0);

    const order = await paidOrder(store, variant.id, 2);
    // Suggested pricing: sells for $50, costs $30 → $20 margin per unit.
    expect(await getBalanceCents(store.id)).toBe(4000);

    // A replayed webhook must not credit again.
    const payment = await db.payment.findFirstOrThrow({ where: { orderId: order.id } });
    await processWebhook(
      "sandbox",
      sandboxGateway().buildWebhookRequest({ id: `evt_replay_${payment.id}`, type: "succeeded", providerReference: payment.providerReference!, amountCents: payment.amountCents, currency: "USD" }),
    );
    expect(await getBalanceCents(store.id)).toBe(4000);
    expect(await db.walletEntry.count({ where: { storeId: store.id, type: WalletEntryType.ORDER_EARNING } })).toBe(1);
  });

  it("takes the earning back when the order is refunded or cancelled", async () => {
    const { store, variant } = await storeWithProduct();
    const refunded = await paidOrder(store, variant.id);
    const admin = await staff();
    await refundOrder(refunded.id, refunded.totalCents, "Customer changed their mind", admin.id);
    expect(await getBalanceCents(store.id)).toBe(0);

    const cancelled = await paidOrder(store, variant.id);
    expect(await getBalanceCents(store.id)).toBe(2000);
    await cancelOrder(cancelled.id, "Out of stock", admin.id, { refund: false });
    expect(await getBalanceCents(store.id)).toBe(0);
  });

  it("credits cash on delivery only once the parcel is delivered", async () => {
    const { store, variant } = await storeWithProduct();
    const { cart } = await createGuestCart(store.id);
    await addItem(cart.id, variant.id, 1);
    const outcome = await placeOrder(await orderInput({ paymentProvider: "cod" }), orderContext(cart.id));
    expect(await getBalanceCents(store.id)).toBe(0);

    const admin = await staff();
    for (const status of [OrderStatus.PROCESSING, OrderStatus.PACKED, OrderStatus.SHIPPED, OrderStatus.DELIVERED]) {
      await updateOrderStatus(outcome.result.orderId, status, admin.id);
    }
    expect(await getBalanceCents(store.id)).toBe(2000);
  });

  it("summarises earnings for today, this week and this month, and lists the ledger with a running balance", async () => {
    const { store, variant } = await storeWithProduct();
    await paidOrder(store, variant.id);
    await paidOrder(store, variant.id);

    const summary = await getWalletSummary(store.id);
    expect(summary.balanceCents).toBe(4000);
    expect(summary.earnedTodayCents).toBe(4000);
    expect(summary.earnedThisWeekCents).toBe(4000);
    expect(summary.earnedThisMonthCents).toBe(4000);
    expect(summary.pendingPayoutCents).toBe(0);

    const history = await listWalletEntries(store.id);
    expect(history.entries).toHaveLength(2);
    expect(history.entries[0].balanceAfterCents).toBe(4000);
    expect(history.entries[1].balanceAfterCents).toBe(2000);
  });

  it("holds a withdrawal against the balance, returns it when declined and keeps it when paid", async () => {
    const { user, store, variant } = await storeWithProduct(20000, 10000);
    await paidOrder(store, variant.id); // $100 margin

    expect(await errorCode(requestPayout({ storeId: store.id, amountCents: 50_000, method: "PAYPAL", destination: "owner@example.com", requestedById: user.id }))).toBe("INSUFFICIENT_BALANCE");
    expect(await errorCode(requestPayout({ storeId: store.id, amountCents: MIN_PAYOUT_CENTS - 1, method: "PAYPAL", destination: "owner@example.com", requestedById: user.id }))).toBe("PAYOUT_TOO_SMALL");

    const payout = await requestPayout({ storeId: store.id, amountCents: 6000, method: "PAYPAL", destination: "owner@example.com", requestedById: user.id });
    expect(await getBalanceCents(store.id)).toBe(4000);

    const admin = await staff();
    await rejectPayout(payout.id, admin.id, "Wrong account details");
    expect(await getBalanceCents(store.id)).toBe(10000);
    expect((await db.payout.findUniqueOrThrow({ where: { id: payout.id } })).status).toBe(PayoutStatus.REJECTED);

    const second = await requestPayout({ storeId: store.id, amountCents: 10000, method: "BANK_TRANSFER", destination: "IBAN GB00 0000", requestedById: user.id });
    await markPayoutPaid(second.id, admin.id, "BACS 12345");
    expect(await getBalanceCents(store.id)).toBe(0);
    expect(await errorCode(markPayoutPaid(second.id, admin.id))).toBe("PAYOUT_SETTLED");
  });

  it("credits a deposit only when staff confirm it arrived", async () => {
    const { user, store } = await storeWithProduct();
    const deposit = await recordDeposit({ storeId: store.id, amountCents: 5000, reference: "TRF-1", createdById: user.id });
    expect(await getBalanceCents(store.id)).toBe(0);
    expect((await getWalletSummary(store.id)).pendingDepositCount).toBe(1);

    const admin = await staff();
    await confirmDeposit(deposit.id, admin.id);
    expect(await getBalanceCents(store.id)).toBe(5000);
    expect((await db.deposit.findUniqueOrThrow({ where: { id: deposit.id } })).status).toBe(DepositStatus.CONFIRMED);

    const declined = await recordDeposit({ storeId: store.id, amountCents: 2500, createdById: user.id });
    await rejectDeposit(declined.id, admin.id, "No transfer found");
    expect(await getBalanceCents(store.id)).toBe(5000);
  });

  it("keeps each store's balance to itself and pays nothing to the platform store", async () => {
    const mine = await storeWithProduct();
    const theirs = await storeWithProduct();
    await paidOrder(mine.store, mine.variant.id);
    expect(await getBalanceCents(mine.store.id)).toBe(2000);
    expect(await getBalanceCents(theirs.store.id)).toBe(0);

    // An order in the platform's own store earns no owner balance.
    const platform = await db.store.findFirstOrThrow({ where: { ownerId: null } });
    const { product, variant } = await createProduct({ priceCents: 4000, stock: 5 });
    await db.productVariant.update({ where: { id: variant.id }, data: { costCents: 1000 } });
    void product;
    await paidOrder(platform, variant.id);
    expect(await getBalanceCents(platform.id)).toBe(0);
  });
});
