import { describe, expect, it } from "vitest";
import { addItem, createGuestCart } from "@/features/cart/service";
import { acceptFundedOrders, acceptOrderForFulfilment, cancelOrder, placeOrder, processWebhook, refundOrder, updateOrderStatus } from "@/features/orders/service";
import { saveSettingsSection } from "@/features/settings/service";
import { openStoreForNewOwner } from "@/features/stores/onboarding";
import { addProductsToStore, updateStoreProduct } from "@/features/stores/service";
import { getWalletSummary, listWalletEntries } from "@/features/wallet/queries";
import {
  chargeOrderFulfilment,
  confirmDeposit,
  fulfilmentShortfallCents,
  getAvailableCents,
  getBalanceCents,
  markPayoutPaid,
  MIN_PAYOUT_CENTS,
  recordDeposit,
  rejectDeposit,
  rejectPayout,
  requestPayout,
  setPayoutStatus,
} from "@/features/wallet/service";
import { DepositStatus, OrderStatus, PayoutStatus, WalletEntryStatus, WalletEntryType } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { isDomainError } from "@/server/errors";
import { createProduct, invitation, orderContext, orderInput, sandboxGateway } from "./helpers";

let sequence = 0;

/** The Zendropship staff member who settles money in these tests. */
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
    referralCode: await invitation(),
  });
  const { product, variant } = await createProduct({ priceCents, stock: 50 });
  await db.productVariant.update({ where: { id: variant.id }, data: { costCents } });
  await addProductsToStore(store.id, [product.id], { userId: user.id, asOwner: true });
  return { user, store, product, variant };
}

async function placeIn(store: { id: string }, variantId: string, quantity = 1, paymentProvider: "sandbox" | "cod" = "sandbox") {
  const { cart } = await createGuestCart(store.id);
  await addItem(cart.id, variantId, quantity);
  const outcome = await placeOrder(await orderInput({ paymentProvider }), orderContext(cart.id));
  return db.order.findUniqueOrThrow({ where: { id: outcome.result.orderId } });
}

const webhookFor = async (orderId: string, eventId?: string) => {
  const payment = await db.payment.findFirstOrThrow({ where: { orderId } });
  return sandboxGateway().buildWebhookRequest({ id: eventId ?? `evt_${payment.id}`, type: "succeeded", providerReference: payment.providerReference!, amountCents: payment.amountCents, currency: "USD" });
};

/** Places an order in the store and pays it through the sandbox gateway's signed webhook. */
async function paidOrder(store: { id: string }, variantId: string, quantity = 1) {
  const order = await placeIn(store, variantId, quantity);
  await processWebhook("sandbox", await webhookFor(order.id));
  return db.order.findUniqueOrThrow({ where: { id: order.id } });
}

const entriesOf = (orderId: string) => db.walletEntry.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });
const sumOf = (entries: Array<{ amountCents: number }>) => entries.reduce((sum, entry) => sum + entry.amountCents, 0);

const errorCode = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return null;
  } catch (error) {
    return isDomainError(error) ? error.code : "UNEXPECTED";
  }
};

describe("order finance and the store wallet", () => {
  it("records a paid order's sale, commission and fulfilment cost once each, and the owner keeps goods − wholesale − 10%", async () => {
    const { store, variant } = await storeWithProduct();
    const order = await paidOrder(store, variant.id, 2);

    // $100 of goods, $60 wholesale, 10% commission on the goods.
    expect(order.fulfilmentCostCents).toBe(6000);
    expect(order.commissionRateBps).toBe(1000);
    expect(order.commissionBase).toBe("ORDER_REVENUE");
    expect(order.commissionCents).toBe(1000);
    expect(order.ownerEarningCents).toBe(3000);
    expect(order.status).toBe(OrderStatus.ACCEPTED);
    expect(order.acceptedAt).not.toBeNull();

    const entries = await entriesOf(order.id);
    expect(entries.map((entry) => [entry.type, entry.amountCents, entry.status])).toEqual(
      expect.arrayContaining([
        [WalletEntryType.ORDER_SALE, 10000, WalletEntryStatus.CLEARED],
        [WalletEntryType.ORDER_COMMISSION, -1000, WalletEntryStatus.CLEARED],
        [WalletEntryType.ORDER_FULFILMENT, -6000, WalletEntryStatus.CLEARED],
      ]),
    );
    expect(entries).toHaveLength(3);
    expect(await getBalanceCents(store.id)).toBe(3000);
    expect(await getAvailableCents(store.id)).toBe(3000);

    // A replayed webhook, a retried acceptance and a second charge attempt change nothing.
    await processWebhook("sandbox", await webhookFor(order.id, `evt_replay_${order.id}`));
    await acceptOrderForFulfilment(order.id);
    const again = await db.$transaction((tx) => chargeOrderFulfilment(tx, order.id));
    expect(again).toMatchObject({ ok: true, alreadyCharged: true, chargedCents: 6000 });
    expect(await entriesOf(order.id)).toHaveLength(3);
    expect(await getBalanceCents(store.id)).toBe(3000);
  });

  it("stores the commission rate on the order, so a later change never rewrites orders already placed", async () => {
    const { store, variant } = await storeWithProduct();
    const before = await paidOrder(store, variant.id);
    await saveSettingsSection("platform", { commissionRateBps: 2000, commissionBase: "ORDER_REVENUE", requireReferralCode: true });
    try {
      const after = await paidOrder(store, variant.id);
      const unchanged = await db.order.findUniqueOrThrow({ where: { id: before.id } });
      expect(unchanged.commissionRateBps).toBe(1000);
      expect(unchanged.commissionCents).toBe(500);
      expect(after.commissionRateBps).toBe(2000);
      expect(after.commissionCents).toBe(1000);
      expect(after.ownerEarningCents).toBe(1000);
    } finally {
      await saveSettingsSection("platform", { commissionRateBps: 1000, commissionBase: "ORDER_REVENUE", requireReferralCode: true });
    }
  });

  it("can charge the commission on the owner's margin instead of the goods", async () => {
    const { store, variant } = await storeWithProduct();
    await saveSettingsSection("platform", { commissionRateBps: 1000, commissionBase: "OWNER_MARGIN", requireReferralCode: true });
    try {
      const order = await paidOrder(store, variant.id);
      // 10% of the $20 margin.
      expect(order.commissionBase).toBe("OWNER_MARGIN");
      expect(order.commissionCents).toBe(200);
      expect(order.ownerEarningCents).toBe(1800);
    } finally {
      await saveSettingsSection("platform", { commissionRateBps: 1000, commissionBase: "ORDER_REVENUE", requireReferralCode: true });
    }
  });

  it("funds a cash-on-delivery order from its own sale, and only makes the money withdrawable once delivered", async () => {
    const { store, variant } = await storeWithProduct();
    const order = await placeIn(store, variant.id, 1, "cod");
    expect(order.status).toBe(OrderStatus.ACCEPTED);

    const entries = await entriesOf(order.id);
    expect(entries.every((entry) => entry.status === WalletEntryStatus.PENDING)).toBe(true);
    expect(await getBalanceCents(store.id)).toBe(1500);
    expect(await getAvailableCents(store.id)).toBe(0);
    expect((await getWalletSummary(store.id)).pendingCents).toBe(1500);

    const admin = await staff();
    for (const status of [OrderStatus.PROCESSING, OrderStatus.PACKED, OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED]) {
      await updateOrderStatus(order.id, status, admin.id);
    }
    expect(await getAvailableCents(store.id)).toBe(1500);
    expect((await entriesOf(order.id)).every((entry) => entry.status === WalletEntryStatus.CLEARED)).toBe(true);
    // Still one of each: delivery clears the entries, it does not post new ones.
    expect(await entriesOf(order.id)).toHaveLength(3);
  });

  it("holds an order that cannot fund itself until a confirmed deposit covers it, then charges it exactly once", async () => {
    const { user, store, product, variant } = await storeWithProduct();
    // The owner sells a $30 item for $20: the order loses money and cannot pay for itself.
    await updateStoreProduct(store.id, product.id, { fixedPriceCents: 2000 }, { userId: user.id, asOwner: true });
    const order = await paidOrder(store, variant.id);

    expect(order.status).toBe(OrderStatus.AWAITING_FUNDS);
    expect(order.ownerEarningCents).toBe(-1200);
    // Sale ($20) less commission ($2) is in the balance; the $30 cost is not charged yet.
    expect(await getBalanceCents(store.id)).toBe(1800);
    expect(await fulfilmentShortfallCents(order.id)).toBe(1200);
    expect(await db.walletEntry.count({ where: { orderId: order.id, type: WalletEntryType.ORDER_FULFILMENT } })).toBe(0);

    // A deposit the owner merely declares does nothing.
    const deposit = await recordDeposit({ storeId: store.id, amountCents: 1200, method: "BANK_TRANSFER", reference: "TOPUP-1", createdById: user.id });
    expect(await acceptFundedOrders(store.id)).toEqual([]);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(OrderStatus.AWAITING_FUNDS);

    // Staff confirm the money arrived; several acceptance attempts race, and only one charge lands.
    const admin = await staff();
    await confirmDeposit(deposit.id, admin.id);
    await Promise.all([acceptFundedOrders(store.id), acceptOrderForFulfilment(order.id), acceptOrderForFulfilment(order.id), acceptOrderForFulfilment(order.id)]);

    const accepted = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(accepted.status).toBe(OrderStatus.ACCEPTED);
    expect(await db.walletEntry.count({ where: { orderId: order.id, type: WalletEntryType.ORDER_FULFILMENT } })).toBe(1);
    expect(await getBalanceCents(store.id)).toBe(0);

    const timeline = await db.orderEvent.findMany({ where: { orderId: order.id, type: "STATUS_CHANGED" }, orderBy: { createdAt: "asc" } });
    expect(timeline.map((event) => (event.data as { status?: string } | null)?.status)).toEqual(["CONFIRMED", "AWAITING_FUNDS", "ACCEPTED"]);
  });

  it("walks an accepted order through every fulfilment step, and refuses steps out of order", async () => {
    const { store, variant } = await storeWithProduct();
    const order = await paidOrder(store, variant.id);
    const admin = await staff();
    expect(await errorCode(updateOrderStatus(order.id, OrderStatus.DELIVERED, admin.id))).toBe("INVALID_TRANSITION");
    for (const status of [OrderStatus.PROCESSING, OrderStatus.PACKED, OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED]) {
      await updateOrderStatus(order.id, status, admin.id);
    }
    expect(await errorCode(updateOrderStatus(order.id, OrderStatus.PROCESSING, admin.id))).toBe("INVALID_TRANSITION");
    const events = await db.orderEvent.findMany({ where: { orderId: order.id, type: "STATUS_CHANGED" }, orderBy: { createdAt: "asc" } });
    expect(events.map((event) => (event.data as { status?: string } | null)?.status)).toEqual(["CONFIRMED", "ACCEPTED", "PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"]);
  });

  it("reverses a refund with compensating entries, in proportion, without touching the originals", async () => {
    const { store, variant } = await storeWithProduct();
    const order = await paidOrder(store, variant.id, 2);
    const originals = await entriesOf(order.id);
    const admin = await staff();

    // Half the order back first…
    await refundOrder(order.id, Math.round(order.totalCents / 2), "Half the parcel arrived damaged", admin.id);
    expect(await getBalanceCents(store.id)).toBe(1500);
    // …then the rest.
    const refreshed = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    await refundOrder(order.id, refreshed.totalCents - refreshed.refundedCents, "Customer returned the rest", admin.id);
    expect(await getBalanceCents(store.id)).toBe(0);

    const entries = await entriesOf(order.id);
    // The three original postings are still there, unchanged.
    for (const original of originals) expect(entries.find((entry) => entry.id === original.id)?.amountCents).toBe(original.amountCents);
    const reversals = entries.filter((entry) => !originals.some((original) => original.id === entry.id));
    expect(new Set(reversals.map((entry) => entry.type))).toEqual(new Set([WalletEntryType.ORDER_REFUND, WalletEntryType.FULFILMENT_REVERSAL, WalletEntryType.COMMISSION_REVERSAL]));
    expect(sumOf(entries)).toBe(0);
  });

  it("cancelling an unshipped cash-on-delivery order unwinds its pending entries", async () => {
    const { store, variant } = await storeWithProduct();
    const order = await placeIn(store, variant.id, 1, "cod");
    const admin = await staff();
    await cancelOrder(order.id, "Customer changed their mind", admin.id);
    expect(await getBalanceCents(store.id)).toBe(0);
    expect(await getAvailableCents(store.id)).toBe(0);
    // Cancelling twice is refused and posts nothing more.
    expect(await errorCode(cancelOrder(order.id, "again", admin.id))).toBe("NOT_CANCELLABLE");
    expect(sumOf(await entriesOf(order.id))).toBe(0);
  });

  it("holds a withdrawal against the available balance, returns it when declined and keeps it when paid", async () => {
    const { user, store, variant } = await storeWithProduct(20000, 10000);
    await paidOrder(store, variant.id); // $200 sale − $100 wholesale − $20 commission = $80

    // Cash on delivery still on its way cannot be withdrawn.
    await placeIn(store, variant.id, 1, "cod");
    expect(await getBalanceCents(store.id)).toBe(16000);
    expect(await getAvailableCents(store.id)).toBe(8000);

    expect(await errorCode(requestPayout({ storeId: store.id, amountCents: 9000, method: "PAYPAL", destination: "owner@example.com", requestedById: user.id }))).toBe("INSUFFICIENT_BALANCE");
    expect(await errorCode(requestPayout({ storeId: store.id, amountCents: MIN_PAYOUT_CENTS - 1, method: "PAYPAL", destination: "owner@example.com", requestedById: user.id }))).toBe("PAYOUT_TOO_SMALL");

    const payout = await requestPayout({ storeId: store.id, amountCents: 6000, method: "PAYPAL", destination: "owner@example.com", requestedById: user.id });
    expect(await getAvailableCents(store.id)).toBe(2000);
    expect((await getWalletSummary(store.id)).pendingPayoutCents).toBe(6000);

    const admin = await staff();
    await rejectPayout(payout.id, admin.id, "Wrong account details");
    expect(await getAvailableCents(store.id)).toBe(8000);
    expect((await db.payout.findUniqueOrThrow({ where: { id: payout.id } })).status).toBe(PayoutStatus.REJECTED);
    expect(await errorCode(rejectPayout(payout.id, admin.id, "twice"))).toBe("PAYOUT_SETTLED");

    const second = await requestPayout({ storeId: store.id, amountCents: 8000, method: "BANK_TRANSFER", destination: "IBAN GB00 0000", requestedById: user.id });
    await setPayoutStatus(second.id, PayoutStatus.APPROVED, admin.id);
    await setPayoutStatus(second.id, PayoutStatus.PROCESSING, admin.id);
    await markPayoutPaid(second.id, admin.id, "BACS 12345");
    expect(await getAvailableCents(store.id)).toBe(0);
    expect(await errorCode(markPayoutPaid(second.id, admin.id))).toBe("PAYOUT_SETTLED");
  });

  it("never lets two withdrawals spend the same money", async () => {
    const { user, store, variant } = await storeWithProduct(20000, 10000);
    await paidOrder(store, variant.id); // $80 available
    const attempts = await Promise.allSettled(
      Array.from({ length: 4 }, () => requestPayout({ storeId: store.id, amountCents: 6000, method: "PAYPAL", destination: "owner@example.com", requestedById: user.id })),
    );
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(await getAvailableCents(store.id)).toBe(2000);
  });

  it("credits a deposit only when staff confirm it arrived, and only once", async () => {
    const { user, store } = await storeWithProduct();
    const deposit = await recordDeposit({ storeId: store.id, amountCents: 5000, method: "BANK_TRANSFER", reference: "TRF-1", createdById: user.id });
    expect(await getBalanceCents(store.id)).toBe(0);
    expect((await getWalletSummary(store.id)).pendingDepositCount).toBe(1);

    const admin = await staff();
    await Promise.allSettled([confirmDeposit(deposit.id, admin.id), confirmDeposit(deposit.id, admin.id)]);
    expect(await getBalanceCents(store.id)).toBe(5000);
    expect(await db.walletEntry.count({ where: { depositId: deposit.id } })).toBe(1);
    expect((await db.deposit.findUniqueOrThrow({ where: { id: deposit.id } })).status).toBe(DepositStatus.CONFIRMED);
    expect((await getWalletSummary(store.id)).totalDepositedCents).toBe(5000);

    const declined = await recordDeposit({ storeId: store.id, amountCents: 2500, method: "BANK_TRANSFER", createdById: user.id });
    await rejectDeposit(declined.id, admin.id, "No transfer found");
    expect(await getBalanceCents(store.id)).toBe(5000);
    const rejected = await db.deposit.findUniqueOrThrow({ where: { id: declined.id } });
    expect(rejected.status).toBe(DepositStatus.REJECTED);
    expect(rejected.note).toBe("No transfer found");
    expect(await errorCode(confirmDeposit(declined.id, admin.id))).toBe("DEPOSIT_SETTLED");
  });

  it("records how a deposit was sent, and asks for proof when it was crypto", async () => {
    const { user, store } = await storeWithProduct();
    expect(await errorCode(recordDeposit({ storeId: store.id, amountCents: 5000, method: "CRYPTO", network: "USDT (TRC20)", createdById: user.id }))).toBe("PROOF_REQUIRED");
    const withHash = await recordDeposit({ storeId: store.id, amountCents: 5000, method: "CRYPTO", network: "USDT (TRC20)", reference: "0xabc123", createdById: user.id });
    expect(withHash.method).toBe("CRYPTO");
    expect(withHash.network).toBe("USDT (TRC20)");
    expect(await getBalanceCents(store.id)).toBe(0);
  });

  it("summarises earnings for today, this week and this month, and the ledger carries a running balance", async () => {
    const { store, variant } = await storeWithProduct();
    await paidOrder(store, variant.id);
    await paidOrder(store, variant.id);

    const summary = await getWalletSummary(store.id);
    expect(summary.balanceCents).toBe(3000);
    expect(summary.earnedTodayCents).toBe(3000);
    expect(summary.earnedThisWeekCents).toBe(3000);
    expect(summary.earnedThisMonthCents).toBe(3000);
    expect(summary.fulfilmentChargedCents).toBe(-6000);
    expect(summary.commissionChargedCents).toBe(-1000);

    const history = await listWalletEntries(store.id);
    expect(history.entries).toHaveLength(6);
    expect(history.entries[0].balanceAfterCents).toBe(3000);
    expect(history.entries.at(-1)?.balanceAfterCents).toBe(5000); // the first sale on its own
  });

  it("keeps each store's balance to itself and gives the platform store no ledger at all", async () => {
    const mine = await storeWithProduct();
    const theirs = await storeWithProduct();
    await paidOrder(mine.store, mine.variant.id);
    expect(await getBalanceCents(mine.store.id)).toBe(1500);
    expect(await getBalanceCents(theirs.store.id)).toBe(0);

    const platform = await db.store.findFirstOrThrow({ where: { ownerId: null } });
    const { variant } = await createProduct({ priceCents: 4000, stock: 5 });
    await db.productVariant.update({ where: { id: variant.id }, data: { costCents: 1000 } });
    const order = await paidOrder(platform, variant.id);
    expect(order.status).toBe(OrderStatus.ACCEPTED);
    expect(order.commissionCents).toBe(0);
    expect(await db.walletEntry.count({ where: { storeId: platform.id } })).toBe(0);
  });
});
