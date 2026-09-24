import { describe, expect, it } from "vitest";
import { addItem, createGuestCart } from "@/features/cart/service";
import { fulfilmentProgress, isFulfilmentComplete, nextFulfilmentStep } from "@/features/orders/progress";
import { acceptOrder, cancelOrder, placeOrder, processWebhook, updateOrderStatus } from "@/features/orders/service";
import { openStoreForNewOwner } from "@/features/stores/onboarding";
import { getStoreOrder, listStoreOrders } from "@/features/stores/dashboard";
import { addProductsToStore } from "@/features/stores/service";
import { confirmDeposit, fulfilmentShortfallCents, getAvailableCents, getBalanceCents, recordDeposit } from "@/features/wallet/service";
import { OrderStatus, WalletEntryType } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { isDomainError } from "@/server/errors";
import { createProduct, invitation, orderContext, orderInput, sandboxGateway } from "./helpers";

let sequence = 0;

async function staff(email = "fulfilment.staff@example.com", firstName = "Fern") {
  const role = await db.role.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } });
  return db.user.upsert({ where: { email }, create: { email, firstName, lastName: "Staff", roleId: role.id }, update: {} });
}

async function storeWithProduct(priceCents = 5000, costCents = 3000) {
  sequence += 1;
  const { user, store } = await openStoreForNewOwner({
    storeName: `Fulfilment Store ${sequence}`,
    firstName: "Fifi",
    lastName: "Owner",
    email: `fulfilment.${sequence}.${Date.now()}@example.com`,
    password: "Correct-horse-battery-7",
    referralCode: await invitation(),
  });
  const { product, variant } = await createProduct({ priceCents, stock: 20 });
  await db.productVariant.update({ where: { id: variant.id }, data: { costCents } });
  await addProductsToStore(store.id, [product.id], { userId: user.id, asOwner: true });
  return { user, store, variant };
}

async function codOrder(store: { id: string }, variantId: string) {
  const { cart } = await createGuestCart(store.id);
  await addItem(cart.id, variantId, 1);
  const outcome = await placeOrder(await orderInput({ paymentProvider: "cod" }), orderContext(cart.id));
  return db.order.findUniqueOrThrow({ where: { id: outcome.result.orderId } });
}

/** An order the customer has paid by card, through the sandbox gateway's signed webhook. */
async function paidOrder(store: { id: string }, variantId: string) {
  const { cart } = await createGuestCart(store.id);
  await addItem(cart.id, variantId, 1);
  const outcome = await placeOrder(await orderInput({ paymentProvider: "sandbox" }), orderContext(cart.id));
  const payment = await db.payment.findFirstOrThrow({ where: { orderId: outcome.result.orderId } });
  await processWebhook(
    "sandbox",
    await sandboxGateway().buildWebhookRequest({ id: `evt_${payment.id}`, type: "succeeded", providerReference: payment.providerReference!, amountCents: payment.amountCents, currency: "USD" }),
  );
  return db.order.findUniqueOrThrow({ where: { id: outcome.result.orderId } });
}

/**
 * A cash-on-delivery order's cost comes out of the owner's available balance, since nobody has collected
 * the customer's cash yet: the owner deposits and staff confirm it.
 */
async function fund(store: { id: string }, userId: string, amountCents: number) {
  const deposit = await recordDeposit({ storeId: store.id, amountCents, method: "BANK_TRANSFER", reference: `FUND-${amountCents}`, createdById: userId });
  await confirmDeposit(deposit.id, (await staff()).id);
}

/** The owner of the order's store presses Accept. */
async function ownerAccepts(orderId: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { store: { select: { ownerId: true } } } });
  return acceptOrder(orderId, { userId: order.store.ownerId!, as: "owner" });
}

/** An order the old automatic acceptance left waiting for funds, as it may still sit in a live database. */
async function asLegacyAwaitingFunds(orderId: string) {
  return db.order.update({ where: { id: orderId }, data: { status: OrderStatus.AWAITING_FUNDS } });
}

const errorCode = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return null;
  } catch (error) {
    return isDomainError(error) ? error.code : "UNEXPECTED";
  }
};

const progressOf = async (orderId: string) => {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { events: { orderBy: { createdAt: "asc" }, include: { actor: { select: { firstName: true, lastName: true } } } } },
  });
  return { order, stages: fulfilmentProgress(order) };
};

describe("fulfilment workflow", () => {
  const ownerStore = { ownerAccepts: true };

  it("walks an order from the owner's Accept to delivered, recording who moved it and when", async () => {
    const { user, store, variant } = await storeWithProduct();
    await fund(store, user.id, 3000);
    const order = await codOrder(store, variant.id);
    const admin = await staff();

    // Nothing moves until the owner accepts: staff have no step to take on it.
    expect(order.status).toBe(OrderStatus.CONFIRMED);
    expect(nextFulfilmentStep(order.status, ownerStore)).toBeNull();
    await ownerAccepts(order.id);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(OrderStatus.PROCESSING);

    for (const status of [OrderStatus.PACKED, OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED]) {
      expect(nextFulfilmentStep((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status, ownerStore)?.status).toBe(status);
      await updateOrderStatus(order.id, status, admin.id);
    }

    const { order: finished, stages } = await progressOf(order.id);
    expect(finished.status).toBe(OrderStatus.DELIVERED);
    expect(finished.deliveredAt).not.toBeNull();
    expect(isFulfilmentComplete(finished.status)).toBe(true);
    expect(nextFulfilmentStep(finished.status, ownerStore)).toBeNull();

    // Every stage is done, timed and attributed: confirmation to the system, acceptance to the owner, the rest to staff.
    expect(stages.map((stage) => stage.status)).toEqual(["PENDING", "CONFIRMED", "ACCEPTED", "PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"]);
    expect(stages.every((stage) => stage.done && stage.at !== null)).toBe(true);
    expect(stages.find((stage) => stage.status === "CONFIRMED")?.by).toBeNull();
    expect(stages.find((stage) => stage.status === "ACCEPTED")?.by).toBe("Fifi Owner");
    expect(stages.find((stage) => stage.status === "PACKED")?.by).toBe("Fern Staff");
    expect(stages.find((stage) => stage.status === "DELIVERED")?.by).toBe("Fern Staff");
    const times = stages.map((stage) => stage.at!.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);

    // Delivered is the end of the road: the $30 set aside comes back with the sale, less commission.
    expect(await errorCode(updateOrderStatus(order.id, OrderStatus.PROCESSING, admin.id))).toBe("INVALID_TRANSITION");
    expect(await getAvailableCents(store.id)).toBe(3000 + (5000 - 3000 - 500));
  });

  it("refuses to skip stages, and keeps the order where it was", async () => {
    const { user, store, variant } = await storeWithProduct();
    await fund(store, user.id, 3000);
    const order = await codOrder(store, variant.id);
    const admin = await staff();

    // Before the owner accepts, staff cannot move it anywhere — not even to processing.
    for (const invalid of [OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED]) {
      expect(await errorCode(updateOrderStatus(order.id, invalid, admin.id))).toBe("INVALID_TRANSITION");
    }
    await ownerAccepts(order.id);
    for (const invalid of [OrderStatus.DELIVERED, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CONFIRMED]) {
      expect(await errorCode(updateOrderStatus(order.id, invalid, admin.id))).toBe("INVALID_TRANSITION");
    }
    const unchanged = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(unchanged.status).toBe(OrderStatus.PROCESSING);
    // Only the real moves so far (confirmed, accepted, processing); the refused ones wrote nothing.
    expect(await db.orderEvent.count({ where: { orderId: order.id, type: "STATUS_CHANGED" } })).toBe(3);

    // Jumping ahead is allowed only where the rules say so: processing straight to shipped.
    await updateOrderStatus(order.id, OrderStatus.SHIPPED, admin.id);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(OrderStatus.SHIPPED);
  });

  it("stops a cancelled order dead: no further fulfilment, no Accept, and nothing charged to the owner", async () => {
    const { store, variant } = await storeWithProduct();
    const order = await codOrder(store, variant.id);
    const admin = await staff();
    await cancelOrder(order.id, "Customer changed their mind", admin.id);

    const cancelled = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(cancelled.status).toBe(OrderStatus.CANCELLED);
    expect(nextFulfilmentStep(cancelled.status, ownerStore)).toBeNull();
    for (const status of [OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.ACCEPTED]) {
      expect(await errorCode(updateOrderStatus(order.id, status, admin.id))).toBe("INVALID_TRANSITION");
    }
    expect(await errorCode(ownerAccepts(order.id))).toBe("CANCELLED");
    expect(await getBalanceCents(store.id)).toBe(0);
    const { stages } = await progressOf(order.id);
    expect(stages.every((stage) => !stage.done)).toBe(true);
  });

  it("lets the owner accept an order the customer has paid for without depositing anything", async () => {
    const { store, variant } = await storeWithProduct(16800, 9240);
    const placed = await paidOrder(store, variant.id);
    expect(placed.status).toBe(OrderStatus.CONFIRMED);
    expect(await getAvailableCents(store.id)).toBe(0);

    await ownerAccepts(placed.id);

    const accepted = await db.order.findUniqueOrThrow({ where: { id: placed.id } });
    expect(accepted.status).toBe(OrderStatus.PROCESSING);
    expect(accepted.acceptedAt).not.toBeNull();
    // Zendropship already holds the customer's money: that pays the wholesale cost, and the owner's empty
    // wallet is never asked for anything.
    const entries = await db.walletEntry.findMany({ where: { orderId: placed.id } });
    expect(entries.map((entry) => entry.type).sort()).toEqual([WalletEntryType.ORDER_COMMISSION, WalletEntryType.ORDER_FULFILMENT, WalletEntryType.ORDER_SALE].sort());
    expect(await db.deposit.count({ where: { storeId: store.id } })).toBe(0);

    // Accepting again changes nothing.
    expect((await ownerAccepts(placed.id)).outcome).toEqual({ already: true });
    expect(await db.walletEntry.count({ where: { orderId: placed.id, type: WalletEntryType.ORDER_FULFILMENT } })).toBe(1);
  });

  it("treats an order the old automatic acceptance left waiting for funds like any other: the owner accepts it once funded", async () => {
    const { user, store, variant } = await storeWithProduct(16800, 9240);
    const placed = await codOrder(store, variant.id);
    await asLegacyAwaitingFunds(placed.id);

    expect(await errorCode(ownerAccepts(placed.id))).toBe("INSUFFICIENT_BALANCE");
    expect(await fulfilmentShortfallCents(placed.id)).toBe(9240);

    // Funded: still waiting — money arriving accepts nothing.
    await fund(store, user.id, 10000);
    expect((await db.order.findUniqueOrThrow({ where: { id: placed.id } })).status).toBe(OrderStatus.AWAITING_FUNDS);
    await ownerAccepts(placed.id);
    expect((await db.order.findUniqueOrThrow({ where: { id: placed.id } })).status).toBe(OrderStatus.PROCESSING);
    expect(await getAvailableCents(store.id)).toBe(10000 - 9240);
    await ownerAccepts(placed.id);
    expect(await db.walletEntry.count({ where: { orderId: placed.id, type: WalletEntryType.ORDER_FULFILMENT } })).toBe(1);
  });

  it("shows each store only its own orders", async () => {
    const mine = await storeWithProduct();
    const theirs = await storeWithProduct();
    await fund(mine.store, mine.user.id, 3000);
    const order = await codOrder(mine.store, mine.variant.id);
    await ownerAccepts(order.id);

    expect((await getStoreOrder(mine.store.id, order.number))?.id).toBe(order.id);
    expect(await getStoreOrder(theirs.store.id, order.number)).toBeNull();
    expect((await listStoreOrders(mine.store.id)).orders.map((row) => row.number)).toContain(order.number);
    expect((await listStoreOrders(theirs.store.id)).orders).toHaveLength(0);
    // The "To accept" list holds only orders still waiting for the owner.
    expect((await listStoreOrders(mine.store.id, { status: "TO_ACCEPT" })).orders).toHaveLength(0);

    // The owner sees the same stages staff do, with the same times.
    const owned = await getStoreOrder(mine.store.id, order.number);
    const stages = fulfilmentProgress({ status: owned!.status, placedAt: owned!.placedAt, deliveredAt: owned!.deliveredAt, events: owned!.events });
    expect(stages.filter((stage) => stage.done).map((stage) => stage.status)).toEqual(["PENDING", "CONFIRMED", "ACCEPTED", "PROCESSING"]);
    expect(stages.find((stage) => stage.status === "PROCESSING")?.at).toBeInstanceOf(Date);
  });
});
