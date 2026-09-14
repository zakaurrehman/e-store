"use server";

import { z } from "zod";
import { failure, success, type ActionState } from "@/server/actions";
import { db } from "@/server/db";
import { getRequestMeta } from "@/server/request";
import { rateLimit, retryAfterMessage } from "@/server/security/rate-limit";

const schema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")), source: z.string().max(40).optional() });

export async function subscribeToNewsletter(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({ email: formData.get("email"), source: formData.get("source") ?? undefined });
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Enter a valid email address.", { email: ["Enter a valid email address."] });
  const meta = await getRequestMeta();
  const limit = await rateLimit("newsletter", meta.ipAddress);
  if (!limit.success) return failure(retryAfterMessage(limit.resetAt));
  await db.newsletterSubscriber.upsert({
    where: { email: parsed.data.email },
    create: { email: parsed.data.email, source: parsed.data.source ?? "footer" },
    update: { unsubscribedAt: null },
  });
  // Same response whether new or existing, so subscription status isn't disclosed.
  return success("You're on the list. Look out for new arrivals and early access in your inbox.");
}
