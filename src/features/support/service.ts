import "server-only";
import { ContactStatus } from "@/generated/prisma/enums";
import { db, type DbClient } from "@/server/db";
import { DomainError, NotFoundError } from "@/server/errors";

export class SupportError extends DomainError {}

/** Who is writing: the customer, or whoever answers for the store (its owner, or Zendropship staff). */
export type SupportAuthor = { kind: "customer"; userId: string | null } | { kind: "agent"; userId: string; internal?: boolean };

export type NewConversation = {
  /** The store the customer wrote to; null for a message to Zendropship itself. */
  storeId: string | null;
  userId?: string | null;
  name: string;
  email: string;
  subject: string;
  message: string;
  orderNumber?: string | null;
  /** A deposit or withdrawal the question is about; checked against the writer's own store. */
  depositId?: string | null;
  payoutId?: string | null;
};

/**
 * Opens a conversation. When the customer quotes an order number, the order is linked if it really is
 * theirs in this store, so staff and owners see the order beside the question without being able to fish
 * for other people's orders by guessing numbers.
 */
export async function openConversation(input: NewConversation, client: DbClient = db) {
  const orderNumber = input.orderNumber?.trim().toUpperCase() || null;
  const order = orderNumber
    ? await client.order.findFirst({
        where: {
          number: orderNumber,
          ...(input.storeId ? { storeId: input.storeId } : {}),
          OR: [{ email: input.email.toLowerCase() }, ...(input.userId ? [{ userId: input.userId }] : [])],
        },
        select: { id: true },
      })
    : null;

  return client.contactMessage.create({
    data: {
      storeId: input.storeId,
      userId: input.userId ?? null,
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      subject: input.subject.trim(),
      message: input.message.trim(),
      orderNumber,
      orderId: order?.id ?? null,
      depositId: input.depositId ?? null,
      payoutId: input.payoutId ?? null,
      status: ContactStatus.NEW,
      unreadForStaff: true,
      unreadForCustomer: false,
      lastMessageAt: new Date(),
    },
  });
}

/** Adds a turn to a conversation and moves its state along. Returns the reply and the conversation. */
export async function addReply(messageId: string, body: string, author: SupportAuthor, options: { resolve?: boolean } = {}, client: DbClient = db) {
  const text = body.trim();
  if (text.length < 2) throw new SupportError("REPLY_EMPTY", "Write a message first.", { fieldErrors: { body: ["Write a message first."] } });
  if (text.length > 4000) throw new SupportError("REPLY_TOO_LONG", "Keep it under 4000 characters.", { fieldErrors: { body: ["Keep it under 4000 characters."] } });
  const conversation = await client.contactMessage.findUnique({ where: { id: messageId } });
  if (!conversation) throw new NotFoundError("That conversation no longer exists.");

  const fromCustomer = author.kind === "customer";
  const internal = author.kind === "agent" && !!author.internal;
  const reply = await client.contactReply.create({
    data: { messageId, authorId: author.userId, body: text.slice(0, 4000), isFromCustomer: fromCustomer, isInternal: internal },
  });
  const updated = await client.contactMessage.update({
    where: { id: messageId },
    data: {
      // An internal note changes nothing the customer can see, and re-opens nothing.
      ...(internal
        ? {}
        : {
            lastMessageAt: new Date(),
            status: fromCustomer ? ContactStatus.NEW : options.resolve ? ContactStatus.RESOLVED : ContactStatus.IN_PROGRESS,
            unreadForStaff: fromCustomer,
            unreadForCustomer: !fromCustomer,
          }),
    },
  });
  return { reply, conversation: updated };
}

/** Marks a thread read for whoever just opened it. */
export async function markConversationRead(messageId: string, side: "staff" | "customer", client: DbClient = db) {
  await client.contactMessage.updateMany({
    where: { id: messageId },
    data: side === "staff" ? { unreadForStaff: false } : { unreadForCustomer: false },
  });
}

export async function setConversationStatus(messageId: string, status: ContactStatus, client: DbClient = db) {
  return client.contactMessage.update({ where: { id: messageId }, data: { status, ...(status === ContactStatus.RESOLVED ? { unreadForStaff: false } : {}) } });
}

/** Zendropship staff take ownership of a conversation (or hand it back). */
export async function assignConversation(messageId: string, assignedToId: string | null, client: DbClient = db) {
  if (assignedToId) {
    const staff = await client.user.findFirst({ where: { id: assignedToId, deletedAt: null, role: { isStaff: true } }, select: { id: true } });
    if (!staff) throw new SupportError("NOT_STAFF", "That person is not a staff member.");
  }
  return client.contactMessage.update({ where: { id: messageId }, data: { assignedToId } });
}
