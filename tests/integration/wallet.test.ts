import { describe, expect, it } from "vitest";
import { addItem, createGuestCart } from "@/features/cart/service";
import { acceptOrder, cancelOrder, INSUFFICIENT_BALANCE_MESSAGE, markPaidManually, placeOrder, processWebhook, refundOrder, resumePayment, updateOrderStatus } from "@/features/orders/service";
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

/** A real TRON address (the USDT contract) — withdrawals only go to addresses whose checksum is right. */
const TRC20_ADDRESS = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

/** The store's owner presses Accept (Zendropship staff do, for the platform's own store). */
async function accept(orderId: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { store: { select: { ownerId: true } } } });
  const ownerId = order.store.ownerId;
  return acceptOrder(orderId, ownerId ? { userId: ownerId, as: "owner" } : { userId: (await staff()).id, as: "staff" });
}

/** A paid order its owner has accepted. */
async function acceptedOrder(store: { id: string }, variantId: string, quantity = 1) {
  const order = await paidOrder(store, variantId, quantity);
  await accept(order.id);
  return db.order.findUniqueOrThrow({ where: { id: order.id } });
}

const LADDER: OrderStatus[] = [OrderStatus.PROCESSING, OrderStatus.PACKED, OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED];

/** The owner accepts the order if they have not yet, then staff take it step by step to the customer's door. */
async function deliver(orderId: string) {
  const admin = await staff();
  let { status } = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
  if (status === OrderStatus.CONFIRMED || status === OrderStatus.AWAITING_FUNDS) {
    await accept(orderId);
    status = OrderStatus.PROCESSING;
  }
  for (const next of LADDER.slice(LADDER.indexOf(status) + 1)) await updateOrderStatus(orderId, next, admin.id);
}

/** The owner deposits and staff confirm it: money in the available balance. */
async function fund(store: { id: string }, userId: string, amountCents: number) {
  const deposit = await recordDeposit({ storeId: store.id, amountCents, method: "BANK_TRANSFER", reference: `FUND-${amountCents}`, createdById: userId });
  await confirmDeposit(deposit.id, (await staff()).id);
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
    // Paid, and waiting for the owner: the payment confirmed the order, it did not accept it.
    expect(order.status).toBe(OrderStatus.CONFIRMED);
    expect(order.acceptedAt).toBeNull();
    expect(await db.walletEntry.count({ where: { orderId: order.id, type: WalletEntryType.ORDER_FULFILMENT } })).toBe(0);

    // The owner accepts: the customer's payment covers the wholesale cost, and the order goes to processing.
    const { outcome } = await accept(order.id);
    expect(outcome).toMatchObject({ already: false, chargedCents: 6000, fromBalanceCents: 0 });
    const accepted = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(accepted.status).toBe(OrderStatus.PROCESSING);
    expect(accepted.acceptedAt).not.toBeNull();

    // Everything the order did is held.
    const entries = await entriesOf(order.id);
    expect(entries.map((entry) => [entry.type, entry.amountCents, entry.status])).toEqual(
      expect.arrayContaining([
        [WalletEntryType.ORDER_SALE, 10000, WalletEntryStatus.PENDING],
        [WalletEntryType.ORDER_COMMISSION, -1000, WalletEntryStatus.PENDING],
        [WalletEntryType.ORDER_FULFILMENT, -6000, WalletEntryStatus.PENDING],
      ]),
    );
    expect(entries).toHaveLength(3);
    expect(await getBalanceCents(store.id)).toBe(3000);
    // Nothing is the owner's to withdraw until the parcel arrives.
    expect(await getAvailableCents(store.id)).toBe(0);
    expect((await getWalletSummary(store.id)).earnedTodayCents).toBe(0);

    // A replayed webhook, a retried acceptance and a second charge attempt change nothing.
    await processWebhook("sandbox", await webhookFor(order.id, `evt_replay_${order.id}`));
    expect((await accept(order.id)).outcome).toEqual({ already: true });
    const again = await db.$transaction((tx) => chargeOrderFulfilment(tx, order.id));
    expect(again).toMatchObject({ ok: true, alreadyCharged: true, chargedCents: 6000, fromBalanceCents: 0 });
    expect(await entriesOf(order.id)).toHaveLength(3);
    expect(await getBalanceCents(store.id)).toBe(3000);

    // Delivered: the $30 profit becomes the owner's, and nothing new is posted to get there.
    await deliver(order.id);
    expect(await getAvailableCents(store.id)).toBe(3000);
    expect((await entriesOf(order.id)).every((entry) => entry.status === WalletEntryStatus.CLEARED)).toBe(true);
    expect(await entriesOf(order.id)).toHaveLength(3);
    expect((await getWalletSummary(store.id)).earnedTodayCents).toBe(3000);
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

  it("takes a cash-on-delivery order's cost from the available balance at once, and pays out only on delivery", async () => {
    const { user, store, variant } = await storeWithProduct();

    // Nobody has collected any money for this order yet, so an empty wallet genuinely cannot pay its $30 cost.
    const waiting = await placeIn(store, variant.id, 1, "cod");
    expect(waiting.status).toBe(OrderStatus.CONFIRMED);
    expect(await fulfilmentShortfallCents(waiting.id)).toBe(3000);
    // The owner presses Accept anyway: refused, with nothing written — no charge, no status change.
    const refused = accept(waiting.id);
    await expect(refused).rejects.toThrow(INSUFFICIENT_BALANCE_MESSAGE);
    expect(await errorCode(accept(waiting.id))).toBe("INSUFFICIENT_BALANCE");
    expect((await db.order.findUniqueOrThrow({ where: { id: waiting.id } })).status).toBe(OrderStatus.CONFIRMED);
    expect(await db.walletEntry.count({ where: { orderId: waiting.id } })).toBe(0);

    // The owner adds $50. That accepts nothing — the order is still waiting for them.
    await fund(store, user.id, 5000);
    expect((await db.order.findUniqueOrThrow({ where: { id: waiting.id } })).status).toBe(OrderStatus.CONFIRMED);
    // Now they accept (twice at once, as a double click would): the $30 is set aside once, and it goes to processing.
    await Promise.all([accept(waiting.id), accept(waiting.id)]);
    expect((await db.order.findUniqueOrThrow({ where: { id: waiting.id } })).status).toBe(OrderStatus.PROCESSING);
    const fulfilment = await db.walletEntry.findMany({ where: { orderId: waiting.id, type: WalletEntryType.ORDER_FULFILMENT } });
    expect(fulfilment.map((entry) => [entry.amountCents, entry.status])).toEqual([[-3000, WalletEntryStatus.CLEARED]]);
    expect(await getAvailableCents(store.id)).toBe(2000);
    const acceptedLine = await db.orderEvent.findFirst({ where: { orderId: waiting.id, message: { startsWith: "Accepted by" } } });
    expect(acceptedLine?.message).toBe("Accepted by the store owner — $30.00 wholesale cost set aside from the store balance");
    // The sale and commission are held: shown, not spendable, and not earnings yet.
    expect((await getWalletSummary(store.id)).pendingCents).toBe(4500);
    expect((await getWalletSummary(store.id)).earnedThisMonthCents).toBe(0);
    expect(await errorCode(requestPayout({ storeId: store.id, amountCents: 2100, method: "USDT_TRC20", destination: TRC20_ADDRESS, requestedById: user.id }))).toBe("INSUFFICIENT_BALANCE");

    // Delivered: the courier's cash comes in, and the owner has the deposit back plus the $15 profit.
    await deliver(waiting.id);
    expect(await getAvailableCents(store.id)).toBe(6500);
    expect((await getWalletSummary(store.id)).pendingCents).toBe(0);
    expect((await getWalletSummary(store.id)).earnedThisMonthCents).toBe(1500);
    expect((await entriesOf(waiting.id)).every((entry) => entry.status === WalletEntryStatus.CLEARED)).toBe(true);
    // Delivering clears entries; it posts nothing, so doing it again cannot pay twice.
    expect(await entriesOf(waiting.id)).toHaveLength(3);
  });

  it("gives set-aside money straight back when an accepted cash-on-delivery order is cancelled", async () => {
    const { user, store, variant } = await storeWithProduct();
    await fund(store, user.id, 5000);
    const order = await placeIn(store, variant.id, 1, "cod");
    expect(order.status).toBe(OrderStatus.CONFIRMED);
    expect(await getAvailableCents(store.id)).toBe(5000);
    await accept(order.id);
    expect(await getAvailableCents(store.id)).toBe(2000);

    await cancelOrder(order.id, "Customer refused the parcel", (await staff()).id);
    // The $30 comes back to what can be spent, and the held sale is gone.
    expect(await getAvailableCents(store.id)).toBe(5000);
    expect(await getBalanceCents(store.id)).toBe(5000);
    expect(sumOf(await entriesOf(order.id))).toBe(0);
  });

  it("holds an order that cannot fund itself until a confirmed deposit covers it, then charges it exactly once", async () => {
    const { user, store, product, variant } = await storeWithProduct();
    // The owner sells a $30 item for $20: the order loses money and cannot pay for itself.
    await updateStoreProduct(store.id, product.id, { fixedPriceCents: 2000 }, { userId: user.id, asOwner: true });
    const order = await paidOrder(store, variant.id);

    expect(order.status).toBe(OrderStatus.CONFIRMED);
    expect(order.ownerEarningCents).toBe(-1200);
    // Sale ($20) less commission ($2) is in the balance; the $30 cost is not charged yet.
    expect(await getBalanceCents(store.id)).toBe(1800);
    expect(await fulfilmentShortfallCents(order.id)).toBe(1200);
    expect(await errorCode(accept(order.id))).toBe("INSUFFICIENT_BALANCE");
    expect(await db.walletEntry.count({ where: { orderId: order.id, type: WalletEntryType.ORDER_FULFILMENT } })).toBe(0);

    // A deposit the owner merely declares changes nothing: Accept is still refused.
    const deposit = await recordDeposit({ storeId: store.id, amountCents: 1200, method: "BANK_TRANSFER", reference: "TOPUP-1", createdById: user.id });
    expect(await errorCode(accept(order.id))).toBe("INSUFFICIENT_BALANCE");

    // Staff confirm the money arrived — the order still waits for its owner. Four Accepts race; one charge lands.
    const admin = await staff();
    await confirmDeposit(deposit.id, admin.id);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(OrderStatus.CONFIRMED);
    const results = await Promise.all([accept(order.id), accept(order.id), accept(order.id), accept(order.id)]);
    expect(results.filter((result) => !result.outcome.already)).toHaveLength(1);

    const accepted = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(accepted.status).toBe(OrderStatus.PROCESSING);
    // One $30 charge, paid for in two parts: $18 from the customer's own payment (held with the order) and
    // the $12 the order could not cover, taken from the owner's balance at once.
    const charge = await db.walletEntry.findMany({ where: { orderId: order.id, type: WalletEntryType.ORDER_FULFILMENT }, orderBy: { amountCents: "asc" } });
    expect(charge.map((entry) => [entry.amountCents, entry.status])).toEqual([
      [-1800, WalletEntryStatus.PENDING],
      [-1200, WalletEntryStatus.CLEARED],
    ]);
    expect(await getBalanceCents(store.id)).toBe(0);
    expect(await getAvailableCents(store.id)).toBe(0);

    const timeline = await db.orderEvent.findMany({ where: { orderId: order.id, type: "STATUS_CHANGED" }, orderBy: { createdAt: "asc" } });
    expect(timeline.map((event) => (event.data as { status?: string } | null)?.status)).toEqual(["CONFIRMED", "ACCEPTED", "PROCESSING"]);
    // The history says who accepted it and where the money came from.
    expect(timeline[1].message).toBe("Accepted by the store owner — $30.00 wholesale cost set aside: $18.00 from the customer's payment, $12.00 from the store balance");
    expect(timeline[1].actorId).toBe(user.id);
  });

  it("walks an accepted order through every fulfilment step, and refuses steps out of order", async () => {
    const { store, variant } = await storeWithProduct();
    const order = await paidOrder(store, variant.id);
    const admin = await staff();
    expect(await errorCode(updateOrderStatus(order.id, OrderStatus.DELIVERED, admin.id))).toBe("INVALID_TRANSITION");
    expect(await errorCode(updateOrderStatus(order.id, OrderStatus.PROCESSING, admin.id))).toBe("INVALID_TRANSITION");
    // No status change stands in for the owner's Accept.
    expect(await errorCode(updateOrderStatus(order.id, OrderStatus.ACCEPTED, admin.id))).toBe("ACCEPT_SEPARATELY");
    await accept(order.id);
    // Accepted puts it in processing; every step after that is taken by hand, one at a time.
    expect(await errorCode(updateOrderStatus(order.id, OrderStatus.DELIVERED, admin.id))).toBe("INVALID_TRANSITION");
    for (const status of [OrderStatus.PACKED, OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED]) {
      await updateOrderStatus(order.id, status, admin.id);
    }
    expect(await errorCode(updateOrderStatus(order.id, OrderStatus.PROCESSING, admin.id))).toBe("INVALID_TRANSITION");
    const events = await db.orderEvent.findMany({ where: { orderId: order.id, type: "STATUS_CHANGED" }, orderBy: { createdAt: "asc" } });
    expect(events.map((event) => (event.data as { status?: string } | null)?.status)).toEqual(["CONFIRMED", "ACCEPTED", "PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"]);
  });

  it("reverses a refund with compensating entries, in proportion, without touching the originals", async () => {
    const { store, variant } = await storeWithProduct();
    const order = await acceptedOrder(store, variant.id, 2);
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
    const delivered = await paidOrder(store, variant.id); // $200 sale − $100 wholesale − $20 commission = $80
    await deliver(delivered.id);

    // An order that has not been delivered yet holds its $80: shown in the balance, not withdrawable.
    await acceptedOrder(store, variant.id);
    expect(await getBalanceCents(store.id)).toBe(16000);
    expect(await getAvailableCents(store.id)).toBe(8000);

    const trc20 = { method: "USDT_TRC20" as const, destination: TRC20_ADDRESS, requestedById: user.id, storeId: store.id };
    expect(await errorCode(requestPayout({ ...trc20, amountCents: 9000 }))).toBe("INSUFFICIENT_BALANCE");
    expect(await errorCode(requestPayout({ ...trc20, amountCents: MIN_PAYOUT_CENTS - 1 }))).toBe("PAYOUT_TOO_SMALL");

    const payout = await requestPayout({ ...trc20, amountCents: 6000 });
    expect(await getAvailableCents(store.id)).toBe(2000);
    expect((await getWalletSummary(store.id)).pendingPayoutCents).toBe(6000);

    const admin = await staff();
    await rejectPayout(payout.id, admin.id, "Wrong account details");
    expect(await getAvailableCents(store.id)).toBe(8000);
    expect((await db.payout.findUniqueOrThrow({ where: { id: payout.id } })).status).toBe(PayoutStatus.REJECTED);
    expect(await errorCode(rejectPayout(payout.id, admin.id, "twice"))).toBe("PAYOUT_SETTLED");

    const second = await requestPayout({ ...trc20, amountCents: 8000 });
    expect(second.method).toBe("USDT_TRC20");
    expect(second.destination).toBe(TRC20_ADDRESS);
    await setPayoutStatus(second.id, PayoutStatus.APPROVED, admin.id);
    await setPayoutStatus(second.id, PayoutStatus.PROCESSING, admin.id);
    await markPayoutPaid(second.id, admin.id, "a".repeat(64));
    expect(await getAvailableCents(store.id)).toBe(0);
    expect(await errorCode(markPayoutPaid(second.id, admin.id))).toBe("PAYOUT_SETTLED");
  });

  it("pays withdrawals in USDT on TRC20 only, and only to a real TRON address", async () => {
    const { user, store } = await storeWithProduct();
    await fund(store, user.id, 5000);
    const request = { storeId: store.id, amountCents: 2000, requestedById: user.id };
    expect(await errorCode(requestPayout({ ...request, method: "PAYPAL", destination: "owner@example.com" }))).toBe("PAYOUT_METHOD");
    expect(await errorCode(requestPayout({ ...request, method: "BANK_TRANSFER", destination: "IBAN GB00 0000" }))).toBe("PAYOUT_METHOD");
    // One character off: it looks like an address, but its checksum gives it away before any money moves.
    const typo = TRC20_ADDRESS.slice(0, 10) + (TRC20_ADDRESS[10] === "8" ? "9" : "8") + TRC20_ADDRESS.slice(11);
    expect(await errorCode(requestPayout({ ...request, method: "USDT_TRC20", destination: typo }))).toBe("PAYOUT_ADDRESS");
    expect(await errorCode(requestPayout({ ...request, method: "USDT_TRC20", destination: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e" }))).toBe("PAYOUT_ADDRESS");
    expect(await getAvailableCents(store.id)).toBe(5000);
    expect(await db.payout.count({ where: { storeId: store.id } })).toBe(0);
  });

  it("never lets two withdrawals spend the same money", async () => {
    const { user, store, variant } = await storeWithProduct(20000, 10000);
    const order = await paidOrder(store, variant.id);
    await deliver(order.id); // $80 available
    const attempts = await Promise.allSettled(
      Array.from({ length: 4 }, () => requestPayout({ storeId: store.id, amountCents: 6000, method: "USDT_TRC20", destination: TRC20_ADDRESS, requestedById: user.id })),
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

  it("takes Binance TRC20 deposits with a real transaction id or a screenshot, and credits them only on approval", async () => {
    const { user, store } = await storeWithProduct();
    const base = { storeId: store.id, amountCents: 5000, method: "USDT_TRC20" as const, createdById: user.id };
    expect(await errorCode(recordDeposit(base))).toBe("PROOF_REQUIRED");
    expect(await errorCode(recordDeposit({ ...base, reference: "0xabc123" }))).toBe("TXID_INVALID");

    const txid = "7c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d";
    const deposit = await recordDeposit({ ...base, reference: txid });
    expect(deposit.method).toBe("USDT_TRC20");
    expect(deposit.network).toBe("USDT (TRC20)");
    expect(await getBalanceCents(store.id)).toBe(0);

    await confirmDeposit(deposit.id, (await staff()).id);
    expect(await getAvailableCents(store.id)).toBe(5000);
    expect(await db.walletEntry.count({ where: { depositId: deposit.id } })).toBe(1);
  });

  it("summarises earnings for today, this week and this month, and the ledger carries a running balance", async () => {
    const { store, variant } = await storeWithProduct();
    const first = await paidOrder(store, variant.id);
    const second = await paidOrder(store, variant.id);

    // Paid but not delivered: held, and not earnings yet.
    expect((await getWalletSummary(store.id)).earnedTodayCents).toBe(0);
    await deliver(first.id);
    await deliver(second.id);

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
    await acceptedOrder(mine.store, mine.variant.id);
    expect(await getBalanceCents(mine.store.id)).toBe(1500);
    expect(await getBalanceCents(theirs.store.id)).toBe(0);

    const platform = await db.store.findFirstOrThrow({ where: { ownerId: null } });
    const { variant } = await createProduct({ priceCents: 4000, stock: 5 });
    await db.productVariant.update({ where: { id: variant.id }, data: { costCents: 1000 } });
    const order = await paidOrder(platform, variant.id);
    // Zendropship's own store has no owner: its orders wait for staff to accept them, and nothing is charged.
    expect(order.status).toBe(OrderStatus.CONFIRMED);
    expect(order.commissionCents).toBe(0);
    await accept(order.id);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(OrderStatus.PROCESSING);
    expect(await db.walletEntry.count({ where: { storeId: platform.id } })).toBe(0);
  });
});

describe("accepting an order", () => {
  const acceptedEvents = (orderId: string) => db.orderEvent.count({ where: { orderId, type: "STATUS_CHANGED", message: { startsWith: "Accepted" } } });

  it("never happens on its own: payments, webhooks, cash on delivery, staff confirmations, deposits and jobs all leave the order waiting", async () => {
    const { user, store, variant } = await storeWithProduct();
    const admin = await staff();

    // A card order, paid through the signed webhook — and the same webhook delivered again.
    const card = await paidOrder(store, variant.id);
    await processWebhook("sandbox", await webhookFor(card.id, `evt_again_${card.id}`));
    // Cash on delivery, confirmed the moment it is placed.
    const cod = await placeIn(store, variant.id, 1, "cod");
    // Staff record a cash payment on it.
    await markPaidManually(cod.id, admin.id, "Cash collected early");
    // A card order the customer switches to cash on delivery.
    const switched = await placeIn(store, variant.id);
    await resumePayment(switched.id, "http://localhost:3000", "cod");
    // Money arrives in the wallet, and the scheduled jobs run.
    await fund(store, user.id, 50_000);
    const { runJobs } = await import("@/server/jobs");
    await runJobs();

    for (const { id } of [card, cod, switched]) {
      const order = await db.order.findUniqueOrThrow({ where: { id } });
      expect(order.status).toBe(OrderStatus.CONFIRMED);
      expect(order.acceptedAt).toBeNull();
      expect(await acceptedEvents(id)).toBe(0);
      expect(await db.walletEntry.count({ where: { orderId: id, type: WalletEntryType.ORDER_FULFILMENT } })).toBe(0);
    }
    // All the money is still there, untouched by any order.
    expect(await getAvailableCents(store.id)).toBe(50_000);
  });

  it("is the store owner's alone: staff, another owner and a plain status change are all refused", async () => {
    const { store, variant } = await storeWithProduct();
    const stranger = await storeWithProduct();
    const order = await paidOrder(store, variant.id);
    const admin = await staff();

    expect(await errorCode(acceptOrder(order.id, { userId: admin.id, as: "staff" }))).toBe("NOT_YOURS_TO_ACCEPT");
    expect(await errorCode(acceptOrder(order.id, { userId: stranger.user.id, as: "owner" }))).toBe("NOT_YOURS_TO_ACCEPT");
    expect(await errorCode(updateOrderStatus(order.id, OrderStatus.ACCEPTED, admin.id))).toBe("ACCEPT_SEPARATELY");
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(OrderStatus.CONFIRMED);
    expect(await db.walletEntry.count({ where: { orderId: order.id, type: WalletEntryType.ORDER_FULFILMENT } })).toBe(0);
  });

  it("is refused for an order the customer has not paid for, or one that was cancelled", async () => {
    const { store, variant } = await storeWithProduct();
    const unpaid = await placeIn(store, variant.id);
    expect(unpaid.status).toBe(OrderStatus.PENDING);
    expect(await errorCode(accept(unpaid.id))).toBe("UNPAID");

    const cancelled = await placeIn(store, variant.id, 1, "cod");
    await cancelOrder(cancelled.id, "Customer changed their mind", (await staff()).id);
    expect(await errorCode(accept(cancelled.id))).toBe("CANCELLED");
    expect(await db.walletEntry.count({ where: { orderId: { in: [unpaid.id, cancelled.id] }, type: WalletEntryType.ORDER_FULFILMENT } })).toBe(0);
  });

  it("takes the money once however many times Accept is pressed — together, or again after a refresh", async () => {
    const { user, store, variant } = await storeWithProduct();
    await fund(store, user.id, 10_000);
    const order = await placeIn(store, variant.id, 1, "cod");

    const results = await Promise.all(Array.from({ length: 5 }, () => accept(order.id)));
    expect(results.filter((result) => !result.outcome.already)).toHaveLength(1);
    // Pressed again later — a refresh, a retry: nothing changes.
    expect((await accept(order.id)).outcome).toEqual({ already: true });

    expect(await db.walletEntry.count({ where: { orderId: order.id, type: WalletEntryType.ORDER_FULFILMENT } })).toBe(1);
    expect(await getAvailableCents(store.id)).toBe(7000);
    expect(await acceptedEvents(order.id)).toBe(1);
    expect(await db.orderEvent.count({ where: { orderId: order.id, type: "STATUS_CHANGED", data: { path: ["status"], equals: "PROCESSING" } } })).toBe(1);
    expect(await db.auditLog.count({ where: { entityId: order.id, action: "order.accept" } })).toBe(1);

    // Accepted, then processing — recorded in that order, both by the owner.
    const timeline = await db.orderEvent.findMany({ where: { orderId: order.id, type: "STATUS_CHANGED" }, orderBy: { createdAt: "asc" } });
    expect(timeline.map((event) => (event.data as { status?: string } | null)?.status)).toEqual(["CONFIRMED", "ACCEPTED", "PROCESSING"]);
    expect(timeline.slice(1).every((event) => event.actorId === user.id)).toBe(true);

    // Delivered: the $30 set aside comes back with the $15 profit, once.
    await deliver(order.id);
    expect(await getAvailableCents(store.id)).toBe(11_500);
  });
});
