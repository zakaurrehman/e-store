import "server-only";
import { DepositStatus, OrderStatus, PayoutStatus, StoreStatus } from "@/generated/prisma/enums";
import { cancelOrder } from "@/features/orders/service";
import { getBalanceCents, lockStoreWallet } from "@/features/wallet/service";
import { writeAudit } from "@/server/audit";
import { db, type DbClient } from "@/server/db";
import { DomainError, NotFoundError } from "@/server/errors";
import type { NotificationEvent } from "@/server/notifications";
import { formatMoney } from "@/utils/money";

export class StoreDeletionError extends DomainError {}

/**
 * Deleting a store, permanently.
 *
 * What goes: everything that makes it a store — its shelf, bags, coupons, customer conversations, its
 * address (the subdomain stops resolving and can be taken again), its logo and domain links, and its
 * owner's access (they can open another store only with a new invitation). Unpaid orders are cancelled.
 *
 * What stays, read-only: its orders, wallet ledger, deposits and withdrawals, and the audit trail. They
 * record real money — customers' payments and the owner's — so they are kept for the books, and the store
 * row stays behind them as a record (marked deleted, with who owned it), so nothing is left pointing at
 * nothing. The schema enforces this too: orders refuse to lose their store, and the ledger would vanish
 * with it.
 *
 * It is refused while the store still has business that deleting would strand: open orders, deposits
 * waiting for review, withdrawals in progress, or money in the owner's balance.
 */

const OPEN_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.AWAITING_FUNDS,
  OrderStatus.ACCEPTED,
  OrderStatus.PROCESSING,
  OrderStatus.PACKED,
  OrderStatus.SHIPPED,
  OrderStatus.OUT_FOR_DELIVERY,
];
const PAYOUTS_IN_PROGRESS: PayoutStatus[] = [PayoutStatus.REQUESTED, PayoutStatus.APPROVED, PayoutStatus.PROCESSING];

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

async function blockersFor(client: DbClient, store: { id: string; ownerId: string | null; currency: string }) {
  if (!store.ownerId) return ["Zendropship's own store can't be deleted."];
  const [openOrders, pendingDeposits, payouts, balanceCents] = await Promise.all([
    client.order.count({ where: { storeId: store.id, status: { in: OPEN_ORDER_STATUSES } } }),
    client.deposit.count({ where: { storeId: store.id, status: DepositStatus.PENDING } }),
    client.payout.count({ where: { storeId: store.id, status: { in: PAYOUTS_IN_PROGRESS } } }),
    getBalanceCents(store.id, client),
  ]);
  const blockers: string[] = [];
  if (openOrders) blockers.push(`${plural(openOrders, "order")} still open — deliver, cancel or refund ${openOrders === 1 ? "it" : "them"} first.`);
  if (pendingDeposits) blockers.push(`${plural(pendingDeposits, "deposit")} waiting for review — approve or reject ${pendingDeposits === 1 ? "it" : "them"} first.`);
  if (payouts) blockers.push(`${plural(payouts, "withdrawal")} in progress — mark ${payouts === 1 ? "it" : "them"} paid or decline ${payouts === 1 ? "it" : "them"} first.`);
  if (balanceCents > 0) blockers.push(`The owner still has ${formatMoney(balanceCents, store.currency)} in their balance. It has to be withdrawn first — deleting the store would leave them unable to reach it.`);
  if (balanceCents < 0) blockers.push(`The store's balance is ${formatMoney(balanceCents, store.currency)}. Settle it before deleting the store.`);
  return blockers;
}

const liveStore = (storeId: string) =>
  db.store.findFirst({
    where: { id: storeId, deletedAt: null },
    select: { id: true, name: true, slug: true, ownerId: true, currency: true, owner: { select: { email: true } } },
  });

export type StoreDeletionPreview = Awaited<ReturnType<typeof storeDeletionPreview>>;

/** What deleting the store would remove and keep, and anything that stops it right now. */
export async function storeDeletionPreview(storeId: string) {
  const store = await liveStore(storeId);
  if (!store) throw new NotFoundError("Store not found.");
  const [blockers, products, carts, coupons, conversations, unpaidOrders, signups, orders, ledgerEntries, deposits, payouts] = await Promise.all([
    blockersFor(db, store),
    db.storeProduct.count({ where: { storeId } }),
    db.cart.count({ where: { storeId } }),
    db.coupon.count({ where: { storeId, deletedAt: null } }),
    db.contactMessage.count({ where: { storeId } }),
    db.order.count({ where: { storeId, status: OrderStatus.PENDING } }),
    db.user.count({ where: { registeredStoreId: storeId } }),
    db.order.count({ where: { storeId, status: { not: OrderStatus.PENDING } } }),
    db.walletEntry.count({ where: { storeId } }),
    db.deposit.count({ where: { storeId } }),
    db.payout.count({ where: { storeId } }),
  ]);
  return {
    store: { id: store.id, name: store.name, slug: store.slug, ownerEmail: store.owner?.email ?? null },
    blockers,
    removes: { products, carts, coupons, conversations, unpaidOrders, signups },
    keeps: { orders, ledgerEntries, deposits, payouts },
  };
}

/** What `confirmation` must be: the store's address, typed out. */
const confirms = (typed: string, slug: string) => typed.trim().toLowerCase() === slug;

/**
 * Deletes the store. `confirmation` must be the store's address, typed by the person deleting it — the
 * server checks it, so no single click or stray request can delete a store.
 */
export async function deleteStore(storeId: string, confirmation: string, actorId: string): Promise<{ name: string; slug: string; notifications: NotificationEvent[] }> {
  const preview = await storeDeletionPreview(storeId);
  const { store } = preview;
  if (!confirms(confirmation, store.slug)) {
    throw new StoreDeletionError("CONFIRMATION_MISMATCH", `Type the store's address, ${store.slug}, to confirm.`, { fieldErrors: { confirmation: [`Type ${store.slug} exactly.`] } });
  }
  if (preview.blockers.length) throw new StoreDeletionError("STORE_NOT_DELETABLE", `This store can't be deleted yet. ${preview.blockers.join(" ")}`, { status: 409 });

  // Unpaid orders never took any money: cancel them — their stock goes back — rather than leave them open.
  const notifications: NotificationEvent[] = [];
  const unpaid = await db.order.findMany({ where: { storeId, status: OrderStatus.PENDING }, select: { id: true } });
  for (const order of unpaid) notifications.push(...(await cancelOrder(order.id, "The store was closed", actorId)));

  const now = new Date();
  const removed = await db.$transaction(async (tx) => {
    // Hold the store and its wallet, and check again: an order or a withdrawal may have arrived meanwhile.
    await tx.$executeRaw`SELECT 1 FROM "Store" WHERE "id" = ${storeId} FOR UPDATE`;
    await lockStoreWallet(tx, storeId);
    const current = await tx.store.findFirst({ where: { id: storeId, deletedAt: null }, select: { id: true, ownerId: true, currency: true } });
    if (!current) throw new NotFoundError("Store not found.");
    const blockers = await blockersFor(tx, current);
    if (blockers.length) throw new StoreDeletionError("STORE_NOT_DELETABLE", `This store can't be deleted yet. ${blockers.join(" ")}`, { status: 409 });
    if (await tx.order.count({ where: { storeId, status: OrderStatus.PENDING } })) {
      throw new StoreDeletionError("STORE_NOT_DELETABLE", "A new order arrived while the store was being deleted. Try again.", { status: 409 });
    }

    const products = await tx.storeProduct.deleteMany({ where: { storeId } });
    const carts = await tx.cart.deleteMany({ where: { storeId } });
    // Coupons are retired rather than erased: an order that used one keeps the record of it.
    const coupons = await tx.coupon.updateMany({ where: { storeId, deletedAt: null }, data: { isActive: false, deletedAt: now } });
    const conversations = await tx.contactMessage.deleteMany({ where: { storeId } });
    // Customers who signed up in the store keep their accounts; they simply no longer belong to it.
    const signups = await tx.user.updateMany({ where: { registeredStoreId: storeId }, data: { registeredStoreId: null } });
    await tx.store.update({
      where: { id: storeId },
      data: {
        deletedAt: now,
        status: StoreStatus.SUSPENDED,
        // Free the address; "deleted-" plus the id is longer than any address a store can choose, so it never collides.
        slug: `deleted-${storeId}`,
        customDomain: null,
        stripeAccountId: null,
        logoId: null,
        heroImageId: null,
        formerOwnerId: current.ownerId,
        ownerId: null,
      },
    });
    return { products: products.count, carts: carts.count, coupons: coupons.count, conversations: conversations.count, signups: signups.count };
  });

  await writeAudit({
    actorId,
    action: "store.delete",
    entityType: "Store",
    entityId: storeId,
    summary:
      `Deleted store "${store.name}" (${store.slug})${store.ownerEmail ? ` of ${store.ownerEmail}` : ""}: removed ${plural(removed.products, "product")}, ${plural(removed.carts, "bag")}, ` +
      `${plural(removed.coupons, "coupon")}, ${plural(removed.conversations, "conversation")}, ${plural(unpaid.length, "unpaid order")} cancelled; kept ${plural(preview.keeps.orders, "order")}, ` +
      `${plural(preview.keeps.ledgerEntries, "ledger entry", "ledger entries")}, ${plural(preview.keeps.deposits, "deposit")} and ${plural(preview.keeps.payouts, "withdrawal")} on record`,
  });
  return { name: store.name, slug: store.slug, notifications };
}
