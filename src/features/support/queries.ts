import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { ContactStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";

export const SUPPORT_PAGE_SIZE = 20;

export const SUPPORT_STATUS_LABELS: Record<ContactStatus, string> = { NEW: "New", IN_PROGRESS: "In progress", RESOLVED: "Resolved" };
export const SUPPORT_STATUS_TONES: Record<ContactStatus, "warning" | "info" | "success"> = { NEW: "warning", IN_PROGRESS: "info", RESOLVED: "success" };

/** The same states in the customer's words: "new" is the store's to-do, not something the customer did. */
export const CUSTOMER_SUPPORT_STATUS_LABELS: Record<ContactStatus, string> = { NEW: "Waiting for a reply", IN_PROGRESS: "Answered", RESOLVED: "Resolved" };
export const CUSTOMER_SUPPORT_STATUS_TONES: Record<ContactStatus, "neutral" | "info" | "success"> = { NEW: "neutral", IN_PROGRESS: "info", RESOLVED: "success" };

export const parseSupportStatus = (value: unknown): ContactStatus | undefined =>
  typeof value === "string" && value in ContactStatus ? (value as ContactStatus) : undefined;

const listSelect = {
  id: true,
  name: true,
  email: true,
  subject: true,
  status: true,
  orderNumber: true,
  unreadForStaff: true,
  unreadForCustomer: true,
  lastMessageAt: true,
  createdAt: true,
  _count: { select: { replies: true } },
} satisfies Prisma.ContactMessageSelect;

/** The money a conversation is about, for the panel beside the thread. */
const moneyInclude = {
  deposit: { select: { id: true, amountCents: true, status: true, method: true, network: true, reference: true, createdAt: true } },
  payout: { select: { id: true, amountCents: true, status: true, method: true, destination: true, createdAt: true } },
} as const;

const threadInclude = {
  ...moneyInclude,
  order: { select: { id: true, number: true, status: true, totalCents: true, currency: true } },
  store: { select: { id: true, slug: true, name: true, ownerId: true, logo: { select: { url: true, width: true, height: true } } } },
  user: { select: { id: true, email: true, firstName: true, lastName: true, createdAt: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
  replies: { orderBy: { createdAt: "asc" as const }, include: { author: { select: { id: true, firstName: true, lastName: true } } } },
} satisfies Prisma.ContactMessageInclude;

function summarise(counts: Array<{ status: ContactStatus; _count: { _all: number } }>) {
  return Object.fromEntries(counts.map((row) => [row.status, row._count._all])) as Partial<Record<ContactStatus, number>>;
}

// ─── The store owner's inbox ─────────────────────────────────────────────────

/** Conversations with this store's customers, newest activity first, with the counts behind the filters. */
export async function listStoreMessages(storeId: string, options: { status?: ContactStatus; q?: string; page?: number; pageSize?: number } = {}) {
  const pageSize = options.pageSize ?? SUPPORT_PAGE_SIZE;
  const page = Math.max(1, options.page ?? 1);
  const q = options.q?.trim().slice(0, 80);
  const where: Prisma.ContactMessageWhereInput = {
    storeId,
    ...(options.status ? { status: options.status } : {}),
    ...(q ? { OR: [{ subject: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { message: { contains: q, mode: "insensitive" } }, { orderNumber: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [total, messages, counts, unread] = await Promise.all([
    db.contactMessage.count({ where }),
    db.contactMessage.findMany({ where, orderBy: { lastMessageAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select: listSelect }),
    db.contactMessage.groupBy({ by: ["status"], where: { storeId }, _count: { _all: true } }),
    db.contactMessage.count({ where: { storeId, unreadForStaff: true } }),
  ]);
  return { total, page, pageCount: Math.max(1, Math.ceil(total / pageSize)), messages, counts: summarise(counts), unread };
}

/** One conversation with its history — only if it belongs to this store. */
export async function getStoreMessage(storeId: string, messageId: string) {
  const message = await db.contactMessage.findFirst({ where: { id: messageId, storeId }, include: threadInclude });
  if (!message) return null;
  // Internal notes are for Zendropship staff; the store owner sees the conversation itself.
  return { ...message, replies: message.replies.filter((reply) => !reply.isInternal) };
}

/** The owner's own questions to Zendropship (conversations they opened on the platform site). */
export async function listOwnerTickets(userId: string, take = 10) {
  return db.contactMessage.findMany({
    where: { userId, storeId: null },
    orderBy: { lastMessageAt: "desc" },
    take,
    select: { ...listSelect, message: true, ...moneyInclude },
  });
}

/** How many of the owner's tickets have a reply they have not read — the badge in the dashboard menu. */
export async function countUnreadOwnerTickets(userId: string) {
  return db.contactMessage.count({ where: { userId, storeId: null, unreadForCustomer: true } });
}

/**
 * One of the owner's own tickets, with the whole thread. Scoped to their account and to conversations
 * with Zendropship, so an id from the browser can never open someone else's or a store's conversation.
 */
export async function getOwnerTicket(userId: string, ticketId: string) {
  const ticket = await db.contactMessage.findFirst({
    where: { id: ticketId, userId, storeId: null },
    include: {
      ...moneyInclude,
      order: { select: { id: true, number: true, status: true, totalCents: true, currency: true } },
      replies: { where: { isInternal: false }, orderBy: { createdAt: "asc" }, include: { author: { select: { firstName: true, lastName: true } } } },
    },
  });
  return ticket;
}

export type OwnerTicket = NonNullable<Awaited<ReturnType<typeof getOwnerTicket>>>;

// ─── Zendropship staff inbox ─────────────────────────────────────────────────

export type StaffInboxOptions = { status?: ContactStatus; q?: string; page?: number; scope?: "all" | "platform" | "stores" | "mine"; assignedToId?: string };

/** Every conversation on the platform: messages to Zendropship and messages in owners' stores. */
export async function listSupportConversations(options: StaffInboxOptions = {}) {
  const page = Math.max(1, options.page ?? 1);
  const q = options.q?.trim().slice(0, 80);
  const scope: Prisma.ContactMessageWhereInput =
    options.scope === "platform" ? { storeId: null } : options.scope === "stores" ? { NOT: { storeId: null } } : options.scope === "mine" ? { assignedToId: options.assignedToId ?? "none" } : {};
  const where: Prisma.ContactMessageWhereInput = {
    ...scope,
    ...(options.status ? { status: options.status } : {}),
    ...(q
      ? {
          OR: [
            { subject: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { message: { contains: q, mode: "insensitive" } },
            { orderNumber: { contains: q, mode: "insensitive" } },
            { store: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [total, conversations, counts, unread] = await Promise.all([
    db.contactMessage.count({ where }),
    db.contactMessage.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      skip: (page - 1) * SUPPORT_PAGE_SIZE,
      take: SUPPORT_PAGE_SIZE,
      select: { ...listSelect, store: { select: { slug: true, name: true } }, assignedTo: { select: { firstName: true, lastName: true } } },
    }),
    db.contactMessage.groupBy({ by: ["status"], _count: { _all: true } }),
    db.contactMessage.count({ where: { unreadForStaff: true } }),
  ]);
  return { total, page, pageCount: Math.max(1, Math.ceil(total / SUPPORT_PAGE_SIZE)), conversations, counts: summarise(counts), unread };
}

/** One conversation for staff, internal notes included. */
export async function getSupportConversation(messageId: string) {
  return db.contactMessage.findUnique({ where: { id: messageId }, include: threadInclude });
}

export async function staffMembers() {
  return db.user.findMany({ where: { deletedAt: null, status: "ACTIVE", role: { isStaff: true } }, orderBy: { firstName: "asc" }, select: { id: true, firstName: true, lastName: true } });
}

// ─── The customer's own view ─────────────────────────────────────────────────

/** A customer's conversations in one store. Scoped to their own account: ids from the client are never trusted. */
export async function listCustomerConversations(userId: string, storeId: string | null) {
  return db.contactMessage.findMany({
    where: { userId, storeId },
    orderBy: { lastMessageAt: "desc" },
    take: 50,
    select: { ...listSelect, message: true },
  });
}

/** One of the customer's own conversations, without internal notes. */
export async function getCustomerConversation(userId: string, storeId: string | null, messageId: string) {
  const message = await db.contactMessage.findFirst({
    where: { id: messageId, userId, storeId },
    include: { order: { select: { number: true, status: true } }, replies: { where: { isInternal: false }, orderBy: { createdAt: "asc" }, include: { author: { select: { firstName: true } } } } },
  });
  return message;
}

export async function countUnreadForCustomer(userId: string, storeId: string | null) {
  return db.contactMessage.count({ where: { userId, storeId, unreadForCustomer: true } });
}

/**
 * The visitor's own conversations for the floating customer-service panel: the last few, each with its
 * turns, so the panel can carry one on without a page of its own. Internal notes are never included.
 */
export async function widgetThreads(userId: string, storeId: string | null, take = 6) {
  return db.contactMessage.findMany({
    where: { userId, storeId },
    orderBy: { lastMessageAt: "desc" },
    take,
    select: {
      id: true,
      subject: true,
      message: true,
      status: true,
      unreadForCustomer: true,
      lastMessageAt: true,
      createdAt: true,
      replies: { where: { isInternal: false }, orderBy: { createdAt: "asc" }, select: { id: true, body: true, isFromCustomer: true, createdAt: true } },
    },
  });
}
