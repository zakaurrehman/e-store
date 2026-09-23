import { describe, expect, it } from "vitest";
import { addItem, createGuestCart } from "@/features/cart/service";
import { markPaidManually, placeOrder } from "@/features/orders/service";
import { openStoreForNewOwner } from "@/features/stores/onboarding";
import { addProductsToStore } from "@/features/stores/service";
import { getWalletSummary } from "@/features/wallet/queries";
import { confirmDeposit, getBalanceCents, recordDeposit } from "@/features/wallet/service";
import { DepositStatus, OrderStatus, PaymentStatus, WalletEntryType } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { createProduct, invitation, orderContext, orderInput } from "./helpers";

let sequence = 0;

async function staff() {
  const role = await db.role.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } });
  return db.user.upsert({
    where: { email: "money.staff@example.com" },
    create: { email: "money.staff@example.com", firstName: "Mo", lastName: "Staff", roleId: role.id },
    update: {},
  });
}

async function storeWithProduct(priceCents = 5000, costCents = 3000) {
  sequence += 1;
  const { user, store } = await openStoreForNewOwner({
    storeName: `Money Store ${sequence}`,
    firstName: "Mina",
    lastName: "Owner",
    email: `money.owner.${sequence}.${Date.now()}@example.com`,
    password: "Correct-horse-battery-7",
    referralCode: await invitation(),
  });
  const { product, variant } = await createProduct({ priceCents, stock: 20 });
  await db.productVariant.update({ where: { id: variant.id }, data: { costCents } });
  await addProductsToStore(store.id, [product.id], { userId: user.id, asOwner: true });
  return { user, store, variant };
}

/** An order placed by card that never got its payment: what staff see as "awaiting payment". */
async function unpaidCardOrder(store: { id: string }, variantId: string) {
  const { cart } = await createGuestCart(store.id);
  await addItem(cart.id, variantId, 1);
  const outcome = await placeOrder(await orderInput(), orderContext(cart.id));
  return db.order.findUniqueOrThrow({ where: { id: outcome.result.orderId } });
}

describe("confirming the payment on an order that is still waiting for it", () => {
  it("records the money, confirms the order and hands it to fulfilment in one step", async () => {
    const { store, variant } = await storeWithProduct();
    const agent = await staff();
    const order = await unpaidCardOrder(store, variant.id);
    expect(order.status).toBe(OrderStatus.PENDING);
    expect(order.paymentStatus).toBe(PaymentStatus.PENDING);

    await markPaidManually(order.id, agent.id, "Bank transfer arrived");

    const after = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { events: true } });
    expect(after.paymentStatus).toBe(PaymentStatus.PAID);
    expect(after.paidAt).not.toBeNull();
    // The customer's own payment covers the wholesale cost, so fulfilment takes it without a deposit.
    expect(after.status).toBe(OrderStatus.ACCEPTED);
    expect(after.events.some((event) => event.message.includes("Marked as paid"))).toBe(true);

    // The sale and its costs are on the ledger once each.
    const entries = await db.walletEntry.findMany({ where: { orderId: order.id } });
    expect(entries.filter((entry) => entry.type === WalletEntryType.ORDER_SALE)).toHaveLength(1);
    expect(entries.filter((entry) => entry.type === WalletEntryType.ORDER_FULFILMENT)).toHaveLength(1);
    expect(entries.filter((entry) => entry.type === WalletEntryType.ORDER_COMMISSION)).toHaveLength(1);
  });

  it("changes nothing when it is done twice", async () => {
    const { store, variant } = await storeWithProduct();
    const agent = await staff();
    const order = await unpaidCardOrder(store, variant.id);

    await markPaidManually(order.id, agent.id);
    const balance = await getBalanceCents(store.id);
    const entries = await db.walletEntry.count({ where: { orderId: order.id } });

    await markPaidManually(order.id, agent.id);
    expect(await getBalanceCents(store.id)).toBe(balance);
    expect(await db.walletEntry.count({ where: { orderId: order.id } })).toBe(entries);
    expect((await db.payment.findMany({ where: { orderId: order.id } })).length).toBe(1);
  });
});

describe("staff putting money into an owner's wallet", () => {
  it("credits it once, as a deposit the owner can see, with the reason on the record", async () => {
    const { store } = await storeWithProduct();
    const agent = await staff();
    expect(await getBalanceCents(store.id)).toBe(0);

    // The same two steps the screen runs: recorded by staff, then approved by staff.
    const deposit = await recordDeposit({
      storeId: store.id,
      amountCents: 7_500,
      method: "BANK_TRANSFER",
      reference: "TOPUP-STAFF-1",
      note: "Credited by Zendropship staff — transfer arrived on 12 May",
      createdById: agent.id,
    });
    await confirmDeposit(deposit.id, agent.id, 7_500);

    expect(await getBalanceCents(store.id)).toBe(7_500);
    const entries = await db.walletEntry.findMany({ where: { storeId: store.id, type: WalletEntryType.DEPOSIT } });
    expect(entries).toHaveLength(1);
    expect(entries[0].amountCents).toBe(7_500);

    const stored = await db.deposit.findUniqueOrThrow({ where: { id: deposit.id } });
    expect(stored.status).toBe(DepositStatus.CONFIRMED);
    expect(stored.createdById).toBe(agent.id);
    expect(stored.confirmedById).toBe(agent.id);
    expect(stored.note).toContain("transfer arrived on 12 May");

    // Both steps are in the audit log, so the credit can be traced to whoever made it.
    const audit = await db.auditLog.findMany({ where: { entityType: "Deposit", entityId: deposit.id }, orderBy: { createdAt: "asc" } });
    expect(audit.map((row) => row.action)).toEqual(["wallet.deposit.record", "wallet.deposit.confirm"]);
    expect(audit.every((row) => row.actorId === agent.id)).toBe(true);

    // And the owner's own summary shows it straight away.
    const summary = await getWalletSummary(store.id);
    expect(summary.balanceCents).toBe(7_500);
    expect(summary.totalDepositedCents).toBe(7_500);
    expect(summary.pendingDepositCount).toBe(0);
  });

  it("cannot be credited twice from the same record", async () => {
    const { store } = await storeWithProduct();
    const agent = await staff();
    const deposit = await recordDeposit({ storeId: store.id, amountCents: 2_000, method: "BANK_TRANSFER", createdById: agent.id });
    await confirmDeposit(deposit.id, agent.id, 2_000);

    await expect(confirmDeposit(deposit.id, agent.id, 2_000)).rejects.toThrow();
    expect(await getBalanceCents(store.id)).toBe(2_000);
    expect(await db.walletEntry.count({ where: { storeId: store.id, type: WalletEntryType.DEPOSIT } })).toBe(1);
  });
});
