import "server-only";
import { DepositStatus, OrderStatus, WalletEntryStatus, WalletEntryType } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { getAvailableCents, getBalanceCents, ORDER_ENTRY_TYPES, OPEN_PAYOUT_STATUSES } from "./service";

export const WALLET_PAGE_SIZE = 20;

/** Start of today, this week (Monday) and this month in the shop's own reckoning (UTC, as stored). */
function periodStarts(now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekday = (today.getUTCDay() + 6) % 7; // Monday = 0
  const week = new Date(today.getTime() - weekday * 86_400_000);
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { today, week, month };
}

/** Everything an order does to the balance — the sale, the wholesale cost, the commission and any reversal. */
const earningTypes = [...ORDER_ENTRY_TYPES];

export const WALLET_ENTRY_LABELS: Record<WalletEntryType, string> = {
  ORDER_SALE: "Sale",
  ORDER_FULFILMENT: "Fulfilment cost",
  ORDER_COMMISSION: "Zendropship commission",
  ORDER_REFUND: "Refund",
  FULFILMENT_REVERSAL: "Fulfilment cost returned",
  COMMISSION_REVERSAL: "Commission returned",
  ORDER_EARNING: "Order earnings",
  ORDER_REVERSAL: "Order reversed",
  PAYOUT: "Withdrawal",
  PAYOUT_REVERSAL: "Withdrawal returned",
  DEPOSIT: "Deposit",
  ADJUSTMENT: "Adjustment",
};

/**
 * Balance, what is withdrawable, money on its way, and what the store earned today, this week and this month.
 * Every figure comes from the ledger; nothing is stored or cached.
 */
export async function getWalletSummary(storeId: string) {
  const { today, week, month } = periodStarts();
  const sumOfTypes = async (types: WalletEntryType[]) =>
    (await db.walletEntry.aggregate({ where: { storeId, type: { in: types } }, _sum: { amountCents: true } }))._sum.amountCents ?? 0;
  // Earnings are what delivered orders made, counted on the day they were delivered: an order's cost may
  // be set aside when it is accepted, but it has earned nothing until the parcel arrives.
  const earnedSince = async (since?: Date) =>
    (
      await db.walletEntry.aggregate({
        where: { storeId, type: { in: earningTypes }, order: { status: OrderStatus.DELIVERED, ...(since ? { deliveredAt: { gte: since } } : {}) } },
        _sum: { amountCents: true },
      })
    )._sum.amountCents ?? 0;

  const [balanceCents, availableCents, pendingPayouts, pendingDeposits, deposited, fulfilment, commission, lifetime, earnedToday, earnedThisWeek, earnedThisMonth] = await Promise.all([
    getBalanceCents(storeId),
    getAvailableCents(storeId),
    db.payout.aggregate({ where: { storeId, status: { in: [...OPEN_PAYOUT_STATUSES] } }, _sum: { amountCents: true }, _count: { _all: true } }),
    db.deposit.aggregate({ where: { storeId, status: DepositStatus.PENDING }, _sum: { amountCents: true }, _count: { _all: true } }),
    sumOfTypes([WalletEntryType.DEPOSIT]),
    sumOfTypes([WalletEntryType.ORDER_FULFILMENT, WalletEntryType.FULFILMENT_REVERSAL]),
    sumOfTypes([WalletEntryType.ORDER_COMMISSION, WalletEntryType.COMMISSION_REVERSAL]),
    earnedSince(),
    earnedSince(today),
    earnedSince(week),
    earnedSince(month),
  ]);

  return {
    /** Everything the ledger says is owed, held order money included. */
    balanceCents,
    /** What can be withdrawn or spent on fulfilment now: deposits, delivered orders, less what is set aside. */
    availableCents,
    /** Held until delivery: what undelivered orders will release to the owner once they arrive. */
    pendingCents: balanceCents - availableCents,
    /** Requested withdrawals that have not been paid yet (already out of the balance). */
    pendingPayoutCents: pendingPayouts._sum.amountCents ?? 0,
    pendingPayoutCount: pendingPayouts._count._all,
    pendingDepositCents: pendingDeposits._sum.amountCents ?? 0,
    pendingDepositCount: pendingDeposits._count._all,
    totalDepositedCents: deposited,
    /** Wholesale charged for fulfilment, net of anything returned (a negative number). */
    fulfilmentChargedCents: fulfilment,
    commissionChargedCents: commission,
    lifetimeEarningsCents: lifetime,
    earnedTodayCents: earnedToday,
    earnedThisWeekCents: earnedThisWeek,
    earnedThisMonthCents: earnedThisMonth,
  };
}

export type WalletSummary = Awaited<ReturnType<typeof getWalletSummary>>;

/** The ledger, newest first, with a running balance so each row shows where the store stood afterwards. */
export async function listWalletEntries(storeId: string, options: { page?: number; pageSize?: number; type?: WalletEntryType } = {}) {
  const pageSize = options.pageSize ?? WALLET_PAGE_SIZE;
  const page = Math.max(1, options.page ?? 1);
  const where = { storeId, ...(options.type ? { type: options.type } : {}) };
  const [total, entries, balanceCents] = await Promise.all([
    db.walletEntry.count({ where }),
    db.walletEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { order: { select: { number: true } }, payout: { select: { status: true } }, deposit: { select: { status: true } }, createdBy: { select: { firstName: true, lastName: true } } },
    }),
    getBalanceCents(storeId),
  ]);

  // The running balance only means anything on the full ledger; a filtered view leaves it out.
  // Rows newer than this page already count towards the balance, so step back over them first.
  const newer = options.type || page === 1 ? [] : await db.walletEntry.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: (page - 1) * pageSize, select: { amountCents: true } });
  let running = balanceCents - newer.reduce((sum, entry) => sum + entry.amountCents, 0);
  const rows = entries.map((entry) => {
    const balanceAfterCents = options.type ? null : running;
    running -= entry.amountCents;
    return { ...entry, balanceAfterCents };
  });

  return { total, page, pageCount: Math.max(1, Math.ceil(total / pageSize)), entries: rows };
}

/** Withdrawals and deposits the owner has started, newest first. */
export async function listStoreTransfers(storeId: string, take = 10) {
  const [payouts, deposits] = await Promise.all([
    db.payout.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take }),
    db.deposit.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take }),
  ]);
  return { payouts, deposits };
}

/** Balances for a list of stores in one query — the admin stores table. */
export async function balancesByStore(storeIds: string[]) {
  if (storeIds.length === 0) return new Map<string, { balanceCents: number; availableCents: number }>();
  const rows = await db.walletEntry.groupBy({ by: ["storeId", "status"], where: { storeId: { in: storeIds } }, _sum: { amountCents: true } });
  const map = new Map<string, { balanceCents: number; availableCents: number }>();
  for (const id of storeIds) map.set(id, { balanceCents: 0, availableCents: 0 });
  for (const row of rows) {
    const current = map.get(row.storeId)!;
    const amount = row._sum.amountCents ?? 0;
    current.balanceCents += amount;
    if (row.status === WalletEntryStatus.CLEARED) current.availableCents += amount;
  }
  return map;
}
