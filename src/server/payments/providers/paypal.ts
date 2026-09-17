import { WebhookVerificationError, type InitiateInput, type PaymentEvent, type PaymentProvider, type RefundInput, type WebhookOutcome } from "../types";

type PayPalOrder = {
  id: string;
  status: string;
  purchase_units?: Array<{
    reference_id?: string;
    payments?: { captures?: Array<{ id: string; status: string; amount?: { value: string; currency_code: string } }> };
  }>;
};

/**
 * PayPal Orders v2 (REST). The customer approves on PayPal, returns to /checkout/return/paypal and the
 * server captures the order — a server-to-server call whose response is authoritative. Webhooks
 * (PAYMENT.CAPTURE.*) are verified with PayPal's signature API and reconcile refunds/denials.
 */
export class PayPalProvider implements PaymentProvider {
  readonly key = "paypal";
  readonly label = "PayPal";
  readonly description = "Pay with your PayPal balance, bank account or card.";
  readonly flow = "redirect" as const;
  private readonly baseUrl: string;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly clientId: string, private readonly clientSecret: string, private readonly webhookId: string, mode: "sandbox" | "live") {
    this.baseUrl = mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  }

  isAvailable() {
    return true;
  }

  private async accessToken() {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const response = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    if (!response.ok) throw new Error(`PayPal auth failed: ${response.status}`);
    const data = (await response.json()) as { access_token: string; expires_in: number };
    this.token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return data.access_token;
  }

  private async api<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${await this.accessToken()}`,
        "Content-Type": "application/json",
        ...(init.idempotencyKey ? { "PayPal-Request-Id": init.idempotencyKey } : {}),
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) throw new Error(`PayPal ${path} failed: ${response.status} ${await response.text()}`);
    return (await response.json()) as T;
  }

  async initiate(input: InitiateInput) {
    const { order } = input;
    const money = (cents: number) => ({ currency_code: order.currency, value: (cents / 100).toFixed(2) });
    const itemTotal = order.items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
    const created = await this.api<{ id: string; links: Array<{ rel: string; href: string }> }>("/v2/checkout/orders", {
      method: "POST",
      idempotencyKey: `order-${input.paymentId}`,
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: order.number,
            custom_id: order.id,
            invoice_id: order.number,
            amount: {
              ...money(order.totalCents),
              breakdown: { item_total: money(itemTotal), shipping: money(order.shippingCents), tax_total: money(order.taxCents), discount: money(order.discountCents) },
            },
            items: order.items.map((item) => ({ name: item.name.slice(0, 127), quantity: String(item.quantity), unit_amount: money(item.unitPriceCents) })),
          },
        ],
        application_context: { brand_name: "Zendropship", user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING", return_url: input.returnUrl, cancel_url: input.cancelUrl },
      }),
    });
    const approve = created.links.find((link) => link.rel === "approve")?.href;
    if (!approve) throw new Error("PayPal did not return an approval link");
    return { kind: "redirect" as const, url: approve, providerReference: created.id };
  }

  private toEvents(order: PayPalOrder): PaymentEvent[] {
    const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
    if (order.status === "COMPLETED" && capture?.status === "COMPLETED") {
      return [{ type: "payment.succeeded", providerReference: order.id, transactionId: capture.id, amountCents: capture.amount ? Math.round(Number(capture.amount.value) * 100) : null, currency: capture.amount?.currency_code ?? null, raw: order }];
    }
    if (capture?.status === "PENDING") return [{ type: "payment.pending", providerReference: order.id, transactionId: capture.id, raw: order }];
    if (capture?.status === "DECLINED" || order.status === "VOIDED") return [{ type: "payment.failed", providerReference: order.id, transactionId: capture?.id ?? null, reason: "PayPal declined the payment", raw: order }];
    return [];
  }

  /** Called when the customer returns: capture the approved order (authoritative server-side result). */
  async verifyReturn(params: URLSearchParams, payment: { providerReference: string | null }) {
    const token = params.get("token");
    if (!token || token !== payment.providerReference) return null;
    let order: PayPalOrder;
    try {
      order = await this.api<PayPalOrder>(`/v2/checkout/orders/${token}/capture`, { method: "POST", idempotencyKey: `capture-${token}`, body: "{}" });
    } catch (error) {
      // Already captured (e.g. webhook raced us) — read the current state instead.
      if (String(error).includes("ORDER_ALREADY_CAPTURED")) order = await this.api<PayPalOrder>(`/v2/checkout/orders/${token}`);
      else throw error;
    }
    return this.toEvents(order)[0] ?? null;
  }

  async handleWebhook(request: Request): Promise<WebhookOutcome> {
    const body = await request.text();
    const headers = request.headers;
    const verification = await this.api<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", {
      method: "POST",
      body: JSON.stringify({
        auth_algo: headers.get("paypal-auth-algo"),
        cert_url: headers.get("paypal-cert-url"),
        transmission_id: headers.get("paypal-transmission-id"),
        transmission_sig: headers.get("paypal-transmission-sig"),
        transmission_time: headers.get("paypal-transmission-time"),
        webhook_id: this.webhookId,
        webhook_event: JSON.parse(body),
      }),
    });
    if (verification.verification_status !== "SUCCESS") throw new WebhookVerificationError();

    const event = JSON.parse(body) as { id: string; event_type: string; resource: Record<string, unknown> };
    const resource = event.resource;
    const orderId = ((resource.supplementary_data as { related_ids?: { order_id?: string } } | undefined)?.related_ids?.order_id ?? "") as string;
    const amount = resource.amount as { value: string; currency_code: string } | undefined;
    const events: PaymentEvent[] = [];
    if (orderId) {
      if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
        events.push({ type: "payment.succeeded", providerReference: orderId, transactionId: String(resource.id), amountCents: amount ? Math.round(Number(amount.value) * 100) : null, currency: amount?.currency_code ?? null, raw: event });
      } else if (event.event_type === "PAYMENT.CAPTURE.DENIED" || event.event_type === "PAYMENT.CAPTURE.DECLINED") {
        events.push({ type: "payment.failed", providerReference: orderId, transactionId: String(resource.id), reason: "PayPal declined the payment", raw: event });
      } else if (event.event_type === "PAYMENT.CAPTURE.PENDING") {
        events.push({ type: "payment.pending", providerReference: orderId, transactionId: String(resource.id), raw: event });
      } else if (event.event_type === "PAYMENT.CAPTURE.REFUNDED") {
        events.push({ type: "refund.succeeded", providerReference: orderId, transactionId: String(resource.id), amountCents: amount ? Math.round(Number(amount.value) * 100) : 0, raw: event });
      }
    }
    return { eventId: event.id, eventType: event.event_type, events, payload: event };
  }

  async refund(input: RefundInput) {
    if (!input.captureId) throw new Error("PayPal refunds require the capture id");
    const refund = await this.api<{ id: string; status: string }>(`/v2/payments/captures/${input.captureId}/refund`, {
      method: "POST",
      idempotencyKey: `refund-${input.captureId}-${input.amountCents}-${Date.now()}`,
      body: JSON.stringify({ amount: { currency_code: input.currency, value: (input.amountCents / 100).toFixed(2) }, note_to_payer: input.reason?.slice(0, 255) }),
    });
    return { transactionId: refund.id, status: refund.status === "COMPLETED" ? ("succeeded" as const) : ("pending" as const) };
  }
}
