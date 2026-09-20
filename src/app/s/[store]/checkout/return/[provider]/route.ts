import { after } from "next/server";
import { redirect } from "next/navigation";
import { PaymentStatus } from "@/generated/prisma/enums";
import { applyPaymentEvent, flushNotifications } from "@/features/orders/service";
import { normaliseOrderNumber } from "@/features/orders/numbers";
import { db } from "@/server/db";
import { getPaymentProvider } from "@/server/payments/registry";
import { orderAccessToken } from "@/server/notifications";

/**
 * Customer lands here after the hosted payment page. Nothing in the URL is trusted: providers that
 * support it verify server-side (PayPal capture); otherwise we simply show the order, whose status is
 * updated by the webhook (Stripe, sandbox).
 */
export async function GET(request: Request, { params }: RouteContext<"/s/[store]/checkout/return/[provider]">) {
  const { provider: providerKey, store: slug } = await params;
  const url = new URL(request.url);
  const number = normaliseOrderNumber(url.searchParams.get("order") ?? "");
  const order = number ? await db.order.findFirst({ where: { number, store: { slug } }, include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } } }) : null;
  if (!order) redirect("/cart");

  const token = orderAccessToken(order);
  const destination = `/checkout/confirmation/${order.number}?token=${token}`;
  if (url.searchParams.get("cancelled") === "1") redirect(`${destination}&payment=cancelled`);

  const provider = getPaymentProvider(providerKey);
  const payment = order.payments[0];
  if (provider?.verifyReturn && payment && order.paymentStatus !== PaymentStatus.PAID) {
    try {
      const event = await provider.verifyReturn(url.searchParams, { providerReference: payment.providerReference });
      if (event) {
        const notifications = await applyPaymentEvent(providerKey, event);
        if (notifications.length) after(() => flushNotifications(notifications));
      }
    } catch (error) {
      console.error(`[checkout:return:${providerKey}]`, error);
    }
  }
  redirect(destination);
}
