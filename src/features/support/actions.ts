"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { ContactStatus } from "@/generated/prisma/enums";
import { assertStoreOwner } from "@/features/stores/guards";
import { failure, handleActionError, success, zodFailure, type ActionState } from "@/server/actions";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { dispatchNotification, sendDeliveries } from "@/server/notifications";
import { rateLimit, retryAfterMessage } from "@/server/security/rate-limit";

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

    const reply = await db.contactReply.create({ data: { messageId: message.id, authorId: user.id, body: parsed.data.body } });
    await db.contactMessage.update({ where: { id: message.id }, data: { status: parsed.data.resolve ? ContactStatus.RESOLVED : ContactStatus.IN_PROGRESS } });
    after(async () => {
      try {
        await sendDeliveries(await dispatchNotification({ type: "contact.replied", messageId: message.id, replyId: reply.id }));
      } catch (error) {
        console.error("[support] reply email failed", error);
      }
    });
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
    const updated = await db.contactMessage.updateMany({ where: { id: String(messageId).slice(0, 40), storeId: store.id }, data: { status: status as ContactStatus } });
    if (updated.count === 0) throw new NotFoundError("That message is no longer in your inbox.");
    revalidatePath("/dashboard/support");
    return success(status === ContactStatus.RESOLVED ? "Marked resolved." : status === ContactStatus.IN_PROGRESS ? "Marked in progress." : "Reopened.");
  } catch (error) {
    return handleActionError(error);
  }
}
