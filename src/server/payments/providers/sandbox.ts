import { createHmac } from "node:crypto";
import { safeEqual } from "@/server/security/crypto";
import { WebhookVerificationError, type InitiateInput, type PaymentEvent, type PaymentProvider, type RefundInput, type WebhookOutcome } from "../types";

/**
 * Local test gateway. Mirrors a real redirect provider end to end: the customer is sent to a hosted
 * page, chooses an outcome, and the outcome reaches the store only through a signed webhook.
 * Refused in production unless ALLOW_SANDBOX_PAYMENTS=true (see env validation).
 */
export class SandboxProvider implements PaymentProvider {
  readonly key = "sandbox";
  readonly label = "Test card";
  readonly description = "Simulated payment for testing — no real money moves.";
  readonly flow = "redirect" as const;

  constructor(private readonly secret: string, private readonly appUrl: string) {}

  isAvailable() {
    return true;
  }

  sign(body: string) {
    return createHmac("sha256", this.secret).update(body).digest("hex");
  }

  async initiate(input: InitiateInput) {
    const providerReference = `sbx_${input.paymentId}`;
    // The simulator page lives on the same store domain as the checkout it returns to.
    const url = new URL(`/checkout/sandbox/${input.paymentId}`, new URL(input.returnUrl).origin);
    url.searchParams.set("sig", this.sign(input.paymentId));
    return { kind: "redirect" as const, url: url.toString(), providerReference };
  }

  /** Verifies the page signature so only links we issued can open the simulator. */
  verifyPageSignature(paymentId: string, signature: string | null) {
    return !!signature && safeEqual(signature, this.sign(paymentId));
  }

  buildWebhookRequest(event: { id: string; type: "succeeded" | "failed" | "refunded"; providerReference: string; amountCents: number; currency: string; reason?: string }) {
    const body = JSON.stringify(event);
    return new Request(new URL("/api/payments/webhooks/sandbox", this.appUrl), {
      method: "POST",
      headers: { "content-type": "application/json", "x-sandbox-signature": this.sign(body) },
      body,
    });
  }

  async handleWebhook(request: Request): Promise<WebhookOutcome> {
    const body = await request.text();
    const signature = request.headers.get("x-sandbox-signature") ?? "";
    if (!signature || !safeEqual(signature, this.sign(body))) throw new WebhookVerificationError();
    const payload = JSON.parse(body) as { id: string; type: string; providerReference: string; amountCents: number; currency: string; reason?: string };
    const transactionId = `sbx_txn_${payload.id}`;
    let events: PaymentEvent[] = [];
    if (payload.type === "succeeded") {
      events = [{ type: "payment.succeeded", providerReference: payload.providerReference, transactionId, amountCents: payload.amountCents, currency: payload.currency, raw: payload }];
    } else if (payload.type === "failed") {
      events = [{ type: "payment.failed", providerReference: payload.providerReference, transactionId, reason: payload.reason ?? "Card declined (simulated)", raw: payload }];
    } else if (payload.type === "refunded") {
      events = [{ type: "refund.succeeded", providerReference: payload.providerReference, transactionId, amountCents: payload.amountCents, raw: payload }];
    }
    return { eventId: payload.id, eventType: payload.type, events, payload };
  }

  async refund(input: RefundInput) {
    return { transactionId: `sbx_refund_${Date.now()}_${input.amountCents}`, status: "succeeded" as const };
  }
}
