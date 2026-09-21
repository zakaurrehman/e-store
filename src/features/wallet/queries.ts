import "server-only";
import { DepositStatus, PayoutStatus, WalletEntryType } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { getBalanceCents } from "./service";

export const WALLET_PAGE_SIZE = 20;

/** Start of today, this week (Monday) and this month in the shop's own reckoning (UTC, as stored). */
function periodStarts(now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekday = (today.getUTCDay() + 6) % 7; // Monday = 0
  const week = new Date(today.getTime() - weekday * 86_400_000);
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { today, week, month };
}

const earningTypes = [WalletEntryType.ORDER_EARNING, WalletEntryType.ORDER_REVERSAL];

/** Balance, money on hold in withdrawals, and what the store earned today, this week and this month. */
export async function getWalletSummary(storeId: string) {
  const { today, week, month } = periodStarts();
  const earnedSince = async (since: Date) =>
    (await db.walletEntry.aggregate({ where: { storeId, type: { in: earningTypes }, createdAt: { gte: since } }, _sum: { amountCents: true } }))._sum.amountCents ?? 0;

  const [balanceCents, pendingPayouts, pendingDeposits, lifetime, earnedToday, earnedThisWeek, earnedThisMonth] = await Promise.all([
    getBalanceCents(storeId),
    db.payout.aggregate({ where: { storeId, status: PayoutStatus.REQUESTED }, _sum: { amountCents: true }, _count: { _all: true } }),
    db.deposit.count({ where: { storeId, status: DepositStatus.PENDING } }),
    db.walletEntry.aggregate({ where: { storeId, type: { in: earningTypes } }, _sum: { amountCents: true } }),
    earnedSince(today),
    earnedSince(week),
    earnedSince(month),
  ]);

  return {
    balanceCents,
    /** Requested withdrawals that have not been paid yet (already deducted from the balance). */
    pendingPayoutCents: pendingPayouts._sum.amountCents ?? 0,
    pendingPayoutCount: pendingPayouts._count._all,
    pendingDepositCount: pendingDeposits,
    lifetimeEarningsCents: lifetime._sum.amountCents ?? 0,
    earnedTodayCents: earnedToday,
    earnedThisWeekCents: earnedThisWeek,
    earnedThisMonthCents: earnedThisMonth,
  };
}

export type WalletSummary = Awaited<ReturnType<typeof getWalletSummary>>;

/** The ledger, newest first, with a running balance so each row shows where the store stood afterwards. */
export async function listWalletEntries(storeId: string, options: { page?: number; pageSize?: number } = {}) {
  const pageSize = options.pageSize ?? WALLET_PAGE_SIZE;
  const page = Math.max(1, options.page ?? 1);
  const [total, entries, balanceCents] = await Promise.all([
    db.walletEntry.count({ where: { storeId } }),
    db.walletEntry.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { order: { select: { number: true } }, payout: { select: { status: true } }, deposit: { select: { status: true } } },
    }),
    getBalanceCents(storeId),
  ]);

  // Rows newer than this page already count towards the balance, so step back over them first.
  const newer = page === 1 ? [] : await db.walletEntry.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: (page - 1) * pageSize, select: { amountCents: true } });
  let running = balanceCents - newer.reduce((sum, entry) => sum + entry.amountCents, 0);
  const rows = entries.map((entry) => {
    const balanceAfterCents = running;
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
