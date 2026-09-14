"use server";

import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { flushNotifications, processWebhook } from "@/features/orders/service";
import { db } from "@/server/db";
import { orderAccessToken } from "@/server/notifications";
import { getPaymentProvider } from "@/server/payments/registry";
import type { SandboxProvider } from "@/server/payments/providers/sandbox";

/** Delivers the chosen sandbox outcome to the store through the signed webhook endpoint logic. */
export async function sandboxDecisionAction(formData: FormData) {
  const paymentId = String(formData.get("paymentId") ?? "");
  const signature = String(formData.get("sig") ?? "");
  const provider = getPaymentProvider("sandbox") as SandboxProvider | null;
  if (!provider || !provider.verifyPageSignature(paymentId, signature)) notFound();
  const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { order: { select: { number: true, email: true, userId: true } } } });
  if (!payment?.providerReference) notFound();

  const type = String(formData.get("outcome")) === "succeeded" ? "succeeded" : "failed";
  const request = provider.buildWebhookRequest({
    id: `evt_${paymentId}_${type}_${Date.now()}`,
    type,
    providerReference: payment.providerReference,
    amountCents: payment.amountCents,
    currency: payment.currency,
    reason: type === "failed" ? "Card declined (simulated)" : undefined,
  });
  const { notifications } = await processWebhook("sandbox", request);
  if (notifications.length) after(() => flushNotifications(notifications));
  // Real providers return through /checkout/return/[provider]; the simulator can go straight to the order page.
  redirect(`/checkout/confirmation/${payment.order.number}?token=${orderAccessToken(payment.order)}${type === "failed" ? "&failed=1" : ""}`);
}
