"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { ContactStatus } from "@/generated/prisma/enums";
import { emailSchema } from "@/features/auth/schemas";
import { assertStoreOwner } from "@/features/stores/guards";
import { getCurrentStore } from "@/features/stores/current";
import { failure, handleActionError, success, zodFailure, type ActionState } from "@/server/actions";
import { assertPermission, assertSignedIn } from "@/server/auth/guards";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { dispatchNotification, sendDeliveries } from "@/server/notifications";
import { getRequestMeta } from "@/server/request";
import { rateLimit, retryAfterMessage } from "@/server/security/rate-limit";
import { addReply, assignConversation, markConversationRead, openConversation, setConversationStatus } from "./service";

/** Emails are queued inside the request and sent once the response has gone out. */
function sendAfter(events: Array<Parameters<typeof dispatchNotification>[0]>) {
  after(async () => {
    for (const event of events) {
      try {
        await sendDeliveries(await dispatchNotification(event));
      } catch (error) {
        console.error(`[support] ${event.type} notification failed`, error);
      }
    }
  });
}

// ─── The store owner answers their customers ─────────────────────────────────

const replySchema = z.object({
  messageId: z.string().min(1).max(40),
  body: z.string().trim().min(2, "Write a reply first.").max(4000, "Keep the reply under 4000 characters."),
  resolve: z.union([z.literal("on"), z.literal("true"), z.literal(""), z.undefined()]).transform((value) => value === "on" || value === "true"),
});

/** Owner replies to a customer: the reply is emailed in the store's name and kept in the thread. */
export async function replyToMessageAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = replySchema.safeParse({ messageId: formData.get("messageId"), body: formData.get("body"), resolve: formData.get("resolve") ?? undefined });
  if (!parsed.success) return zodFailure(parsed.error);
  try {
    const { user, store } = await assertStoreOwner();
    const limit = await rateLimit("contact", `reply:${user.id}`, { limit: 60, windowMs: 60 * 60_000 });
    if (!limit.success) return failure(retryAfterMessage(limit.resetAt));

    const message = await db.contactMessage.findFirst({ where: { id: parsed.data.messageId, storeId: store.id }, select: { id: true } });
    if (!message) throw new NotFoundError("That message is no longer in your inbox.");

    const { reply } = await addReply(message.id, parsed.data.body, { kind: "agent", userId: user.id }, { resolve: parsed.data.resolve });
    sendAfter([{ type: "contact.replied", messageId: message.id, replyId: reply.id }]);
    revalidatePath("/dashboard/support");
    return success(parsed.data.resolve ? "Reply sent and the message is marked resolved." : "Reply sent.");
  } catch (error) {
    return handleActionError(error);
  }
}

export async function setStoreMessageStatusAction(messageId: string, status: string): Promise<ActionState> {
  if (!(status in ContactStatus)) return failure("Unknown status.");
  try {
    const { store } = await assertStoreOwner();
    const message = await db.contactMessage.findFirst({ where: { id: String(messageId).slice(0, 40), storeId: store.id }, select: { id: true } });
    if (!message) throw new NotFoundError("That message is no longer in your inbox.");
    await setConversationStatus(message.id, status as ContactStatus);
    revalidatePath("/dashboard/support");
    return success(status === ContactStatus.RESOLVED ? "Marked resolved." : status === ContactStatus.IN_PROGRESS ? "Marked in progress." : "Reopened.");
  } catch (error) {
    return handleActionError(error);
  }
}

/** Opening a thread clears its "new activity" mark for the inbox that just read it. */
export async function markStoreMessageReadAction(messageId: string): Promise<void> {
  try {
    const { store } = await assertStoreOwner();
    const message = await db.contactMessage.findFirst({ where: { id: String(messageId).slice(0, 40), storeId: store.id }, select: { id: true } });
    if (message) await markConversationRead(message.id, "staff");
  } catch {
    // Reading is best-effort: never fail the page for it.
  }
}

// ─── The customer writes in ──────────────────────────────────────────────────

const newConversationSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80),
  email: emailSchema,
  subject: z.string().trim().min(3, "Enter a subject.").max(120),
  orderNumber: z.string().trim().max(20).optional().transform((value) => value || null),
  message: z.string().trim().min(10, "Tell us a little more (10+ characters).").max(4000),
  // Honeypot: bots fill every field.
  website: z.string().max(0).optional(),
});

/**
 * A customer (or a visitor) opens a conversation with the store they are on — or with Zendropship on the
 * platform site. Signed-in customers can then follow the thread in their account; guests get email replies.
 */
export async function startConversationAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = newConversationSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    subject: formData.get("subject"),
    orderNumber: formData.get("orderNumber") ?? undefined,
    message: formData.get("message"),
    website: formData.get("website") ?? undefined,
  });
  if (!parsed.success) {
    if (parsed.error.issues.some((issue) => issue.path[0] === "website")) return success("Thanks — we've received your message.");
    return zodFailure(parsed.error);
  }
  const meta = await getRequestMeta();
  const limit = await rateLimit("contact", meta.ipAddress);
  if (!limit.success) return failure(retryAfterMessage(limit.resetAt));

  const [user, store] = await Promise.all([getCurrentUser(), getCurrentStore()]);
  const { website: _website, ...data } = parsed.data;
  const conversation = await openConversation({ ...data, storeId: store?.id ?? null, userId: user?.id ?? null });
  sendAfter([{ type: "contact.received", messageId: conversation.id }]);
  if (user) redirect(`/support/${conversation.id}?sent=1`);
  return success("Thanks — we've received your message and will reply within one business day.");
}

const customerReplySchema = z.object({ messageId: z.string().min(1).max(40), body: z.string().trim().min(2, "Write your message first.").max(4000, "Keep it under 4000 characters.") });

/** A signed-in customer writes back in their own thread. */
export async function customerReplyAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = customerReplySchema.safeParse({ messageId: formData.get("messageId"), body: formData.get("body") });
  if (!parsed.success) return zodFailure(parsed.error);
  try {
    const user = await assertSignedIn();
    const limit = await rateLimit("contact", `customer:${user.id}`, { limit: 30, windowMs: 60 * 60_000 });
    if (!limit.success) return failure(retryAfterMessage(limit.resetAt));
    const store = await getCurrentStore();
    // Only the customer's own conversation, in the store they are writing from.
    const conversation = await db.contactMessage.findFirst({ where: { id: parsed.data.messageId, userId: user.id, storeId: store?.id ?? null }, select: { id: true } });
    if (!conversation) throw new NotFoundError("That conversation no longer exists.");
    const { reply } = await addReply(conversation.id, parsed.data.body, { kind: "customer", userId: user.id });
    sendAfter([{ type: "support.customer-replied", messageId: conversation.id, replyId: reply.id }]);
    revalidatePath(`/support/${conversation.id}`);
    return success("Message sent.");
  } catch (error) {
    return handleActionError(error);
  }
}

/** Clears the customer's unread mark when they open a thread. */
export async function markCustomerConversationReadAction(messageId: string): Promise<void> {
  try {
    const user = await getCurrentUser();
    if (!user) return;
    const store = await getCurrentStore();
    const conversation = await db.contactMessage.findFirst({ where: { id: String(messageId).slice(0, 40), userId: user.id, storeId: store?.id ?? null }, select: { id: true } });
    if (conversation) await markConversationRead(conversation.id, "customer");
  } catch {
    // Best-effort.
  }
}

// ─── Zendropship staff ───────────────────────────────────────────────────────

const staffReplySchema = replySchema.extend({
  internal: z.union([z.literal("on"), z.literal("true"), z.literal(""), z.undefined()]).transform((value) => value === "on" || value === "true"),
});

export async function staffReplyAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = staffReplySchema.safeParse({
    messageId: formData.get("messageId"),
    body: formData.get("body"),
    resolve: formData.get("resolve") ?? undefined,
    internal: formData.get("internal") ?? undefined,
  });
  if (!parsed.success) return zodFailure(parsed.error);
  try {
    const staff = await assertPermission("messages.view");
    const { reply, conversation } = await addReply(parsed.data.messageId, parsed.data.body, { kind: "agent", userId: staff.id, internal: parsed.data.internal }, { resolve: parsed.data.resolve });
    if (!parsed.data.internal) sendAfter([{ type: "contact.replied", messageId: conversation.id, replyId: reply.id }]);
    revalidatePath("/admin/messages");
    return success(parsed.data.internal ? "Note saved — the customer cannot see it." : parsed.data.resolve ? "Reply sent and the conversation is resolved." : "Reply sent.");
  } catch (error) {
    return handleActionError(error);
  }
}

export async function setConversationStatusAction(messageId: string, status: string): Promise<ActionState> {
  if (!(status in ContactStatus)) return failure("Unknown status.");
  try {
    await assertPermission("messages.view");
    await setConversationStatus(String(messageId).slice(0, 40), status as ContactStatus);
    revalidatePath("/admin/messages");
    return success(status === ContactStatus.RESOLVED ? "Marked resolved." : status === ContactStatus.IN_PROGRESS ? "Marked in progress." : "Reopened.");
  } catch (error) {
    return handleActionError(error);
  }
}

export async function assignConversationAction(messageId: string, assignedToId: string | null): Promise<ActionState> {
  try {
    const staff = await assertPermission("messages.view");
    const target = assignedToId === "me" ? staff.id : assignedToId ? String(assignedToId).slice(0, 40) : null;
    await assignConversation(String(messageId).slice(0, 40), target);
    revalidatePath("/admin/messages");
    return success(target ? "Assigned." : "Assignment cleared.");
  } catch (error) {
    return handleActionError(error);
  }
}

export async function markConversationReadAction(messageId: string): Promise<void> {
  try {
    await assertPermission("messages.view");
    await markConversationRead(String(messageId).slice(0, 40), "staff");
  } catch {
    // Best-effort.
  }
}
