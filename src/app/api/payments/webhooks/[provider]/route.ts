import { after } from "next/server";
import { flushNotifications, processWebhook } from "@/features/orders/service";
import { isDomainError } from "@/server/errors";
import { WebhookVerificationError } from "@/server/payments/types";

/**
 * Inbound payment webhooks. Signatures are verified by the provider implementation; events are stored
 * and processed once (duplicates are acknowledged with 200 so providers stop retrying).
 */
export async function POST(request: Request, { params }: RouteContext<"/api/payments/webhooks/[provider]">) {
  const { provider } = await params;
  try {
    const { duplicate, notifications } = await processWebhook(provider, request);
    if (notifications.length) after(() => flushNotifications(notifications));
    return Response.json({ received: true, duplicate });
  } catch (error) {
    if (error instanceof WebhookVerificationError) return new Response("Invalid signature", { status: 400 });
    if (isDomainError(error)) return new Response(error.message, { status: error.status });
    console.error(`[webhooks:${provider}]`, error);
    // 500 makes the provider retry later.
    return new Response("Webhook processing failed", { status: 500 });
  }
}
