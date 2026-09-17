import Stripe from "stripe";
import { WebhookVerificationError, type InitiateInput, type PaymentEvent, type PaymentProvider, type RefundInput, type WebhookOutcome } from "../types";

/**
 * Stripe Checkout (hosted). Apple Pay and Google Pay appear automatically on Checkout when enabled in the
 * Stripe dashboard. Payment status is taken exclusively from signed webhooks (checkout.session.* and
 * charge.refunded); the success URL only shows the order page.
 */
export class StripeProvider implements PaymentProvider {
  readonly key = "stripe";
  readonly label = "Card";
  readonly description = "Visa, Mastercard, American Express, Apple Pay and Google Pay via Stripe.";
  readonly flow = "redirect" as const;
  private readonly stripe: Stripe;

  constructor(secretKey: string, private readonly webhookSecret: string) {
    // The SDK pins its own API version; overriding it risks type/runtime drift.
    this.stripe = new Stripe(secretKey, { appInfo: { name: "Zendropship" } });
  }

  isAvailable() {
    return true;
  }

  async initiate(input: InitiateInput) {
    const { order } = input;
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: order.number,
        customer_email: order.email,
        success_url: input.returnUrl,
        cancel_url: input.cancelUrl,
        metadata: { orderId: order.id, orderNumber: order.number, paymentId: input.paymentId },
        payment_intent_data: { metadata: { orderId: order.id, orderNumber: order.number, paymentId: input.paymentId } },
        line_items: [
          ...order.items.map((item) => ({
            quantity: item.quantity,
            price_data: { currency: order.currency.toLowerCase(), unit_amount: item.unitPriceCents, product_data: { name: item.name } },
          })),
          ...(order.shippingCents > 0 ? [{ quantity: 1, price_data: { currency: order.currency.toLowerCase(), unit_amount: order.shippingCents, product_data: { name: "Shipping" } } }] : []),
          ...(order.taxCents > 0 ? [{ quantity: 1, price_data: { currency: order.currency.toLowerCase(), unit_amount: order.taxCents, product_data: { name: "Tax" } } }] : []),
        ],
        ...(order.discountCents > 0
          ? {
              discounts: [
                {
                  coupon: (
                    await this.stripe.coupons.create({ amount_off: order.discountCents, currency: order.currency.toLowerCase(), duration: "once", name: `Order ${order.number} discount` })
                  ).id,
                },
              ],
            }
          : {}),
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
      },
      { idempotencyKey: `checkout-${input.paymentId}` },
    );
    if (!session.url) throw new Error("Stripe did not return a Checkout URL");
    return { kind: "redirect" as const, url: session.url, providerReference: session.id };
  }

  async handleWebhook(request: Request): Promise<WebhookOutcome> {
    const signature = request.headers.get("stripe-signature");
    const body = await request.text();
    if (!signature) throw new WebhookVerificationError("Missing stripe-signature header");
    let event: Stripe.Event;
    try {
      event = await this.stripe.webhooks.constructEventAsync(body, signature, this.webhookSecret);
    } catch (error) {
      throw new WebhookVerificationError(error instanceof Error ? error.message : "Invalid signature");
    }

    const events: PaymentEvent[] = [];
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
        if (session.payment_status === "paid") {
          events.push({ type: "payment.succeeded", providerReference: session.id, transactionId: paymentIntent, amountCents: session.amount_total, currency: session.currency?.toUpperCase() ?? null, raw: session });
        } else {
          events.push({ type: "payment.pending", providerReference: session.id, transactionId: paymentIntent, raw: session });
        }
        break;
      }
      case "checkout.session.async_payment_failed": {
        const session = event.data.object;
        events.push({ type: "payment.failed", providerReference: session.id, transactionId: typeof session.payment_intent === "string" ? session.payment_intent : null, reason: "Payment could not be completed", raw: session });
        break;
      }
      case "checkout.session.expired": {
        const session = event.data.object;
        events.push({ type: "payment.failed", providerReference: session.id, transactionId: null, reason: "Checkout session expired", raw: session });
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object;
        const paymentIntent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
        if (paymentIntent) {
          const sessions = await this.stripe.checkout.sessions.list({ payment_intent: paymentIntent, limit: 1 });
          const session = sessions.data[0];
          if (session) {
            const latestRefund = charge.refunds?.data?.[0];
            events.push({ type: "refund.succeeded", providerReference: session.id, transactionId: latestRefund?.id ?? null, amountCents: latestRefund?.amount ?? charge.amount_refunded, raw: charge });
          }
        }
        break;
      }
      default:
        break;
    }
    return { eventId: event.id, eventType: event.type, events, payload: event };
  }

  async refund(input: RefundInput) {
    const session = await this.stripe.checkout.sessions.retrieve(input.providerReference);
    const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    if (!paymentIntent) throw new Error("No payment intent found for this Stripe session");
    const refund = await this.stripe.refunds.create(
      { payment_intent: paymentIntent, amount: input.amountCents, reason: "requested_by_customer", metadata: { reason: input.reason ?? "" } },
      { idempotencyKey: `refund-${input.providerReference}-${input.amountCents}-${Date.now()}` },
    );
    return { transactionId: refund.id, status: refund.status === "succeeded" ? ("succeeded" as const) : ("pending" as const) };
  }
}
