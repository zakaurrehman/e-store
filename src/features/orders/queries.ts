import "server-only";
import { OrderStatus, PaymentStatus } from "@/generated/prisma/enums";
import { isAddressSnapshot, type AddressSnapshot } from "@/lib/address";
import { db } from "@/server/db";
import { hmacSha256, safeEqual } from "@/server/security/crypto";
import { normaliseOrderNumber } from "./numbers";

export const orderDetailInclude = {
  items: { orderBy: { id: "asc" as const } },
  events: { where: { isInternal: false }, orderBy: { createdAt: "asc" as const } },
  shipments: { orderBy: { createdAt: "desc" as const } },
  payments: { orderBy: { createdAt: "desc" as const } },
  shippingMethod: { select: { minDays: true, maxDays: true } },
};

export type CustomerOrder = NonNullable<Awaited<ReturnType<typeof getOrderForCustomer>>>;

function present<T extends { shippingAddress: unknown; billingAddress: unknown }>(order: T) {
  return {
    ...order,
    shippingAddress: (isAddressSnapshot(order.shippingAddress) ? order.shippingAddress : null) as AddressSnapshot | null,
    billingAddress: (isAddressSnapshot(order.billingAddress) ? order.billingAddress : null) as AddressSnapshot | null,
  };
}

/** Order detail for its owner (signed-in customer). */
export async function getOrderForCustomer(userId: string, number: string) {
  const order = await db.order.findFirst({ where: { number: normaliseOrderNumber(number), userId }, include: orderDetailInclude });
  return order ? present(order) : null;
}

/** Order detail for a guest holding the signed access token from their email. */
export async function getOrderByAccessToken(number: string, token: string | null | undefined) {
  if (!token) return null;
  const order = await db.order.findUnique({ where: { number: normaliseOrderNumber(number) }, include: orderDetailInclude });
  if (!order) return null;
  const expected = hmacSha256(`order-access:${order.number}:${order.email.toLowerCase()}`);
  if (!safeEqual(expected, token)) return null;
  return present(order);
}

/** Guest lookup by order number + email (used by /track-order). Returns the access token on success. */
export async function lookupOrder(number: string, email: string) {
  const order = await db.order.findUnique({ where: { number: normaliseOrderNumber(number) }, select: { number: true, email: true } });
  if (!order || order.email.toLowerCase() !== email.trim().toLowerCase()) return null;
  return { number: order.number, token: hmacSha256(`order-access:${order.number}:${order.email.toLowerCase()}`) };
}

export async function listCustomerOrders(userId: string, options: { page?: number; pageSize?: number } = {}) {
  const pageSize = options.pageSize ?? 10;
  const page = Math.max(1, options.page ?? 1);
  const where = { userId };
  const [total, orders] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      orderBy: { placedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { items: { orderBy: { id: "asc" }, take: 4, select: { id: true, productName: true, imageUrl: true, quantity: true } }, _count: { select: { items: true } } },
    }),
  ]);
  return { total, page, pageCount: Math.max(1, Math.ceil(total / pageSize)), orders };
}

export async function getCustomerOverview(userId: string) {
  const [orderCount, spend, recent, addresses, wishlistCount, unread] = await Promise.all([
    db.order.count({ where: { userId, status: { not: OrderStatus.CANCELLED } } }),
    db.order.aggregate({ where: { userId, paymentStatus: { in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED] } }, _sum: { totalCents: true } }),
    db.order.findMany({ where: { userId }, orderBy: { placedAt: "desc" }, take: 3, include: { items: { take: 3, select: { id: true, productName: true, imageUrl: true } } } }),
    db.address.count({ where: { userId, deletedAt: null } }),
    db.wishlistItem.count({ where: { wishlist: { userId } } }),
    db.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { orderCount, spendCents: spend._sum.totalCents ?? 0, recent, addresses, wishlistCount, unread };
}
