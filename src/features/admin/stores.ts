import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { OrderStatus, StoreStatus } from "@/generated/prisma/enums";
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
        _count: { select: { products: { where: { isActive: true } } } },
      },
    }),
  ]);
  const ids = stores.map((store) => store.id);
  const sales = ids.length
    ? await db.order.groupBy({ by: ["storeId"], where: { storeId: { in: ids }, status: { notIn: [OrderStatus.PENDING, OrderStatus.CANCELLED] } }, _count: { _all: true }, _sum: { totalCents: true } })
    : [];
  const byStore = new Map(sales.map((row) => [row.storeId, { orders: row._count._all, salesCents: row._sum.totalCents ?? 0 }]));
  return {
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / STORES_PAGE_SIZE)),
    stores: stores.map((store) => ({ ...store, products: store._count.products, ...(byStore.get(store.id) ?? { orders: 0, salesCents: 0 }) })),
  };
}
