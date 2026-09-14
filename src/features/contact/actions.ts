"use server";

import { after } from "next/server";
import { z } from "zod";
import { emailSchema } from "@/features/auth/schemas";
import { failure, success, zodFailure, type ActionState } from "@/server/actions";
import { db } from "@/server/db";
import { dispatchNotification, sendDeliveries } from "@/server/notifications";
import { getRequestMeta } from "@/server/request";
import { rateLimit, retryAfterMessage } from "@/server/security/rate-limit";

const schema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80),
  email: emailSchema,
  subject: z.string().trim().min(3, "Enter a subject.").max(120),
  orderNumber: z.string().trim().max(20).optional().transform((value) => value || null),
  message: z.string().trim().min(10, "Tell us a little more (10+ characters).").max(4000),
  // Honeypot: bots fill every field.
  website: z.string().max(0).optional(),
});

export async function submitContactAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({
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
  const { website: _website, ...data } = parsed.data;
  const message = await db.contactMessage.create({ data });
  after(async () => sendDeliveries(await dispatchNotification({ type: "contact.received", messageId: message.id })));
  return success("Thanks — we've received your message and will reply within one business day.");
}
