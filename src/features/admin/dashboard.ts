import "server-only";
import { OrderStatus, PaymentStatus, ReviewStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";

export type RangeKey = "7d" | "30d" | "90d" | "12m";
export const RANGES: Array<{ key: RangeKey; label: string; days: number }> = [
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
  { key: "12m", label: "Last 12 months", days: 365 },
];

export function parseRange(value: string | undefined): (typeof RANGES)[number] {
  return RANGES.find((range) => range.key === value) ?? RANGES[1];
}

const PAID = [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED];

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

export type SeriesPoint = { date: string; value: number };

function fillDays(rows: Array<{ day: Date | string; value: number | bigint }>, from: Date, days: number, bucket: "day" | "week"): SeriesPoint[] {
  const byKey = new Map(rows.map((row) => [new Date(row.day).toISOString().slice(0, 10), Number(row.value)]));
  const points: SeriesPoint[] = [];
  const step = bucket === "week" ? 7 : 1;
  for (let offset = 0; offset < days; offset += step) {
    const date = new Date(from.getTime() + offset * 86_400_000);
    const key = date.toISOString().slice(0, 10);
    points.push({ date: key, value: byKey.get(key) ?? 0 });
  }
  return points;
}

export async function getDashboardData(rangeKey?: string) {
  const range = parseRange(rangeKey);
  const now = new Date();
  const from = startOfDay(new Date(now.getTime() - (range.days - 1) * 86_400_000));
  const previousFrom = new Date(from.getTime() - range.days * 86_400_000);
  const bucket: "day" | "week" = range.days > 90 ? "week" : "day";
  const trunc = bucket === "week" ? "week" : "day";

  const paidWhere = (start: Date, end: Date) => ({ paymentStatus: { in: PAID }, status: { not: OrderStatus.CANCELLED }, placedAt: { gte: start, lt: end } });

  const [current, previous, revenueRows, orderRows, customerRows, topProducts, topCategoryRows, statusCounts, pendingCount, failedCount, lowStock, recentOrders, customersTotal, customersNew, returning, pendingReviews, newMessages, inventoryValue] = await Promise.all([
    db.order.aggregate({ where: paidWhere(from, now), _sum: { totalCents: true }, _count: { _all: true } }),
    db.order.aggregate({ where: paidWhere(previousFrom, from), _sum: { totalCents: true }, _count: { _all: true } }),
    db.$queryRaw<Array<{ day: Date; value: bigint }>>`
      SELECT date_trunc(${trunc}, "placedAt" AT TIME ZONE 'UTC') AS day, COALESCE(SUM("totalCents" - "refundedCents"), 0)::bigint AS value
      FROM "Order" WHERE "paymentStatus" IN ('PAID','PARTIALLY_REFUNDED','REFUNDED') AND "status" <> 'CANCELLED' AND "placedAt" >= ${from}
      GROUP BY 1 ORDER BY 1`,
    db.$queryRaw<Array<{ day: Date; value: bigint }>>`
      SELECT date_trunc(${trunc}, "placedAt" AT TIME ZONE 'UTC') AS day, COUNT(*)::bigint AS value
      FROM "Order" WHERE "status" <> 'CANCELLED' AND "placedAt" >= ${from}
      GROUP BY 1 ORDER BY 1`,
    db.$queryRaw<Array<{ day: Date; value: bigint }>>`
      SELECT date_trunc(${trunc}, u."createdAt" AT TIME ZONE 'UTC') AS day, COUNT(*)::bigint AS value
      FROM "User" u JOIN "Role" r ON r."id" = u."roleId" WHERE r."key" = 'CUSTOMER' AND u."createdAt" >= ${from}
      GROUP BY 1 ORDER BY 1`,
    db.$queryRaw<Array<{ productId: string; name: string; slug: string; units: bigint; revenue: bigint }>>`
      SELECT i."productId", p."name", p."slug", SUM(i."quantity")::bigint AS units, SUM(i."totalCents")::bigint AS revenue
      FROM "OrderItem" i JOIN "Order" o ON o."id" = i."orderId" JOIN "Product" p ON p."id" = i."productId"
      WHERE o."paymentStatus" IN ('PAID','PARTIALLY_REFUNDED','REFUNDED') AND o."status" <> 'CANCELLED' AND o."placedAt" >= ${from}
      GROUP BY 1, 2, 3 ORDER BY revenue DESC LIMIT 8`,
    db.$queryRaw<Array<{ name: string; slug: string; revenue: bigint }>>`
      SELECT c."name", c."slug", SUM(i."totalCents")::bigint AS revenue
      FROM "OrderItem" i JOIN "Order" o ON o."id" = i."orderId" JOIN "Product" p ON p."id" = i."productId"
      JOIN "Category" c ON c."id" = p."primaryCategoryId"
      WHERE o."paymentStatus" IN ('PAID','PARTIALLY_REFUNDED','REFUNDED') AND o."status" <> 'CANCELLED' AND o."placedAt" >= ${from}
      GROUP BY 1, 2 ORDER BY revenue DESC LIMIT 8`,
    db.order.groupBy({ by: ["status"], where: { placedAt: { gte: from } }, _count: { _all: true } }),
    db.order.count({ where: { status: { in: [OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.PACKED] } } }),
    db.order.count({ where: { paymentStatus: PaymentStatus.FAILED, status: { not: OrderStatus.CANCELLED } } }),
    db.$queryRaw<Array<{ id: string; sku: string | null; title: string; stockQuantity: number; lowStockThreshold: number; productId: string; productName: string }>>`
      SELECT v."id", v."sku", v."title", v."stockQuantity", v."lowStockThreshold", p."id" AS "productId", p."name" AS "productName"
      FROM "ProductVariant" v JOIN "Product" p ON p."id" = v."productId"
      WHERE v."isActive" AND v."trackInventory" AND p."status" = 'ACTIVE' AND p."deletedAt" IS NULL AND v."stockQuantity" <= v."lowStockThreshold"
      ORDER BY v."stockQuantity" ASC LIMIT 12`,
    db.order.findMany({ orderBy: { placedAt: "desc" }, take: 8, include: { user: { select: { firstName: true, lastName: true } }, _count: { select: { items: true } } } }),
    db.user.count({ where: { role: { key: "CUSTOMER" }, deletedAt: null } }),
    db.user.count({ where: { role: { key: "CUSTOMER" }, deletedAt: null, createdAt: { gte: from } } }),
    db.$queryRaw<Array<{ returning: bigint; total: bigint }>>`
      SELECT COUNT(*) FILTER (WHERE order_count > 1)::bigint AS returning, COUNT(*)::bigint AS total
      FROM (SELECT COALESCE("userId", "email") AS customer, COUNT(*) AS order_count FROM "Order"
            WHERE "paymentStatus" IN ('PAID','PARTIALLY_REFUNDED','REFUNDED') AND "status" <> 'CANCELLED' AND "placedAt" >= ${from} GROUP BY 1) t`,
    db.review.count({ where: { status: ReviewStatus.PENDING, deletedAt: null } }),
    db.contactMessage.count({ where: { status: "NEW" } }),
    db.$queryRaw<Array<{ units: bigint; value: bigint }>>`
      SELECT COALESCE(SUM(v."stockQuantity"), 0)::bigint AS units, COALESCE(SUM(v."stockQuantity" * COALESCE(v."costCents", v."priceCents")), 0)::bigint AS value
      FROM "ProductVariant" v JOIN "Product" p ON p."id" = v."productId" WHERE v."isActive" AND v."trackInventory" AND p."deletedAt" IS NULL`,
  ]);

  const revenue = current._sum.totalCents ?? 0;
  const orders = current._count._all;
  const previousRevenue = previous._sum.totalCents ?? 0;
  const previousOrders = previous._count._all;
  const delta = (value: number, base: number) => (base === 0 ? null : Math.round(((value - base) / base) * 1000) / 10);
  const returningRow = returning[0];

  return {
    range,
    from,
    kpis: {
      revenueCents: revenue,
      revenueDelta: delta(revenue, previousRevenue),
      orders,
      ordersDelta: delta(orders, previousOrders),
      aovCents: orders ? Math.round(revenue / orders) : 0,
      aovDelta: previousOrders ? delta(Math.round(revenue / Math.max(1, orders)), Math.round(previousRevenue / previousOrders)) : null,
      customersTotal,
      customersNew,
      returningRate: returningRow && Number(returningRow.total) > 0 ? Math.round((Number(returningRow.returning) / Number(returningRow.total)) * 100) : null,
      pendingFulfilment: pendingCount,
      failedPayments: failedCount,
      pendingReviews,
      newMessages,
      inventoryUnits: Number(inventoryValue[0]?.units ?? 0),
      inventoryValueCents: Number(inventoryValue[0]?.value ?? 0),
    },
    series: {
      bucket,
      revenue: fillDays(revenueRows, from, range.days, bucket),
      orders: fillDays(orderRows, from, range.days, bucket),
      customers: fillDays(customerRows, from, range.days, bucket),
    },
    topProducts: topProducts.map((row) => ({ id: row.productId, name: row.name, slug: row.slug, units: Number(row.units), revenueCents: Number(row.revenue) })),
    topCategories: topCategoryRows.map((row) => ({ name: row.name, slug: row.slug, revenueCents: Number(row.revenue) })),
    statusCounts: Object.fromEntries(statusCounts.map((row) => [row.status, row._count._all])) as Record<string, number>,
    lowStock,
    recentOrders,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
