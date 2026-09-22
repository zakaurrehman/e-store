import { describe, expect, it } from "vitest";
import { addItem, createGuestCart } from "@/features/cart/service";
import { fulfilmentProgress, isFulfilmentComplete, nextFulfilmentStep } from "@/features/orders/progress";
import { acceptOrderForFulfilment, cancelOrder, placeOrder, updateOrderStatus } from "@/features/orders/service";
import { openStoreForNewOwner } from "@/features/stores/onboarding";
import { getStoreOrder, listStoreOrders } from "@/features/stores/dashboard";
import { addProductsToStore } from "@/features/stores/service";
import { getAvailableCents, getBalanceCents } from "@/features/wallet/service";
import { OrderStatus, WalletEntryType } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { isDomainError } from "@/server/errors";
import { createProduct, invitation, orderContext, orderInput } from "./helpers";

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

/** An order as it looks on a database that was live before fulfilment acceptance existed: confirmed, nothing posted. */
async function asLegacyConfirmedOrder(orderId: string) {
  await db.walletEntry.deleteMany({ where: { orderId } });
  return db.order.update({ where: { id: orderId }, data: { status: OrderStatus.CONFIRMED, acceptedAt: null } });
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
  it("walks an order from accepted to delivered, recording who moved it and when", async () => {
    const { store, variant } = await storeWithProduct();
    const order = await codOrder(store, variant.id);
    const admin = await staff();

    expect(order.status).toBe(OrderStatus.ACCEPTED);
    for (const status of [OrderStatus.PROCESSING, OrderStatus.PACKED, OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED]) {
      expect(nextFulfilmentStep((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status)?.status).toBe(status);
      await updateOrderStatus(order.id, status, admin.id);
    }

    const { order: finished, stages } = await progressOf(order.id);
    expect(finished.status).toBe(OrderStatus.DELIVERED);
    expect(finished.deliveredAt).not.toBeNull();
    expect(isFulfilmentComplete(finished.status)).toBe(true);
    expect(nextFulfilmentStep(finished.status)).toBeNull();

    // Every stage is done, timed, and attributed — the earlier ones to the system, the staff steps to a person.
    expect(stages.map((stage) => stage.status)).toEqual(["PENDING", "CONFIRMED", "ACCEPTED", "PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"]);
    expect(stages.every((stage) => stage.done && stage.at !== null)).toBe(true);
    expect(stages.find((stage) => stage.status === "DELIVERED")?.by).toBe("Fern Staff");
    expect(stages.find((stage) => stage.status === "CONFIRMED")?.by).toBeNull();
    const times = stages.map((stage) => stage.at!.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);

    // Delivered is the end of the road, and cash on delivery money is now the owner's.
    expect(await errorCode(updateOrderStatus(order.id, OrderStatus.PROCESSING, admin.id))).toBe("INVALID_TRANSITION");
    expect(await getAvailableCents(store.id)).toBe(2000 - 500);
  });

  it("refuses to skip stages, and keeps the order where it was", async () => {
    const { store, variant } = await storeWithProduct();
    const order = await codOrder(store, variant.id);
    const admin = await staff();

    for (const invalid of [OrderStatus.DELIVERED, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CONFIRMED]) {
      expect(await errorCode(updateOrderStatus(order.id, invalid, admin.id))).toBe("INVALID_TRANSITION");
    }
    const unchanged = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(unchanged.status).toBe(OrderStatus.ACCEPTED);
    // Only the two real moves so far (confirmed, accepted); the refused ones wrote nothing.
    expect(await db.orderEvent.count({ where: { orderId: order.id, type: "STATUS_CHANGED" } })).toBe(2);

    // Jumping ahead is allowed only where the rules say so: accepted straight to shipped.
    await updateOrderStatus(order.id, OrderStatus.SHIPPED, admin.id);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(OrderStatus.SHIPPED);
  });

  it("stops a cancelled order dead: no further fulfilment, and nothing left charged to the owner", async () => {
    const { store, variant } = await storeWithProduct();
    const order = await codOrder(store, variant.id);
    const admin = await staff();
    await cancelOrder(order.id, "Customer changed their mind", admin.id);

    const cancelled = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(cancelled.status).toBe(OrderStatus.CANCELLED);
    expect(nextFulfilmentStep(cancelled.status)).toBeNull();
    for (const status of [OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.ACCEPTED]) {
      expect(await errorCode(updateOrderStatus(order.id, status, admin.id))).toBe("INVALID_TRANSITION");
    }
    expect(await acceptOrderForFulfilment(order.id, admin.id)).toEqual([]);
    expect(await getBalanceCents(store.id)).toBe(0);
    const { stages } = await progressOf(order.id);
    expect(stages.every((stage) => !stage.done)).toBe(true);
  });

  it("accepts a confirmed order whose own payment covers the cost, without asking for a deposit", async () => {
    // Exactly the orders that were already confirmed when this release went out.
    const { store, variant } = await storeWithProduct(16800, 9240);
    const placed = await codOrder(store, variant.id);
    await asLegacyConfirmedOrder(placed.id);
    expect(await getBalanceCents(store.id)).toBe(0);

    const admin = await staff();
    await acceptOrderForFulfilment(placed.id, admin.id);

    const accepted = await db.order.findUniqueOrThrow({ where: { id: placed.id } });
    expect(accepted.status).toBe(OrderStatus.ACCEPTED);
    expect(accepted.acceptedAt).not.toBeNull();
    // The sale paid for the fulfilment cost; the owner was never asked for money.
    const entries = await db.walletEntry.findMany({ where: { orderId: placed.id } });
    expect(entries.map((entry) => entry.type).sort()).toEqual([WalletEntryType.ORDER_COMMISSION, WalletEntryType.ORDER_FULFILMENT, WalletEntryType.ORDER_SALE].sort());
    expect(await db.deposit.count({ where: { storeId: store.id } })).toBe(0);
    expect(await db.order.count({ where: { storeId: store.id, status: OrderStatus.AWAITING_FUNDS } })).toBe(0);

    // Accepting again changes nothing.
    await acceptOrderForFulfilment(placed.id, admin.id);
    expect(await db.walletEntry.count({ where: { orderId: placed.id, type: WalletEntryType.ORDER_FULFILMENT } })).toBe(1);
  });

  it("shows each store only its own orders", async () => {
    const mine = await storeWithProduct();
    const theirs = await storeWithProduct();
    const order = await codOrder(mine.store, mine.variant.id);
    const admin = await staff();
    await updateOrderStatus(order.id, OrderStatus.PROCESSING, admin.id);

    expect((await getStoreOrder(mine.store.id, order.number))?.id).toBe(order.id);
    expect(await getStoreOrder(theirs.store.id, order.number)).toBeNull();
    expect((await listStoreOrders(mine.store.id)).orders.map((row) => row.number)).toContain(order.number);
    expect((await listStoreOrders(theirs.store.id)).orders).toHaveLength(0);

    // The owner sees the same stages staff do, with the same times.
    const owned = await getStoreOrder(mine.store.id, order.number);
    const stages = fulfilmentProgress({ status: owned!.status, placedAt: owned!.placedAt, deliveredAt: owned!.deliveredAt, events: owned!.events });
    expect(stages.filter((stage) => stage.done).map((stage) => stage.status)).toEqual(["PENDING", "CONFIRMED", "ACCEPTED", "PROCESSING"]);
    expect(stages.find((stage) => stage.status === "PROCESSING")?.at).toBeInstanceOf(Date);
  });
});
