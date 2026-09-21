import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { OrderStatus, PaymentStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";

export const ADMIN_PAGE_SIZE = 25;

export type OrderListFilters = { q?: string; status?: string; payment?: string; page?: number; from?: string; to?: string; store?: string };

export async function listOrders(filters: OrderListFilters) {
  const where: Prisma.OrderWhereInput = {};
  if (filters.q) {
    const q = filters.q.trim();
    where.OR = [
      { number: { contains: q.toUpperCase() } },
      { email: { contains: q, mode: "insensitive" } },
      { user: { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }] } },
      { items: { some: { productName: { contains: q, mode: "insensitive" } } } },
      { shipments: { some: { trackingNumber: { contains: q, mode: "insensitive" } } } },
    ];
  }
  if (filters.status && filters.status in OrderStatus) where.status = filters.status as OrderStatus;
  if (filters.store) where.store = { slug: filters.store };
  if (filters.payment && filters.payment in PaymentStatus) where.paymentStatus = filters.payment as PaymentStatus;
  if (filters.from || filters.to) {
    where.placedAt = { ...(filters.from ? { gte: new Date(filters.from) } : {}), ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}) };
  }
  const page = Math.max(1, filters.page ?? 1);
  const [total, orders, counts] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      orderBy: { placedAt: "desc" },
      skip: (page - 1) * ADMIN_PAGE_SIZE,
      take: ADMIN_PAGE_SIZE,
      include: { user: { select: { firstName: true, lastName: true } }, store: { select: { name: true, slug: true, ownerId: true } }, _count: { select: { items: true } } },
    }),
    db.order.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  return { total, page, pageCount: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)), orders, statusCounts: Object.fromEntries(counts.map((row) => [row.status, row._count._all])) as Record<string, number> };
}

export async function getAdminOrder(id: string) {
  return db.order.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true, createdAt: true, _count: { select: { orders: true } } } },
      items: { orderBy: { id: "asc" }, include: { variant: { select: { stockQuantity: true, sku: true } } } },
      events: { orderBy: { createdAt: "desc" }, include: { actor: { select: { firstName: true, lastName: true } } } },
      payments: { orderBy: { createdAt: "desc" }, include: { transactions: { orderBy: { createdAt: "desc" } } } },
      shipments: { orderBy: { createdAt: "desc" } },
      couponRedemption: { include: { coupon: { select: { code: true, type: true, value: true } } } },
      store: { select: { id: true, slug: true, name: true, ownerId: true, logo: { select: { url: true, width: true, height: true } }, owner: { select: { id: true, email: true, firstName: true, lastName: true } } } },
      walletEntries: { orderBy: { createdAt: "asc" }, select: { id: true, type: true, amountCents: true, status: true, createdAt: true, description: true } },
    },
  });
}

export type AdminOrder = NonNullable<Awaited<ReturnType<typeof getAdminOrder>>>;
