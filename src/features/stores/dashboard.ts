import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { OrderStatus, ProductStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { storedOrderFinance, unitEarning, type CommissionRule } from "@/features/finance/order-finance";
import { OPEN_STATUSES, WAITING_FOR_ACCEPTANCE } from "@/features/orders/status";
import { storePriceFor, summarisePrices, type StorePricingRules } from "./pricing";

/** Orders that count as sales: placed and not cancelled (unpaid online checkouts are still PENDING). */
const countedOrder = { status: { notIn: [OrderStatus.PENDING, OrderStatus.CANCELLED] } } satisfies Prisma.OrderWhereInput;

/**
 * The owner's headline figures. Money comes from each order's own stored breakdown (see
 * features/finance), so the dashboard, the order page and the ledger cannot drift apart.
 */
export async function getStoreStats(storeId: string) {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [activeProducts, hiddenProducts, orders, recentOrders, totals, openOrders, customers, byStatus] = await Promise.all([
    db.storeProduct.count({ where: { storeId, isActive: true, product: { status: ProductStatus.ACTIVE, deletedAt: null } } }),
    db.storeProduct.count({ where: { storeId, isActive: false } }),
    db.order.count({ where: { storeId, ...countedOrder } }),
    db.order.count({ where: { storeId, ...countedOrder, placedAt: { gte: since } } }),
    db.order.aggregate({
      where: { storeId, ...countedOrder },
      _sum: { totalCents: true, discountCents: true, subtotalCents: true, fulfilmentCostCents: true, commissionCents: true, ownerEarningCents: true },
    }),
    db.order.count({ where: { storeId, status: { in: OPEN_STATUSES } } }),
    db.order.groupBy({ by: ["email"], where: { storeId, ...countedOrder } }),
    db.order.groupBy({ by: ["status"], where: { storeId }, _count: { _all: true } }),
  ]);
  const counts = Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])) as Partial<Record<OrderStatus, number>>;
  const sum = totals._sum;
  return {
    activeProducts,
    hiddenProducts,
    orders,
    recentOrders,
    openOrders,
    customers: customers.length,
    /** What customers paid, shipping and tax included. */
    revenueCents: sum.totalCents ?? 0,
    /** The goods themselves, after discounts — what commission is worked out on. */
    goodsSoldCents: Math.max(0, (sum.subtotalCents ?? 0) - (sum.discountCents ?? 0)),
    fulfilmentCostCents: sum.fulfilmentCostCents ?? 0,
    commissionCents: sum.commissionCents ?? 0,
    /** Goods sold less wholesale less commission — the owner's share. */
    earningsCents: sum.ownerEarningCents ?? 0,
    byStatus: {
      pendingPayment: counts.PENDING ?? 0,
      /** Waiting for the owner to press Accept — nothing happens to these until they do. */
      toAccept: (counts.CONFIRMED ?? 0) + (counts.AWAITING_FUNDS ?? 0),
      withFulfilment: (counts.ACCEPTED ?? 0) + (counts.PROCESSING ?? 0) + (counts.PACKED ?? 0),
      shipped: (counts.SHIPPED ?? 0) + (counts.OUT_FOR_DELIVERY ?? 0),
      delivered: counts.DELIVERED ?? 0,
      cancelled: counts.CANCELLED ?? 0,
    },
  };
}

export type StoreProductRow = Awaited<ReturnType<typeof listStoreProducts>>["rows"][number];

/** The owner's shelf with what each product costs them, what it sells for in their store and the margin. */
export async function listStoreProducts(store: { id: string; pricing: StorePricingRules }, options: { page?: number; q?: string; pageSize?: number; commission: CommissionRule }) {
  const pageSize = options.pageSize ?? 25;
  const page = Math.max(1, options.page ?? 1);
  const q = options.q?.trim().slice(0, 80);
  const where: Prisma.StoreProductWhereInput = {
    storeId: store.id,
    product: { deletedAt: null, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { brand: { name: { contains: q, mode: "insensitive" } } }] } : {}) },
  };
  const [total, entries] = await Promise.all([
    db.storeProduct.count({ where }),
    db.storeProduct.findMany({
      where,
      orderBy: [{ position: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        product: {
          select: {
            id: true,
            slug: true,
            name: true,
            status: true,
            inStock: true,
            totalStock: true,
            brand: { select: { name: true } },
            images: { orderBy: { position: "asc" }, take: 1, select: { media: { select: { url: true } } } },
            variants: { where: { isActive: true }, select: { priceCents: true, salePriceCents: true, costCents: true } },
          },
        },
      },
    }),
  ]);
  const rows = entries.map((entry) => {
    const override = { markupBps: entry.markupBps, fixedPriceCents: entry.fixedPriceCents };
    const summary = summarisePrices(entry.product.variants.map((variant) => storePriceFor(variant, store.pricing, override)));
    const suggested = summarisePrices(entry.product.variants.map((variant) => storePriceFor(variant, { mode: "SUGGESTED", markupBps: 0 })));
    return {
      productId: entry.product.id,
      slug: entry.product.slug,
      name: entry.product.name,
      brand: entry.product.brand?.name ?? null,
      imageUrl: entry.product.images[0]?.media.url ?? null,
      isActive: entry.isActive,
      sellable: entry.product.status === ProductStatus.ACTIVE,
      inStock: entry.product.inStock,
      stock: entry.product.totalStock,
      markupBps: entry.markupBps,
      fixedPriceCents: entry.fixedPriceCents,
      priceCents: summary.priceCents,
      maxPriceCents: summary.maxPriceCents,
      costCents: summary.costCents,
      suggestedCents: suggested.priceCents,
      /** What the owner keeps per unit: price − wholesale − commission, the same rule as every order. */
      marginCents: unitEarning(summary.priceCents, summary.costCents, options.commission).earningCents,
      hasVariants: entry.product.variants.length > 1,
    };
  });
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function listStoreOrders(storeId: string, options: { page?: number; status?: string; pageSize?: number } = {}) {
  const pageSize = options.pageSize ?? 20;
  const page = Math.max(1, options.page ?? 1);
  // "TO_ACCEPT" is every order waiting for the owner to accept it, whichever of the two statuses it is in.
  const status = options.status === "TO_ACCEPT" ? { in: WAITING_FOR_ACCEPTANCE } : Object.values(OrderStatus).includes(options.status as OrderStatus) ? (options.status as OrderStatus) : undefined;
  const where: Prisma.OrderWhereInput = { storeId, ...(status ? { status } : {}) };
  const [total, orders] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      orderBy: { placedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        number: true,
        email: true,
        status: true,
        paymentStatus: true,
        paymentProvider: true,
        totalCents: true,
        discountCents: true,
        currency: true,
        placedAt: true,
        shippingAddress: true,
        subtotalCents: true,
        shippingCents: true,
        taxCents: true,
        fulfilmentCostCents: true,
        commissionCents: true,
        commissionRateBps: true,
        commissionBase: true,
        ownerEarningCents: true,
        items: { select: { quantity: true } },
      },
    }),
  ]);
  return {
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    orders: orders.map((order) => ({
      ...order,
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      finance: storedOrderFinance(order),
    })),
  };
}

export async function getStoreOrder(storeId: string, number: string) {
  return db.order.findFirst({
    where: { storeId, number: number.toUpperCase() },
    include: {
      items: { orderBy: { id: "asc" } },
      events: { where: { isInternal: false }, orderBy: { createdAt: "asc" } },
      shipments: { orderBy: { createdAt: "desc" } },
    },
  });
}

/** Everyone who bought from the store (by email, guests included), newest first. */
export async function listStoreCustomers(storeId: string, options: { page?: number; pageSize?: number } = {}) {
  const pageSize = options.pageSize ?? 25;
  const page = Math.max(1, options.page ?? 1);
  const groups = await db.order.groupBy({
    by: ["email"],
    where: { storeId, ...countedOrder },
    _count: { _all: true },
    _sum: { totalCents: true },
    _max: { placedAt: true },
    orderBy: { _max: { placedAt: "desc" } },
  });
  const signups = await db.user.count({ where: { registeredStoreId: storeId, deletedAt: null } });
  const slice = groups.slice((page - 1) * pageSize, page * pageSize);
  const users = await db.user.findMany({ where: { email: { in: slice.map((group) => group.email) } }, select: { email: true, firstName: true, lastName: true } });
  const names = new Map(users.map((user) => [user.email, `${user.firstName} ${user.lastName}`]));
  return {
    total: groups.length,
    signups,
    page,
    pageCount: Math.max(1, Math.ceil(groups.length / pageSize)),
    customers: slice.map((group) => ({
      email: group.email,
      name: names.get(group.email) ?? null,
      orders: group._count._all,
      spentCents: group._sum.totalCents ?? 0,
      lastOrderAt: group._max.placedAt,
    })),
  };
}
