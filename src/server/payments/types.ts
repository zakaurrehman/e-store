/**
 * Payment provider abstraction. Checkout, webhooks and refunds only talk to this interface, so adding
 * Apple Pay, a regional gateway or a new PSP means adding one file under providers/ and registering it.
 *
 * Trust model: the customer's browser never reports payment status. Orders become PAID only through
 * a verified webhook or a server-to-server capture call performed by the provider implementation.
 */

export type PaymentFlow = "redirect" | "offline";

export type OrderForPayment = {
  id: string;
  number: string;
  email: string;
  currency: string;
  totalCents: number;
  items: Array<{ name: string; quantity: number; unitPriceCents: number }>;
  shippingCents: number;
  taxCents: number;
  discountCents: number;
};

export type InitiateInput = {
  order: OrderForPayment;
  paymentId: string;
  returnUrl: string;
  cancelUrl: string;
};

export type InitiateResult =
  | { kind: "redirect"; url: string; providerReference: string }
  | { kind: "offline"; providerReference: string | null };

/** Normalised event produced by webhooks and return-URL verification. */
export type PaymentEvent =
  | { type: "payment.succeeded"; providerReference: string; transactionId: string | null; amountCents: number | null; currency: string | null; raw?: unknown }
  | { type: "payment.failed"; providerReference: string; transactionId: string | null; reason: string | null; raw?: unknown }
  | { type: "payment.pending"; providerReference: string; transactionId: string | null; raw?: unknown }
  | { type: "refund.succeeded"; providerReference: string; transactionId: string | null; amountCents: number; raw?: unknown };

export type WebhookOutcome = {
  /** Unique id of the inbound event for idempotent processing */
  eventId: string;
  eventType: string;
  events: PaymentEvent[];
  payload: unknown;
};

export class WebhookVerificationError extends Error {
  constructor(message = "Webhook signature verification failed") {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

export type RefundInput = {
  providerReference: string;
  /** Provider capture/charge id when the provider needs it */
  captureId: string | null;
  amountCents: number;
  currency: string;
  reason?: string;
};

export type RefundResult = { transactionId: string | null; status: "succeeded" | "pending" };

export interface PaymentProvider {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly flow: PaymentFlow;
  /** Whether the method can be offered for this order (e.g. COD only for certain countries). */
  isAvailable(context: { country: string; totalCents: number; currency: string }): boolean;
  initiate(input: InitiateInput): Promise<InitiateResult>;
  /** Verifies and parses an inbound webhook. Throws WebhookVerificationError on bad signatures. */
  handleWebhook(request: Request): Promise<WebhookOutcome>;
  /** Optional server-side verification when the customer returns from the provider. */
  verifyReturn?(params: URLSearchParams, payment: { providerReference: string | null }): Promise<PaymentEvent | null>;
  refund(input: RefundInput): Promise<RefundResult>;
}
