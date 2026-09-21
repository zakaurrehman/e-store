import { Prisma } from "@/generated/prisma/client";
import { DepositStatus, OrderStatus, PaymentStatus, PayoutStatus, WalletEntryType, type PayoutMethod } from "@/generated/prisma/enums";
import { writeAudit } from "@/server/audit";
import { db, type DbClient } from "@/server/db";
import { DomainError, NotFoundError } from "@/server/errors";

export class WalletError extends DomainError {}

export const MIN_PAYOUT_CENTS = 2000;
export const MAX_PAYOUT_CENTS = 100_000_00;
export const MIN_DEPOSIT_CENTS = 500;
export const MAX_DEPOSIT_CENTS = 100_000_00;

/** What the owner has earned on an order: their margin on the items, less any discount they gave. */
export function orderEarningCents(order: { discountCents: number; items: Array<{ unitPriceCents: number; unitCostCents: number; quantity: number }> }) {
  const margin = order.items.reduce((sum, item) => sum + (item.unitPriceCents - item.unitCostCents) * item.quantity, 0);
  return Math.max(0, margin - order.discountCents);
}

/** The store's balance: the sum of its ledger. Never stored, so it cannot drift. */
export async function getBalanceCents(storeId: string, client: DbClient = db) {
  const total = await client.walletEntry.aggregate({ where: { storeId }, _sum: { amountCents: true } });
  return total._sum.amountCents ?? 0;
}

async function addEntry(
  client: DbClient,
  entry: { storeId: string; type: WalletEntryType; amountCents: number; description: string; orderId?: string; payoutId?: string; depositId?: string; createdById?: string | null },
) {
  return client.walletEntry.create({
    data: {
      storeId: entry.storeId,
      type: entry.type,
      amountCents: entry.amountCents,
      description: entry.description,
      orderId: entry.orderId ?? null,
      payoutId: entry.payoutId ?? null,
      depositId: entry.depositId ?? null,
      createdById: entry.createdById ?? null,
    },
  });
}

const alreadyRecorded = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/**
 * Credits the owner once the customer's money has been collected: online payments when they are paid,
 * cash on delivery when the parcel is delivered. Safe to call repeatedly — one earning per order.
 */
export async function creditOrderEarning(orderId: string, client: DbClient = db) {
  const order = await client.order.findUnique({
    where: { id: orderId },
    select: { id: true, number: true, storeId: true, status: true, paymentStatus: true, paymentProvider: true, discountCents: true, store: { select: { ownerId: true } }, items: { select: { unitPriceCents: true, unitCostCents: true, quantity: true } } },
  });
  if (!order || !order.store.ownerId) return null; // the platform's own store keeps no balance
  if (order.status === OrderStatus.CANCELLED) return null;
  const collected =
    order.paymentStatus === PaymentStatus.PAID ||
    order.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED ||
    (order.paymentProvider === "cod" && order.status === OrderStatus.DELIVERED);
  if (!collected) return null;

  try {
    return await addEntry(client, {
      storeId: order.storeId,
      type: WalletEntryType.ORDER_EARNING,
      amountCents: orderEarningCents(order),
      description: `Earnings from order ${order.number}`,
      orderId: order.id,
    });
  } catch (error) {
    if (alreadyRecorded(error)) return null;
    throw error;
  }
}

/** Takes the earning back when an order is refunded or cancelled. Only ever reverses what was credited. */
export async function reverseOrderEarning(orderId: string, reason: string, client: DbClient = db) {
  const earning = await client.walletEntry.findFirst({ where: { orderId, type: WalletEntryType.ORDER_EARNING } });
  if (!earning) return null;
  const order = await client.order.findUnique({ where: { id: orderId }, select: { number: true } });
  try {
    return await addEntry(client, {
      storeId: earning.storeId,
      type: WalletEntryType.ORDER_REVERSAL,
      amountCents: -earning.amountCents,
      description: `Order ${order?.number ?? ""} ${reason}`.trim(),
      orderId,
    });
  } catch (error) {
    if (alreadyRecorded(error)) return null;
    throw error;
  }
}

// ─── Withdrawals ─────────────────────────────────────────────────────────────

export type PayoutRequest = { storeId: string; amountCents: number; method: PayoutMethod; destination: string; note?: string | null; requestedById: string };

/**
 * Requests a withdrawal. The amount leaves the balance straight away so it cannot be requested twice;
 * rejecting the request returns it. Zendropship sends the money and marks the payout paid.
 */
export async function requestPayout(input: PayoutRequest) {
  if (!Number.isInteger(input.amountCents) || input.amountCents < MIN_PAYOUT_CENTS) {
    throw new WalletError("PAYOUT_TOO_SMALL", `The smallest withdrawal is $${(MIN_PAYOUT_CENTS / 100).toFixed(2)}.`, { fieldErrors: { amount: [`Enter at least $${(MIN_PAYOUT_CENTS / 100).toFixed(2)}.`] } });
  }
  if (input.amountCents > MAX_PAYOUT_CENTS) throw new WalletError("PAYOUT_TOO_LARGE", "That amount is too large — contact support for help.", { fieldErrors: { amount: ["Enter a smaller amount."] } });

  return db.$transaction(async (tx) => {
    const balance = await getBalanceCents(input.storeId, tx);
    if (input.amountCents > balance) {
      throw new WalletError("INSUFFICIENT_BALANCE", `You can withdraw up to $${(balance / 100).toFixed(2)} right now.`, { fieldErrors: { amount: ["More than your available balance."] } });
    }
    const payout = await tx.payout.create({
      data: {
        storeId: input.storeId,
        amountCents: input.amountCents,
        method: input.method,
        destination: input.destination.trim(),
        note: input.note?.trim() || null,
        requestedById: input.requestedById,
      },
    });
    await addEntry(tx, { storeId: input.storeId, type: WalletEntryType.PAYOUT, amountCents: -input.amountCents, description: "Withdrawal requested", payoutId: payout.id, createdById: input.requestedById });
    await writeAudit({ actorId: input.requestedById, action: "wallet.payout.request", entityType: "Payout", entityId: payout.id, summary: `Withdrawal of ${(input.amountCents / 100).toFixed(2)} requested` }, tx);
    return payout;
  });
}

/** Staff record that the money was sent. The balance already moved when the request was made. */
export async function markPayoutPaid(payoutId: string, actorId: string, reference?: string | null) {
  const payout = await db.payout.findUnique({ where: { id: payoutId }, include: { store: { select: { name: true } } } });
  if (!payout) throw new NotFoundError("Withdrawal not found.");
  if (payout.status !== PayoutStatus.REQUESTED) throw new WalletError("PAYOUT_SETTLED", "This withdrawal has already been dealt with.");
  const updated = await db.payout.update({ where: { id: payout.id }, data: { status: PayoutStatus.PAID, processedById: actorId, processedAt: new Date(), reference: reference?.trim() || null } });
  await writeAudit({ actorId, action: "wallet.payout.paid", entityType: "Payout", entityId: payout.id, summary: `Withdrawal of ${(payout.amountCents / 100).toFixed(2)} to ${payout.store.name} marked paid` });
  return updated;
}

/** Refuses a withdrawal and returns the amount to the owner's balance. */
export async function rejectPayout(payoutId: string, actorId: string, reason: string) {
  return db.$transaction(async (tx) => {
    const payout = await tx.payout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundError("Withdrawal not found.");
    if (payout.status !== PayoutStatus.REQUESTED) throw new WalletError("PAYOUT_SETTLED", "This withdrawal has already been dealt with.");
    const updated = await tx.payout.update({ where: { id: payout.id }, data: { status: PayoutStatus.REJECTED, processedById: actorId, processedAt: new Date(), reference: reason.trim() || null } });
    await addEntry(tx, { storeId: payout.storeId, type: WalletEntryType.PAYOUT_REVERSAL, amountCents: payout.amountCents, description: `Withdrawal declined${reason.trim() ? `: ${reason.trim()}` : ""}`, payoutId: payout.id, createdById: actorId });
    await writeAudit({ actorId, action: "wallet.payout.reject", entityType: "Payout", entityId: payout.id, summary: `Withdrawal of ${(payout.amountCents / 100).toFixed(2)} declined` }, tx);
    return updated;
  });
}

// ─── Deposits ────────────────────────────────────────────────────────────────

/**
 * Records that the owner says they have transferred money to Zendropship. Nothing is credited here:
 * the balance changes only when staff confirm the transfer arrived.
 */
export async function recordDeposit(input: { storeId: string; amountCents: number; reference?: string | null; note?: string | null; createdById: string }) {
  if (!Number.isInteger(input.amountCents) || input.amountCents < MIN_DEPOSIT_CENTS) {
    throw new WalletError("DEPOSIT_TOO_SMALL", `The smallest deposit is $${(MIN_DEPOSIT_CENTS / 100).toFixed(2)}.`, { fieldErrors: { amount: [`Enter at least $${(MIN_DEPOSIT_CENTS / 100).toFixed(2)}.`] } });
  }
  if (input.amountCents > MAX_DEPOSIT_CENTS) throw new WalletError("DEPOSIT_TOO_LARGE", "That amount is too large — contact support for help.", { fieldErrors: { amount: ["Enter a smaller amount."] } });
  const deposit = await db.deposit.create({
    data: { storeId: input.storeId, amountCents: input.amountCents, reference: input.reference?.trim() || null, note: input.note?.trim() || null, createdById: input.createdById },
  });
  await writeAudit({ actorId: input.createdById, action: "wallet.deposit.record", entityType: "Deposit", entityId: deposit.id, summary: `Deposit of ${(input.amountCents / 100).toFixed(2)} declared` });
  return deposit;
}

/** Staff confirm the money arrived; only now is the balance credited. */
export async function confirmDeposit(depositId: string, actorId: string, amountCents?: number) {
  return db.$transaction(async (tx) => {
    const deposit = await tx.deposit.findUnique({ where: { id: depositId } });
    if (!deposit) throw new NotFoundError("Deposit not found.");
    if (deposit.status !== DepositStatus.PENDING) throw new WalletError("DEPOSIT_SETTLED", "This deposit has already been dealt with.");
    const amount = amountCents ?? deposit.amountCents;
    if (!Number.isInteger(amount) || amount <= 0) throw new WalletError("AMOUNT_INVALID", "Enter the amount that actually arrived.");
    const updated = await tx.deposit.update({ where: { id: deposit.id }, data: { status: DepositStatus.CONFIRMED, amountCents: amount, confirmedById: actorId, confirmedAt: new Date() } });
    await addEntry(tx, { storeId: deposit.storeId, type: WalletEntryType.DEPOSIT, amountCents: amount, description: "Deposit received", depositId: deposit.id, createdById: actorId });
    await writeAudit({ actorId, action: "wallet.deposit.confirm", entityType: "Deposit", entityId: deposit.id, summary: `Deposit of ${(amount / 100).toFixed(2)} confirmed` }, tx);
    return updated;
  });
}

export async function rejectDeposit(depositId: string, actorId: string, reason: string) {
  const deposit = await db.deposit.findUnique({ where: { id: depositId } });
  if (!deposit) throw new NotFoundError("Deposit not found.");
  if (deposit.status !== DepositStatus.PENDING) throw new WalletError("DEPOSIT_SETTLED", "This deposit has already been dealt with.");
  const updated = await db.deposit.update({ where: { id: deposit.id }, data: { status: DepositStatus.REJECTED, note: reason.trim() || deposit.note, confirmedById: actorId, confirmedAt: new Date() } });
  await writeAudit({ actorId, action: "wallet.deposit.reject", entityType: "Deposit", entityId: deposit.id, summary: `Deposit of ${(deposit.amountCents / 100).toFixed(2)} declined` });
  return updated;
}

/** Staff correction, always with a reason, in either direction. */
export async function adjustBalance(storeId: string, amountCents: number, reason: string, actorId: string) {
  if (!Number.isInteger(amountCents) || amountCents === 0) throw new WalletError("AMOUNT_INVALID", "Enter an amount other than zero.");
  if (!reason.trim()) throw new WalletError("REASON_REQUIRED", "Give a reason for the adjustment.");
  return db.$transaction(async (tx) => {
    const entry = await addEntry(tx, { storeId, type: WalletEntryType.ADJUSTMENT, amountCents, description: reason.trim(), createdById: actorId });
    await writeAudit({ actorId, action: "wallet.adjust", entityType: "Store", entityId: storeId, summary: `Balance adjusted by ${(amountCents / 100).toFixed(2)}: ${reason.trim()}` }, tx);
    return entry;
  });
}
