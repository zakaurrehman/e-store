import { Prisma } from "@/generated/prisma/client";
import { DepositStatus, OrderStatus, PaymentStatus, PayoutStatus, WalletEntryStatus, WalletEntryType, type DepositMethod, type PayoutMethod } from "@/generated/prisma/enums";
import { orderFinanceSelect, refundShareCents, storedOrderFinance } from "@/features/finance/service";
import { writeAudit } from "@/server/audit";
import { db, type DbClient } from "@/server/db";
import { DomainError, NotFoundError } from "@/server/errors";

export class WalletError extends DomainError {}

export const MIN_PAYOUT_CENTS = 2000;
export const MAX_PAYOUT_CENTS = 100_000_00;
export const MIN_DEPOSIT_CENTS = 500;
export const MAX_DEPOSIT_CENTS = 100_000_00;

/** Entries that make up what an order did to the owner's balance. */
export const ORDER_ENTRY_TYPES = [
  WalletEntryType.ORDER_SALE,
  WalletEntryType.ORDER_FULFILMENT,
  WalletEntryType.ORDER_COMMISSION,
  WalletEntryType.ORDER_REFUND,
  WalletEntryType.FULFILMENT_REVERSAL,
  WalletEntryType.COMMISSION_REVERSAL,
  WalletEntryType.ORDER_EARNING,
  WalletEntryType.ORDER_REVERSAL,
] as const;

/**
 * Serialises every change to one store's balance. Two requests that would both read the balance and
 * then write to it (a withdrawal and a fulfilment charge, say) wait for each other instead of racing.
 * Released automatically when the transaction ends.
 */
export async function lockStoreWallet(tx: DbClient, storeId: string) {
  // executeRaw, not queryRaw: the lock function returns void, which has no column type to read back.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`wallet:${storeId}`}, 0))`;
}

/** Everything the ledger says the store is owed, money still in transit included. */
export async function getBalanceCents(storeId: string, client: DbClient = db) {
  const total = await client.walletEntry.aggregate({ where: { storeId }, _sum: { amountCents: true } });
  return total._sum.amountCents ?? 0;
}

/** What the owner can actually withdraw: entries whose money has been collected. */
export async function getAvailableCents(storeId: string, client: DbClient = db) {
  const total = await client.walletEntry.aggregate({ where: { storeId, status: WalletEntryStatus.CLEARED }, _sum: { amountCents: true } });
  return total._sum.amountCents ?? 0;
}

type EntryInput = {
  storeId: string;
  type: WalletEntryType;
  amountCents: number;
  description: string;
  currency?: string;
  status?: WalletEntryStatus;
  orderId?: string | null;
  payoutId?: string | null;
  depositId?: string | null;
  createdById?: string | null;
  /** Set for postings that must happen exactly once; a replay is then a no-op. */
  idempotencyKey?: string | null;
};

const alreadyRecorded = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/**
 * Writes one ledger line. A posting with an idempotency key is written once and only once: callers hold the
 * store's wallet lock, so the check below cannot race, and the unique index is the backstop if one ever does.
 */
async function addEntry(client: DbClient, entry: EntryInput) {
  const status = entry.status ?? WalletEntryStatus.CLEARED;
  if (entry.idempotencyKey && (await client.walletEntry.findUnique({ where: { idempotencyKey: entry.idempotencyKey }, select: { id: true } }))) {
    return null;
  }
  try {
    return await client.walletEntry.create({
      data: {
        storeId: entry.storeId,
        type: entry.type,
        amountCents: entry.amountCents,
        currency: entry.currency ?? "USD",
        status,
        clearedAt: status === WalletEntryStatus.CLEARED ? new Date() : null,
        description: entry.description,
        orderId: entry.orderId ?? null,
        payoutId: entry.payoutId ?? null,
        depositId: entry.depositId ?? null,
        createdById: entry.createdById ?? null,
        idempotencyKey: entry.idempotencyKey ?? null,
      },
    });
  } catch (error) {
    if (entry.idempotencyKey && alreadyRecorded(error)) return null; // posted already — nothing to do
    throw error;
  }
}

// ─── Orders ──────────────────────────────────────────────────────────────────

const orderLedgerSelect = {
  id: true,
  number: true,
  storeId: true,
  status: true,
  paymentStatus: true,
  paymentProvider: true,
  currency: true,
  refundedCents: true,
  ...orderFinanceSelect,
  store: { select: { ownerId: true } },
} satisfies Prisma.OrderSelect;

type OrderForLedger = Prisma.OrderGetPayload<{ select: typeof orderLedgerSelect }>;

const loadOrder = (client: DbClient, orderId: string) => client.order.findUnique({ where: { id: orderId }, select: orderLedgerSelect });

/** True once Zendropship actually holds the customer's money: online payments when paid, cash on delivery on arrival. */
export function moneyCollected(order: Pick<OrderForLedger, "paymentStatus" | "paymentProvider" | "status">) {
  if (order.paymentStatus === PaymentStatus.PAID || order.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED) return true;
  return order.paymentProvider === "cod" && order.status === OrderStatus.DELIVERED;
}

const entryStatus = (order: OrderForLedger) => (moneyCollected(order) ? WalletEntryStatus.CLEARED : WalletEntryStatus.PENDING);

/** Money in transit becomes money in the balance. Amounts never change — only the status. */
async function clearOrderEntries(client: DbClient, orderId: string) {
  await client.walletEntry.updateMany({
    where: { orderId, status: WalletEntryStatus.PENDING },
    data: { status: WalletEntryStatus.CLEARED, clearedAt: new Date() },
  });
}

/**
 * Records what the customer bought: the sale as a credit and Zendropship's commission as a debit, using the
 * rates stored on the order. Entries start as pending for cash on delivery and clear when the parcel arrives.
 * Safe to call as often as you like — each posting happens once.
 */
export async function recogniseOrderRevenue(orderId: string, client: DbClient = db) {
  const run = async (tx: DbClient) => {
    const order = await loadOrder(tx, orderId);
    if (!order || !order.store.ownerId) return null; // the platform's own store keeps no balance
    if (order.status === OrderStatus.CANCELLED) return null;
    await lockStoreWallet(tx, order.storeId);
    const finance = storedOrderFinance(order);
    const status = entryStatus(order);
    const common = { storeId: order.storeId, currency: order.currency, orderId: order.id, status };

    if (finance.revenueCents > 0) {
      await addEntry(tx, { ...common, type: WalletEntryType.ORDER_SALE, amountCents: finance.revenueCents, description: `Sale · order ${order.number}`, idempotencyKey: `order:${order.id}:sale` });
    }
    if (finance.commissionCents > 0) {
      await addEntry(tx, {
        ...common,
        type: WalletEntryType.ORDER_COMMISSION,
        amountCents: -finance.commissionCents,
        description: `Zendropship commission (${(finance.commissionRateBps / 100).toFixed(finance.commissionRateBps % 100 === 0 ? 0 : 2)}%) · order ${order.number}`,
        idempotencyKey: `order:${order.id}:commission`,
      });
    }
    if (status === WalletEntryStatus.CLEARED) await clearOrderEntries(tx, order.id);
    return finance;
  };
  // Callers already inside a transaction keep their own; everyone else gets one, so the lock is held while posting.
  return client === db ? db.$transaction((tx) => run(tx)) : run(client);
}

export type FulfilmentFunding = { ok: true; chargedCents: number; alreadyCharged: boolean } | { ok: false; shortfallCents: number; requiredCents: number };

/**
 * Charges the wholesale cost to the owner's balance so fulfilment can take the order. The customer's own
 * payment is already in that balance, so a normally priced order funds itself; anything it cannot cover is
 * reported back as a shortfall and the order waits for a deposit.
 *
 * Must run inside a transaction. The store's wallet is locked first, and the charge carries an idempotency
 * key, so a refresh, a retry or two admins clicking at once can never charge twice.
 */
export async function chargeOrderFulfilment(tx: DbClient, orderId: string): Promise<FulfilmentFunding> {
  const order = await loadOrder(tx, orderId);
  if (!order) throw new NotFoundError("Order not found.");
  if (!order.store.ownerId) return { ok: true, chargedCents: 0, alreadyCharged: false }; // platform store: no balance to charge
  await lockStoreWallet(tx, order.storeId);

  const existing = await tx.walletEntry.findFirst({ where: { orderId: order.id, type: WalletEntryType.ORDER_FULFILMENT } });
  if (existing) return { ok: true, chargedCents: -existing.amountCents, alreadyCharged: true };

  await recogniseOrderRevenue(order.id, tx);
  const finance = storedOrderFinance(order);
  const balance = await getBalanceCents(order.storeId, tx);
  if (balance < finance.fulfilmentCostCents) {
    return { ok: false, requiredCents: finance.fulfilmentCostCents, shortfallCents: finance.fulfilmentCostCents - balance };
  }
  if (finance.fulfilmentCostCents > 0) {
    await addEntry(tx, {
      storeId: order.storeId,
      currency: order.currency,
      orderId: order.id,
      status: entryStatus(order),
      type: WalletEntryType.ORDER_FULFILMENT,
      amountCents: -finance.fulfilmentCostCents,
      description: `Fulfilment cost · order ${order.number}`,
      idempotencyKey: `order:${order.id}:fulfilment`,
    });
  }
  return { ok: true, chargedCents: finance.fulfilmentCostCents, alreadyCharged: false };
}

/** What an order still needs before fulfilment can take it (0 when it funds itself). */
export async function fulfilmentShortfallCents(orderId: string, client: DbClient = db) {
  const order = await loadOrder(client, orderId);
  if (!order || !order.store.ownerId) return 0;
  const charged = await client.walletEntry.findFirst({ where: { orderId, type: WalletEntryType.ORDER_FULFILMENT }, select: { id: true } });
  if (charged) return 0;
  const finance = storedOrderFinance(order);
  const posted = await client.walletEntry.count({ where: { orderId, type: WalletEntryType.ORDER_SALE } });
  const balance = await getBalanceCents(order.storeId, client);
  // The sale is credited as part of accepting the order, so count it when it has not been posted yet.
  const projected = balance + (posted ? 0 : finance.revenueCents - finance.commissionCents);
  return Math.max(0, finance.fulfilmentCostCents - projected);
}

/** Cash on delivery: the courier has handed the money over, so the order's entries count towards the balance. */
export async function clearCollectedOrder(orderId: string, client: DbClient = db) {
  const run = async (tx: DbClient) => {
    const order = await loadOrder(tx, orderId);
    if (!order || !order.store.ownerId || !moneyCollected(order)) return null;
    await recogniseOrderRevenue(orderId, tx);
    await clearOrderEntries(tx, orderId);
    return true;
  };
  return client === db ? db.$transaction((tx) => run(tx)) : run(client);
}

/**
 * Gives back what a refunded or cancelled order took: the sale comes off the balance, the wholesale cost and
 * the commission go back on, in proportion to how much of the order was refunded. Nothing is ever edited —
 * each reversal is its own entry — and running it twice for the same amount posts nothing the second time.
 */
export async function reverseOrderLedger(orderId: string, options: { refundedCents?: number; reason: string; actorId?: string | null; client?: DbClient } = { reason: "reversed" }) {
  const client = options.client ?? db;
  const run = async (tx: DbClient) => {
    const order = await loadOrder(tx, orderId);
    if (!order || !order.store.ownerId) return null;
    await lockStoreWallet(tx, order.storeId);
    const entries = await tx.walletEntry.findMany({ where: { orderId, type: { in: [...ORDER_ENTRY_TYPES] } } });
    if (entries.length === 0) return null;

    const finance = storedOrderFinance(order);
    const refunded = Math.min(order.totalCents, options.refundedCents ?? order.totalCents);
    const sumOf = (type: WalletEntryType) => entries.filter((entry) => entry.type === type).reduce((sum, entry) => sum + entry.amountCents, 0);
    const statusOf = (type: WalletEntryType) => entries.find((entry) => entry.type === type)?.status ?? WalletEntryStatus.CLEARED;

    const plan: Array<{ type: WalletEntryType; posted: number; reversed: number; share: number; label: string }> = [
      { type: WalletEntryType.ORDER_SALE, posted: sumOf(WalletEntryType.ORDER_SALE), reversed: sumOf(WalletEntryType.ORDER_REFUND), share: finance.revenueCents, label: `Refund · order ${order.number}` },
      { type: WalletEntryType.ORDER_FULFILMENT, posted: sumOf(WalletEntryType.ORDER_FULFILMENT), reversed: sumOf(WalletEntryType.FULFILMENT_REVERSAL), share: finance.fulfilmentCostCents, label: `Fulfilment cost returned · order ${order.number}` },
      { type: WalletEntryType.ORDER_COMMISSION, posted: sumOf(WalletEntryType.ORDER_COMMISSION), reversed: sumOf(WalletEntryType.COMMISSION_REVERSAL), share: finance.commissionCents, label: `Commission returned · order ${order.number}` },
      // Orders from before sales and costs were recorded separately carry a single net earning.
      { type: WalletEntryType.ORDER_EARNING, posted: sumOf(WalletEntryType.ORDER_EARNING), reversed: sumOf(WalletEntryType.ORDER_REVERSAL), share: sumOf(WalletEntryType.ORDER_EARNING), label: `Order ${order.number} ${options.reason}` },
    ];
    const reversalType: Partial<Record<WalletEntryType, WalletEntryType>> = {
      [WalletEntryType.ORDER_SALE]: WalletEntryType.ORDER_REFUND,
      [WalletEntryType.ORDER_FULFILMENT]: WalletEntryType.FULFILMENT_REVERSAL,
      [WalletEntryType.ORDER_COMMISSION]: WalletEntryType.COMMISSION_REVERSAL,
      [WalletEntryType.ORDER_EARNING]: WalletEntryType.ORDER_REVERSAL,
    };

    let posted = 0;
    for (const item of plan) {
      if (item.posted === 0) continue;
      const target = refundShareCents(Math.abs(item.posted), refunded, order.totalCents);
      const delta = target - Math.abs(item.reversed);
      if (delta <= 0) continue;
      await addEntry(tx, {
        storeId: order.storeId,
        currency: order.currency,
        orderId: order.id,
        status: statusOf(item.type),
        type: reversalType[item.type]!,
        // The reversal always points the other way to the entry it gives back.
        amountCents: item.posted > 0 ? -delta : delta,
        description: `${item.label} (${options.reason})`,
        createdById: options.actorId ?? null,
      });
      posted += 1;
    }
    return posted;
  };
  // Already inside a transaction? Reuse it, so the reversal commits or rolls back with the refund itself.
  return client === db ? db.$transaction((tx) => run(tx)) : run(client);
}

// ─── Withdrawals ─────────────────────────────────────────────────────────────

export type PayoutRequest = { storeId: string; amountCents: number; method: PayoutMethod; destination: string; note?: string | null; requestedById: string };

/** Withdrawals that are still being dealt with: the money is held out of the available balance. */
export const OPEN_PAYOUT_STATUSES = [PayoutStatus.REQUESTED, PayoutStatus.APPROVED, PayoutStatus.PROCESSING] as const;

/**
 * Requests a withdrawal. The amount leaves the balance straight away so it cannot be requested twice;
 * declining it returns the money. Zendropship sends the transfer and marks the payout paid.
 */
export async function requestPayout(input: PayoutRequest) {
  if (!Number.isInteger(input.amountCents) || input.amountCents < MIN_PAYOUT_CENTS) {
    throw new WalletError("PAYOUT_TOO_SMALL", `The smallest withdrawal is $${(MIN_PAYOUT_CENTS / 100).toFixed(2)}.`, { fieldErrors: { amount: [`Enter at least $${(MIN_PAYOUT_CENTS / 100).toFixed(2)}.`] } });
  }
  if (input.amountCents > MAX_PAYOUT_CENTS) throw new WalletError("PAYOUT_TOO_LARGE", "That amount is too large — contact support for help.", { fieldErrors: { amount: ["Enter a smaller amount."] } });

  return db.$transaction(async (tx) => {
    await lockStoreWallet(tx, input.storeId);
    const available = await getAvailableCents(input.storeId, tx);
    if (input.amountCents > available) {
      throw new WalletError("INSUFFICIENT_BALANCE", `You can withdraw up to $${(available / 100).toFixed(2)} right now.`, { fieldErrors: { amount: ["More than your available balance."] } });
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
    await addEntry(tx, {
      storeId: input.storeId,
      type: WalletEntryType.PAYOUT,
      amountCents: -input.amountCents,
      description: "Withdrawal requested",
      payoutId: payout.id,
      createdById: input.requestedById,
      idempotencyKey: `payout:${payout.id}:hold`,
    });
    await writeAudit({ actorId: input.requestedById, action: "wallet.payout.request", entityType: "Payout", entityId: payout.id, summary: `Withdrawal of ${(input.amountCents / 100).toFixed(2)} requested` }, tx);
    return payout;
  });
}

/** Staff move a withdrawal along: checked → being sent. The balance moved when it was requested. */
export async function setPayoutStatus(payoutId: string, status: PayoutStatus, actorId: string, reference?: string | null) {
  const payout = await db.payout.findUnique({ where: { id: payoutId } });
  if (!payout) throw new NotFoundError("Withdrawal not found.");
  if (payout.status === PayoutStatus.PAID || payout.status === PayoutStatus.REJECTED) throw new WalletError("PAYOUT_SETTLED", "This withdrawal has already been dealt with.");
  if (status !== PayoutStatus.APPROVED && status !== PayoutStatus.PROCESSING) throw new WalletError("PAYOUT_STATUS", "Use mark paid or decline to finish a withdrawal.");
  const updated = await db.payout.update({ where: { id: payout.id }, data: { status, reference: reference?.trim() || payout.reference } });
  await writeAudit({ actorId, action: "wallet.payout.status", entityType: "Payout", entityId: payout.id, summary: `Withdrawal of ${(payout.amountCents / 100).toFixed(2)} marked ${status.toLowerCase()}` });
  return updated;
}

/** Staff record that the money was sent. The balance already moved when the request was made. */
export async function markPayoutPaid(payoutId: string, actorId: string, reference?: string | null) {
  const payout = await db.payout.findUnique({ where: { id: payoutId }, include: { store: { select: { name: true } } } });
  if (!payout) throw new NotFoundError("Withdrawal not found.");
  if (payout.status === PayoutStatus.PAID || payout.status === PayoutStatus.REJECTED) throw new WalletError("PAYOUT_SETTLED", "This withdrawal has already been dealt with.");
  const updated = await db.payout.update({ where: { id: payout.id }, data: { status: PayoutStatus.PAID, processedById: actorId, processedAt: new Date(), reference: reference?.trim() || payout.reference } });
  await writeAudit({ actorId, action: "wallet.payout.paid", entityType: "Payout", entityId: payout.id, summary: `Withdrawal of ${(payout.amountCents / 100).toFixed(2)} to ${payout.store.name} marked paid` });
  return updated;
}

/** Refuses a withdrawal and returns the amount to the owner's balance. */
export async function rejectPayout(payoutId: string, actorId: string, reason: string) {
  return db.$transaction(async (tx) => {
    const payout = await tx.payout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundError("Withdrawal not found.");
    if (payout.status === PayoutStatus.PAID || payout.status === PayoutStatus.REJECTED) throw new WalletError("PAYOUT_SETTLED", "This withdrawal has already been dealt with.");
    await lockStoreWallet(tx, payout.storeId);
    const updated = await tx.payout.update({ where: { id: payout.id }, data: { status: PayoutStatus.REJECTED, processedById: actorId, processedAt: new Date(), reference: reason.trim() || null } });
    await addEntry(tx, {
      storeId: payout.storeId,
      type: WalletEntryType.PAYOUT_REVERSAL,
      amountCents: payout.amountCents,
      description: `Withdrawal declined${reason.trim() ? `: ${reason.trim()}` : ""}`,
      payoutId: payout.id,
      createdById: actorId,
      idempotencyKey: `payout:${payout.id}:reversal`,
    });
    await writeAudit({ actorId, action: "wallet.payout.reject", entityType: "Payout", entityId: payout.id, summary: `Withdrawal of ${(payout.amountCents / 100).toFixed(2)} declined` }, tx);
    return updated;
  });
}

// ─── Deposits ────────────────────────────────────────────────────────────────

/**
 * Records that the owner says they have transferred money to Zendropship. Nothing is credited here:
 * the balance changes only when staff confirm the transfer arrived.
 */
export async function recordDeposit(input: {
  storeId: string;
  amountCents: number;
  method: DepositMethod;
  network?: string | null;
  reference?: string | null;
  note?: string | null;
  proofMediaId?: string | null;
  createdById: string;
}) {
  if (!Number.isInteger(input.amountCents) || input.amountCents < MIN_DEPOSIT_CENTS) {
    throw new WalletError("DEPOSIT_TOO_SMALL", `The smallest deposit is $${(MIN_DEPOSIT_CENTS / 100).toFixed(2)}.`, { fieldErrors: { amount: [`Enter at least $${(MIN_DEPOSIT_CENTS / 100).toFixed(2)}.`] } });
  }
  if (input.amountCents > MAX_DEPOSIT_CENTS) throw new WalletError("DEPOSIT_TOO_LARGE", "That amount is too large — contact support for help.", { fieldErrors: { amount: ["Enter a smaller amount."] } });
  // Crypto cannot be matched against a bank statement, so it needs something to check: a transaction id or a screenshot.
  if (input.method === "CRYPTO" && !input.reference?.trim() && !input.proofMediaId) {
    throw new WalletError("PROOF_REQUIRED", "Add the transaction id or a screenshot so we can check the transfer.", { fieldErrors: { reference: ["Add the transaction id, or upload a screenshot."] } });
  }
  const deposit = await db.deposit.create({
    data: {
      storeId: input.storeId,
      amountCents: input.amountCents,
      method: input.method,
      network: input.network?.trim() || null,
      reference: input.reference?.trim() || null,
      note: input.note?.trim() || null,
      proofMediaId: input.proofMediaId ?? null,
      createdById: input.createdById,
    },
  });
  await writeAudit({ actorId: input.createdById, action: "wallet.deposit.record", entityType: "Deposit", entityId: deposit.id, summary: `${input.method === "CRYPTO" ? "Crypto" : "Bank"} deposit of ${(input.amountCents / 100).toFixed(2)} declared` });
  return deposit;
}

/** Staff confirm the money arrived; only now is the balance credited. */
export async function confirmDeposit(depositId: string, actorId: string, amountCents?: number) {
  return db.$transaction(async (tx) => {
    const deposit = await tx.deposit.findUnique({ where: { id: depositId } });
    if (!deposit) throw new NotFoundError("Deposit not found.");
    if (deposit.status !== DepositStatus.PENDING) throw new WalletError("DEPOSIT_SETTLED", "This deposit has already been dealt with.");
    await lockStoreWallet(tx, deposit.storeId);
    const amount = amountCents ?? deposit.amountCents;
    if (!Number.isInteger(amount) || amount <= 0) throw new WalletError("AMOUNT_INVALID", "Enter the amount that actually arrived.");
    const updated = await tx.deposit.update({ where: { id: deposit.id }, data: { status: DepositStatus.CONFIRMED, amountCents: amount, confirmedById: actorId, confirmedAt: new Date() } });
    await addEntry(tx, {
      storeId: deposit.storeId,
      type: WalletEntryType.DEPOSIT,
      amountCents: amount,
      description: "Deposit received",
      depositId: deposit.id,
      createdById: actorId,
      idempotencyKey: `deposit:${deposit.id}:credit`,
    });
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
    await lockStoreWallet(tx, storeId);
    const entry = await addEntry(tx, { storeId, type: WalletEntryType.ADJUSTMENT, amountCents, description: reason.trim(), createdById: actorId });
    await writeAudit({ actorId, action: "wallet.adjust", entityType: "Store", entityId: storeId, summary: `Balance adjusted by ${(amountCents / 100).toFixed(2)}: ${reason.trim()}` }, tx);
    return entry;
  });
}
