import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { OrderStatus, StoreStatus, WalletEntryType } from "@/generated/prisma/enums";
import { balancesByStore, getWalletSummary, listWalletEntries } from "@/features/wallet/queries";
import { db } from "@/server/db";

export const STORES_PAGE_SIZE = 25;

/** Every store on the platform with its owner and headline numbers, for the admin. */
export async function listStoresForAdmin(filters: { q?: string; status?: string; page?: number }) {
  const where: Prisma.StoreWhereInput = { deletedAt: null };
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { slug: { contains: q.toLowerCase() } },
      { owner: { email: { contains: q, mode: "insensitive" } } },
    ];
  }
  if (filters.status && filters.status in StoreStatus) where.status = filters.status as StoreStatus;
  const page = Math.max(1, filters.page ?? 1);
  const [total, stores] = await Promise.all([
    db.store.count({ where }),
    db.store.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * STORES_PAGE_SIZE,
      take: STORES_PAGE_SIZE,
      include: {
        owner: { select: { id: true, email: true, firstName: true, lastName: true } },
        logo: { select: { url: true, width: true, height: true } },
        referral: { orderBy: { createdAt: "asc" }, take: 1, include: { code: { select: { code: true } } } },
        _count: { select: { products: { where: { isActive: true } } } },
      },
    }),
  ]);
  const ids = stores.map((store) => store.id);
  const sales = ids.length
    ? await db.order.groupBy({ by: ["storeId"], where: { storeId: { in: ids }, status: { notIn: [OrderStatus.PENDING, OrderStatus.CANCELLED] } }, _count: { _all: true }, _sum: { totalCents: true } })
    : [];
  const byStore = new Map(sales.map((row) => [row.storeId, { orders: row._count._all, salesCents: row._sum.totalCents ?? 0 }]));
  const balances = await balancesByStore(ids);
  const awaiting = ids.length ? await db.order.groupBy({ by: ["storeId"], where: { storeId: { in: ids }, status: OrderStatus.AWAITING_FUNDS }, _count: { _all: true } }) : [];
  const waitingByStore = new Map(awaiting.map((row) => [row.storeId, row._count._all]));
  return {
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / STORES_PAGE_SIZE)),
    stores: stores.map((store) => ({
      ...store,
      products: store._count.products,
      ...(byStore.get(store.id) ?? { orders: 0, salesCents: 0 }),
      balanceCents: balances.get(store.id)?.balanceCents ?? 0,
      availableCents: balances.get(store.id)?.availableCents ?? 0,
      awaitingFunds: waitingByStore.get(store.id) ?? 0,
      invitation: store.referral[0]?.code.code ?? null,
    })),
  };
}

/**
 * One store with everything an admin needs in front of them: the owner's account, the store itself,
 * its money, its recent orders and deposits, and the trail of what staff and the owner have done.
 */
export async function getStoreForAdmin(storeId: string) {
  const store = await db.store.findFirst({
    where: { id: storeId, deletedAt: null },
    include: {
      owner: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, status: true, emailVerifiedAt: true, mustResetPassword: true, lastLoginAt: true, createdAt: true, role: { select: { name: true, isStaff: true } } } },
      logo: { select: { url: true, width: true, height: true } },
      referral: { orderBy: { createdAt: "asc" }, take: 1, include: { code: { select: { code: true } } } },
      deposits: { orderBy: { createdAt: "desc" }, take: 10, include: { proof: { select: { url: true, width: true, height: true, filename: true, mimeType: true } }, entries: { where: { type: WalletEntryType.DEPOSIT }, select: { amountCents: true } } } },
      payouts: { orderBy: { createdAt: "desc" }, take: 10 },
      orders: { orderBy: { placedAt: "desc" }, take: 10, select: { id: true, number: true, status: true, paymentStatus: true, totalCents: true, currency: true, placedAt: true, ownerEarningCents: true } },
      _count: { select: { products: true, orders: true, messages: true } },
    },
  });
  if (!store) return null;

  const [summary, ledger, sales, storeAudit, ownerAudit, conversations] = await Promise.all([
    getWalletSummary(store.id),
    listWalletEntries(store.id, { pageSize: 8 }),
    db.order.aggregate({ where: { storeId: store.id, status: { notIn: [OrderStatus.PENDING, OrderStatus.CANCELLED] } }, _sum: { totalCents: true }, _count: { _all: true } }),
    db.auditLog.findMany({ where: { entityType: "Store", entityId: store.id }, orderBy: { createdAt: "desc" }, take: 15, include: { actor: { select: { firstName: true, lastName: true } } } }),
    store.ownerId
      ? db.auditLog.findMany({ where: { actorId: store.ownerId }, orderBy: { createdAt: "desc" }, take: 15, include: { actor: { select: { firstName: true, lastName: true } } } })
      : Promise.resolve([]),
    // Everything written about this store, and anything its owner asked Zendropship.
    db.contactMessage.findMany({
      where: store.ownerId ? { OR: [{ storeId: store.id }, { storeId: null, userId: store.ownerId }] } : { storeId: store.id },
      orderBy: { lastMessageAt: "desc" },
      take: 8,
      select: { id: true, subject: true, name: true, status: true, storeId: true, unreadForStaff: true, lastMessageAt: true, _count: { select: { replies: true } } },
    }),
  ]);

  // One history for the store and its owner, newest first. An action by the owner on their own store is
  // in both queries, so it is kept once.
  const activity = [...new Map([...storeAudit, ...ownerAudit].map((entry) => [entry.id, entry])).values()]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 20);

  return {
    store,
    summary,
    ledger,
    activity,
    conversations,
    salesCents: sales._sum.totalCents ?? 0,
    orderCount: sales._count._all,
    invitation: store.referral[0]?.code.code ?? null,
  };
}

export type AdminStoreDetail = NonNullable<Awaited<ReturnType<typeof getStoreForAdmin>>>;
